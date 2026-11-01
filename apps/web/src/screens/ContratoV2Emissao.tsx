import { useRef, useState } from 'react';
import { PARTE_V2_LABEL, formatNumeric, gerencia, linkWhatsAppMensagem, mensagemAssinatura, signatariosPendentes, type SignatarioContrato, type SignatarioResumo } from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';
import { useToast } from '../app/Toast';
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad';
import { usePapelObra } from '../data/hooks';
import { urlDownloadEmitido, useAssinaturasV2, useCancelarContrato, useColetarAssinatura, useGerarLinksAssinatura, type ContratoV2Detalhe } from '../data/contrato-v2';

/**
 * Contrato emitido (M13): número, arquivos finais, assinaturas das três partes
 * (link por signatário via WhatsApp ou coleta presencial por dono/gestor) e
 * cancelamento com motivo. Só leitura para colaborador.
 */
export function PainelEmitido({ c }: { c: ContratoV2Detalhe }) {
  const papel = usePapelObra(c.obraId);
  const podeGerir = gerencia(papel);
  const ass = useAssinaturasV2(c.id);
  const gerar = useGerarLinksAssinatura(c.id);
  const coletar = useColetarAssinatura(c.id);
  const cancelar = useCancelarContrato(c.id);
  const toast = useToast();
  const padRef = useRef<SignaturePadHandle>(null);
  const [coletando, setColetando] = useState<SignatarioContrato | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [baixando, setBaixando] = useState<'docx' | 'pdf' | null>(null);

  const linhas = ass.data ?? [];
  const resumo: SignatarioResumo[] = c.signatarios.map((s) => ({ id: s.id ?? '', parte: s.parte, nome: s.nome, obrigatorio: s.obrigatorio }));
  const pendentes = signatariosPendentes(resumo, linhas.map((l) => ({ signatarioId: l.signatarioId, assinadoEm: l.assinadoEm })));
  const final = c.status === 'assinado' || c.status === 'cancelado';

  async function baixar(formato: 'docx' | 'pdf') {
    setBaixando(formato);
    try {
      const { url } = await urlDownloadEmitido(c.id, formato);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível baixar.');
    } finally {
      setBaixando(null);
    }
  }
  async function enviarLink(s: SignatarioContrato) {
    if (!s.id) return;
    try {
      const [l] = await gerar.mutateAsync(s.id);
      if (!l) return toast('Nenhum link gerado.');
      const url = `${window.location.origin}/sign/${l.token}`;
      const msg = mensagemAssinatura({ nome: s.nome, parte: s.parte, numero: c.numero, obra: c.obraNome, url });
      window.open(linkWhatsAppMensagem(msg), '_blank', 'noopener,noreferrer');
      toast(`Link gerado para ${s.nome} (vale 7 dias, uso único).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o link.');
    }
  }
  async function confirmarColeta() {
    const png = padRef.current?.toPngBase64();
    if (!png) return toast('Assine no quadro antes de confirmar.');
    if (!coletando?.id) return;
    try {
      const r = await coletar.mutateAsync({ signatarioId: coletando.id, pngBase64: png });
      setColetando(null);
      toast(r.assinado ? 'Última assinatura registrada: contrato assinado por todas as partes.' : 'Assinatura registrada.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao assinar.');
    }
  }

  return (
    <>
      <div className={`banner ${c.status === 'cancelado' ? 'warn' : 'ok'}`} style={{ marginTop: 14 }}>
        <Icon name={c.status === 'cancelado' ? 'alert' : 'check'} />
        <span>
          <b>{c.status === 'cancelado' ? 'Contrato cancelado.' : c.status === 'assinado' ? 'Contrato assinado por todas as partes.' : `Contrato ${c.numero ?? ''} emitido.`}</b>{' '}
          {c.status === 'cancelado' ? '' : c.status === 'assinado' ? 'O PDF traz as rubricas e a trilha de auditoria.' : pendentes.length ? `${pendentes.length} ${pendentes.length === 1 ? 'assinatura pendente' : 'assinaturas pendentes'}.` : ''}
        </span>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>
        <h2>Versão final</h2>
        <span className="c">{c.numero ?? ''}</span>
      </div>
      <div className="lote-acoes">
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('pdf')}><Icon name="doc" /> {baixando === 'pdf' ? 'Abrindo…' : 'Baixar PDF'}</button>
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('docx')}><Icon name="doc" /> {baixando === 'docx' ? 'Abrindo…' : 'Baixar .docx'}</button>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>
        <h2>Assinaturas</h2>
        <span className="c">{c.signatarios.length - pendentes.length} de {c.signatarios.length}</span>
      </div>
      <div className="card flush" style={{ overflow: 'hidden' }}>
        {c.signatarios.map((s) => {
          const a = linhas.find((l) => l.signatarioId === s.id);
          const assinado = !!a?.assinadoEm;
          return (
            <div key={s.id ?? s.nome} className="party">
              <span className="pic">{assinado ? <Icon name="check" /> : (PARTE_V2_LABEL[s.parte][0] ?? '?')}</span>
              <div className="pn">
                <div className="r">{s.nome}{s.cargo ? `, ${s.cargo}` : ''}</div>
                <div className="s">
                  {PARTE_V2_LABEL[s.parte]}{!s.obrigatorio ? ' · opcional' : ''} ·{' '}
                  {assinado ? `assinou em ${formatNumeric((a?.assinadoEm ?? '').slice(0, 10))}${a?.via === 'link' ? ' · link' : ' · no app'}` : a?.temLink ? 'link enviado' : 'pendente'}
                </div>
              </div>
              {assinado ? (
                <span className="pill adjudicada"><Icon name="check" style={{ width: 13, height: 13 }} />Assinado</span>
              ) : podeGerir && !final ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="soft" icon="link" disabled={gerar.isPending} onClick={() => void enviarLink(s)}>{a?.temLink ? 'Reenviar' : 'Link'}</Button>
                  <Button size="sm" icon="pencil" onClick={() => setColetando(s)}>Coletar</Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {c.status === 'enviado' && <p className="lead" style={{ fontSize: 12, marginTop: 8 }}>Cada signatário recebe um link pessoal pelo WhatsApp (uso único, 7 dias). Dono ou gestor também pode coletar a assinatura a dedo aqui no app, presencialmente.</p>}

      {podeGerir && !final && (
        <button type="button" className="link danger" style={{ marginTop: 14 }} onClick={() => { setMotivo(''); setCancelando(true); }}>
          <Icon name="trash" /> Cancelar contrato emitido
        </button>
      )}

      <Drawer
        aberto={coletando !== null}
        onFechar={() => setColetando(null)}
        titulo={coletando ? `Assinatura de ${coletando.nome}` : ''}
        subtitulo={coletando ? `${PARTE_V2_LABEL[coletando.parte]} · coleta presencial registrada em seu nome` : undefined}
        rodape={<Button block icon="check" disabled={coletar.isPending} onClick={() => void confirmarColeta()}>{coletar.isPending ? 'Registrando…' : 'Confirmar assinatura'}</Button>}
      >
        <div className="field">
          <label>Assinatura a dedo</label>
          <SignaturePad ref={padRef} />
        </div>
        <p className="lead" style={{ fontSize: 12 }}>A rubrica entra em todas as páginas do PDF com nome, parte e data. Trilha: quem coletou, IP e hash do documento.</p>
      </Drawer>

      <Drawer
        aberto={cancelando}
        onFechar={() => setCancelando(false)}
        titulo="Cancelar contrato"
        subtitulo="O número fica registrado como cancelado; links de assinatura pendentes são invalidados."
        rodape={
          <Button block disabled={motivo.trim().length < 5 || cancelar.isPending} onClick={() => void cancelar.mutateAsync(motivo).then(() => { setCancelando(false); toast('Contrato cancelado.'); }).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
            {cancelar.isPending ? 'Cancelando…' : 'Cancelar contrato'}
          </Button>
        }
      >
        <div className="field">
          <label>Motivo (obrigatório)</label>
          <textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: fornecedor desistiu; será gerado novo contrato com outro proponente." />
        </div>
      </Drawer>
    </>
  );
}
