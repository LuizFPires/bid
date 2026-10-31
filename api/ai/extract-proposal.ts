import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { extrairPropostaDePdf, type MidiaProposta } from '@bid/server';
import { MissingEnvError, env } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { userClient } from '@bid/server';

/**
 * POST /api/ai/extract-proposal
 * Entrada: { path } — caminho do PDF já enviado ao bucket privado `propostas`.
 * Saída: { dados } — PropostaExtraida para CONFERÊNCIA (não grava nada).
 *
 * Segurança: exige Bearer do usuário; a URL assinada é criada no contexto do
 * usuário (RLS), então só funciona para arquivos que ele mesmo pode ler. O
 * caminho precisa estar na pasta do usuário (`{org}/{user}/…`). A IA roda só
 * no servidor.
 */
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** PDF ou imagem (print/foto) — os dois são lidos pela IA. */
function tipoPorExtensao(path: string): MidiaProposta {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/pdf';
}

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ erro: 'Não autenticado.' });
    return;
  }

  const path = (req.body as { path?: unknown } | null)?.path;
  if (typeof path !== 'string' || !path.trim()) {
    res.status(400).json({ erro: 'Informe o caminho do arquivo (path).' });
    return;
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    res.status(401).json({ erro: 'Sessão inválida.' });
    return;
  }

  // O arquivo precisa estar na pasta do próprio usuário: {org_id}/{user_id}/arquivo.
  // (A barreira real de posse é a RLS do createSignedUrl abaixo; esta checagem
  // é defesa em profundidade e rejeita caminhos malformados cedo.)
  const partes = path.split('/');
  if (partes.length < 3 || !partes[0] || partes[1] !== userData.user.id) {
    res.status(403).json({ erro: 'Arquivo fora da pasta do usuário.' });
    return;
  }

  const { data: signed, error: signErr } = await sb.storage
    .from('propostas')
    .createSignedUrl(path, 60);
  if (signErr || !signed) {
    res.status(404).json({ erro: 'Arquivo não encontrado ou sem acesso.' });
    return;
  }

  const resp = await fetch(signed.signedUrl);
  if (!resp.ok || !resp.body) {
    res.status(502).json({ erro: 'Falha ao ler o arquivo do Storage.' });
    return;
  }

  // Corta ANTES de baixar: o Content-Length do objeto evita bufferizar à toa.
  const declarado = Number(resp.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    res.status(413).json({ erro: 'Arquivo grande demais para extração (máx. 8 MB).' });
    return;
  }

  // Defesa extra: lê em pedaços com contador e aborta se passar do limite
  // (caso o Content-Length esteja ausente ou mentir).
  const pedacos: Uint8Array[] = [];
  let total = 0;
  const reader = resp.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      res.status(413).json({ erro: 'Arquivo grande demais para extração (máx. 8 MB).' });
      return;
    }
    pedacos.push(value);
  }
  const buf = Buffer.concat(pedacos);

  try {
    // SDK criado AQUI (na função), com o pacote real que o Vercel instala.
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const dados = await extrairPropostaDePdf(client, buf.toString('base64'), tipoPorExtensao(path));
    res.status(200).json({ dados });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Extração por IA não configurada no servidor.' });
      return;
    }
    // Detalhe fica só no log do servidor; ao cliente, mensagem genérica.
    console.error('extract-proposal falhou:', e);
    res.status(502).json({ erro: 'Não foi possível extrair os dados da proposta.' });
  }
}

/**
 * Blindagem: captura QUALQUER erro do processamento (upload, stream, IA) para não
 * virar FUNCTION_INVOCATION_FAILED. O detalhe fica só no log do servidor; ao
 * cliente vai uma mensagem genérica (sem vazar internals).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('extract-proposal crash:', e);
    if (!res.headersSent) {
      res.status(502).json({ erro: 'Não foi possível extrair os dados da proposta.' });
    }
  }
}
