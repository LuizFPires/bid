import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  QUADRO,
  STATUS_CONTRATO_LABEL,
  achadosBloqueantes,
  camposFaltando,
  cpfValido,
  destaquesDoDossie,
  dossieDesatualizado,
  formatBRL,
  formatarCnpj,
  justificativaValida,
  mascararCpf,
  type Dossie,
  type ParteSnapshot,
  type SignatarioContrato,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { BarraAcao } from '../app/BarraAcao';
import { Drawer } from '../app/Drawer';
import { useToast } from '../app/Toast';
import { useContratoV2, useMontarDossie, useResolverAchado, useRevisarContrato, useSalvarContratoV2, type AchadoV2, type ContratoV2Detalhe } from '../data/contrato-v2';

type Etapa = 'dossie' | 'partes' | 'quadro' | 'revisao';
const ETAPAS: { chave: Etapa; n: number; rotulo: string }[] = [
  { chave: 'dossie', n: 1, rotulo: 'Dossiê' },
  { chave: 'partes', n: 2, rotulo: 'Partes' },
  { chave: 'quadro', n: 3, rotulo: 'Quadro' },
  { chave: 'revisao', n: 7, rotulo: 'Revisão IA' },
];

/**
 * Assistente do contrato na minuta padrão (M10: etapas 1–3 e 7). As etapas 4–6
 * (planilha, condições específicas, minuta/variantes) entram nos M11/M12; o
 * envio para validação, no M12. Nada aqui monta texto de contrato (regra 15).
 */
export function ContratoV2Screen({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const etapa = (params.get('etapa') as Etapa | null) ?? 'dossie';
  const revisar = useRevisarContrato(id);
  const sondar = revisar.isPending;
  const { data, isLoading, isError } = useContratoV2(id, { sondar });
  const toast = useToast();

  if (isLoading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty">
          <span className="thinking" aria-label="Carregando"><i /><i /><i /></span>
        </div>
      </div>
    );
  }
  if (isError || !data) return <div className="card empty">Contrato não encontrado.</div>;

  const editavel = ['rascunho', 'devolvido', 'aprovado'].includes(data.status);
  const faltamQuadro = camposFaltando(data.parametros).length;
  const faltamPartes = ['contratante', 'contratada', 'construtora'].filter((k) => !data.partes[k as keyof typeof data.partes]).length;
  const revisaoAtual = data.revisao && data.revisao.status === 'concluida' && data.revisao.conteudoHash === data.conteudoHash;
  const bloqueantes = data.revisao ? achadosBloqueantes(data.revisao.achados).length : 0;
  const ok: Record<Etapa, boolean> = {
    dossie: !!data.dossie,
    partes: faltamPartes === 0,
    quadro: faltamQuadro === 0,
    revisao: !!revisaoAtual && bloqueantes === 0,
  };
  const irPara = (e: Etapa) => setParams({ etapa: e }, { replace: true });
  const idx = ETAPAS.findIndex((e) => e.chave === etapa);
  const proxima = ETAPAS[idx + 1]?.chave ?? null;

  async function rodarRevisao() {
    try {
      const r = await revisar.mutateAsync();
      toast(r.achados.length ? `Revisão concluída: ${r.achados.length} ${r.achados.length === 1 ? 'achado' : 'achados'}.` : 'Revisão concluída sem achados.');
      irPara('revisao');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'A revisão falhou.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/contratos')}>Contratos</button>
        <Icon name="chev" />
        <span>Minuta padrão</span>
      </div>
      <div className="page-head">
        <h1>{data.dossie?.proposta.fornecedor ?? data.categoria}</h1>
        <p className="lead">
          {data.categoria} · {data.obraNome}
          {data.valor != null ? ` · ${formatBRL(data.valor)}` : ''}
        </p>
        <span className={`pill ${data.status === 'aprovado' || data.status === 'assinado' ? 'adjudicada' : data.status === 'em_validacao' ? 'analise' : 'neutro'}`}>
          {STATUS_CONTRATO_LABEL[data.status]}
          {data.numero ? ` · ${data.numero}` : ''}
        </span>
      </div>

      <div className="chips etapas" role="tablist" aria-label="Etapas do contrato">
        {ETAPAS.map((e) => (
          <button key={e.chave} type="button" role="tab" aria-selected={etapa === e.chave} className={`ch${etapa === e.chave ? ' on' : ''}${ok[e.chave] ? ' feita' : ''}`} onClick={() => irPara(e.chave)}>
            <span className="n">{ok[e.chave] ? <Icon name="check" /> : e.n}</span> {e.rotulo}
          </button>
        ))}
        <span className="ch off" aria-disabled="true">4–6 · em breve</span>
      </div>

      {etapa === 'dossie' && <EtapaDossie c={data} editavel={editavel} />}
      {etapa === 'partes' && <EtapaPartes c={data} editavel={editavel} />}
      {etapa === 'quadro' && <EtapaQuadro c={data} editavel={editavel} />}
      {etapa === 'revisao' && <EtapaRevisao c={data} editavel={editavel} rodando={revisar.isPending} />}

      <BarraAcao>
        {etapa === 'revisao' ? (
          <Button block icon="spark" disabled={!editavel || revisar.isPending || !data.dossie} onClick={() => void rodarRevisao()}>
            {revisar.isPending ? 'IA revisando…' : revisaoAtual ? 'Refazer revisão' : 'Revisar com IA'}
          </Button>
        ) : (
          <Button block icon="arrow" onClick={() => proxima && irPara(proxima)}>
            Continuar
          </Button>
        )}
      </BarraAcao>
    </>
  );
}

/* ---------- Etapa 1 · Dossiê ---------- */
function EtapaDossie({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const montar = useMontarDossie(c.id);
  const toast = useToast();
  const d = c.dossie;
  const desatualizado = d && c.propostaAtual ? dossieDesatualizado(d, c.propostaAtual) : false;
  if (!d) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="empty">
          O dossiê ainda não foi montado.
          <div style={{ marginTop: 12 }}>
            <Button variant="soft" icon="spark" disabled={montar.isPending} onClick={() => void montar.mutateAsync(false).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
              {montar.isPending ? 'Montando…' : 'Montar dossiê'}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const destaques = destaquesDoDossie(d);
  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Dossiê da vencedora</h2>
        <span className="c">fotografia de {new Date(d.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {desatualizado && (
        <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <span>A proposta mudou depois do dossiê (nova versão, valor ou prazo). O contrato não muda sozinho (regra 8).</span>
          {editavel && (
            <button type="button" className="link" disabled={montar.isPending} onClick={() => void montar.mutateAsync(true).then(() => toast('Dossiê atualizado.')).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
              Atualizar dossiê
            </button>
          )}
        </div>
      )}
      <div className="card flush doss">
        <L k="Contratada" v={`${d.proposta.fornecedor}${d.proposta.opcao ? ` · ${d.proposta.opcao}` : ''}`} o={`Proposta${d.proposta.versao ? ` v${d.proposta.versao}` : ''}`} />
        <L k="Valor" v={d.proposta.valor != null ? formatBRL(d.proposta.valor) : '—'} o={d.equalizacao?.equalizado != null && d.equalizacao.equalizado !== d.proposta.valor ? `Equalizado ${formatBRL(d.equalizacao.equalizado)}` : 'Apresentado = equalizado'} />
        <L k="Prazo" v={d.proposta.prazoDias != null ? `${d.proposta.prazoDias} dias corridos` : '—'} o="Leitura IA" />
        <L k="Pagamento" v={d.proposta.condicaoPagamento ?? '—'} o="Leitura IA" />
        <L k="Garantia" v={d.proposta.garantia ?? '—'} o="Leitura IA" />
        <L k="Itens" v={d.proposta.itens.length ? `${d.proposta.itens.length} itens lidos` : 'sem planilha na leitura'} o="Planilha do Anexo I" />
        <L k="Arquivo" v={d.proposta.arquivoPath ? d.proposta.arquivoPath.split('/').pop() ?? '' : '—'} o="Anexo III (opcional)" />
      </div>

      <div className="section-title">
        <h2>O que pesa contra a minuta</h2>
        <span className="c">{destaques.length}</span>
      </div>
      {destaques.length === 0 ? (
        <div className="card empty">Nada apontado na leitura nem na equalização.</div>
      ) : (
        <div className="card flush doss">
          {destaques.map((x, i) => (
            <div key={i} className="dl">
              <span className={`chip ${x.tipo === 'risco' ? 'bad' : 'warn'}`}>{x.tipo === 'alerta' ? 'leitura' : x.tipo === 'escopo' ? 'escopo' : 'risco'}</span>
              <span>{x.texto}</span>
            </div>
          ))}
        </div>
      )}
      <p className="lead" style={{ fontSize: 12, marginTop: 10 }}>Esses pontos entram na revisão por IA e precisam ser resolvidos antes do envio para validação.</p>
    </>
  );
}

function L({ k, v, o }: { k: string; v: string; o?: string }) {
  return (
    <div className="dl">
      <span className="k">{k}</span>
      <span className="v">
        {v}
        {o && <small>{o}</small>}
      </span>
    </div>
  );
}

/* ---------- Etapa 2 · Partes e signatários ---------- */
function EtapaPartes({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const salvar = useSalvarContratoV2(c.id);
  const montar = useMontarDossie(c.id);
  const toast = useToast();
  const [editando, setEditando] = useState<SignatarioContrato[] | null>(null);
  const partes: { chave: 'contratante' | 'contratada' | 'construtora'; rotulo: string; origem: string; p: ParteSnapshot | null | undefined }[] = [
    { chave: 'contratante', rotulo: 'Contratante', origem: 'da obra', p: c.partes.contratante },
    { chave: 'contratada', rotulo: 'Contratada', origem: 'da proposta (cadastro de fornecedores)', p: c.partes.contratada },
    { chave: 'construtora', rotulo: 'Construtora', origem: 'da obra', p: c.partes.construtora },
  ];
  const faltam = partes.filter((x) => !x.p);

  async function salvarSignatarios() {
    if (!editando) return;
    for (const s of editando) {
      if (!s.nome.trim()) return toast('Signatário sem nome.');
      if (s.cpf && !cpfValido(s.cpf)) return toast(`CPF de ${s.nome} inválido.`);
    }
    try {
      await salvar.mutateAsync({ signatarios: editando.map(({ id: _i, ordem: _o, ...s }) => ({ ...s, cpf: s.cpf ? s.cpf.replace(/\D/g, '') : null })) });
      toast('Signatários salvos.');
      setEditando(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>As três partes</h2>
        <span className="c">{3 - faltam.length} de 3</span>
      </div>
      {partes.map((x) => (
        <div key={x.chave} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>{x.rotulo} · {x.origem}</span>
            {x.p ? <span className="chip ok">CNPJ válido</span> : <span className="chip bad">falta</span>}
          </div>
          {x.p ? (
            <>
              <div style={{ fontWeight: 900, fontSize: 15, marginTop: 4 }}>{x.p.nome_curto || x.p.razao_social}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{formatarCnpj(x.p.cnpj)}{x.p.natureza ? ` · ${x.p.natureza}` : ''}</div>
              <p style={{ fontSize: 12.5, margin: '8px 0 0', lineHeight: 1.5 }}>{x.p.qualificacao}</p>
            </>
          ) : (
            <p className="lead" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              {x.chave === 'contratada' ? 'Cadastre o fornecedor com este nome em Cadastros (menu do perfil) e recarregue as partes.' : 'Defina em Obra › Dados para contrato e recarregue as partes.'}
            </p>
          )}
        </div>
      ))}
      {editavel && (
        <button type="button" className="link" disabled={montar.isPending} onClick={() => void montar.mutateAsync(true).then(() => toast('Partes recarregadas dos cadastros.')).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
          <Icon name="arrow" /> Recarregar partes dos cadastros
        </button>
      )}

      <div className="section-title" style={{ marginTop: 18 }}>
        <h2>Signatários</h2>
        <span className="c">{c.signatarios.length}</span>
      </div>
      <div className="card rowlist">
        {c.signatarios.length === 0 && <div className="empty" style={{ padding: 14 }}>Nenhum signatário. Cadastre nas partes ou adicione aqui.</div>}
        {c.signatarios.map((s) => (
          <div key={s.id ?? `${s.parte}-${s.nome}`} className="row">
            <span className="ic"><Icon name="user" /></span>
            <span className="tt">
              <span className="t1">{s.nome}</span>
              <span className="t2">{s.parte}{s.cargo ? ` · ${s.cargo}` : ''}{s.cpf ? ` · ${mascararCpf(s.cpf)}` : ' · CPF pendente'}</span>
            </span>
          </div>
        ))}
      </div>
      {editavel && (
        <Button block variant="soft" icon="pencil" style={{ marginTop: 12 }} onClick={() => setEditando(c.signatarios.map((s) => ({ ...s })))}>
          Editar signatários
        </Button>
      )}

      <Drawer
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        titulo="Signatários do contrato"
        subtitulo="Quem assina por cada parte. Sociedades anônimas costumam assinar com dois diretores."
        rodape={
          <Button block icon="check" disabled={salvar.isPending} onClick={() => void salvarSignatarios()}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        }
      >
        {(editando ?? []).map((s, i) => (
          <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div className="pair">
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Parte</label>
                <select value={s.parte} onChange={(e) => setEditando((l) => l!.map((x, j) => (j === i ? { ...x, parte: e.target.value as SignatarioContrato['parte'] } : x)))}>
                  <option value="contratante">Contratante</option>
                  <option value="contratada">Contratada</option>
                  <option value="construtora">Construtora</option>
                  <option value="testemunha">Testemunha</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Nome</label>
                <input value={s.nome} onChange={(e) => setEditando((l) => l!.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
              </div>
            </div>
            <div className="pair">
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Cargo</label>
                <input value={s.cargo ?? ''} onChange={(e) => setEditando((l) => l!.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)))} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>CPF</label>
                <input value={s.cpf ?? ''} inputMode="numeric" onChange={(e) => setEditando((l) => l!.map((x, j) => (j === i ? { ...x, cpf: e.target.value } : x)))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 4 }}>
              <label>E-mail / WhatsApp (link de assinatura)</label>
              <input value={s.email ?? ''} onChange={(e) => setEditando((l) => l!.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            </div>
            <button type="button" className="link danger" onClick={() => setEditando((l) => l!.filter((_, j) => j !== i))}>
              <Icon name="trash" /> remover
            </button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => setEditando((l) => [...(l ?? []), { parte: 'contratada', nome: '', cpf: null, cargo: null, email: null, telefone: null, ordem: (l?.length ?? 0) + 1, obrigatorio: true }])}>
          <Icon name="plus" /> Adicionar signatário
        </button>
      </Drawer>
    </>
  );
}

/* ---------- Etapa 3 · Quadro-resumo ---------- */
function EtapaQuadro({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const salvar = useSalvarContratoV2(c.id);
  const toast = useToast();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  useEffect(() => setRascunho({}), [c.conteudoHash, c.parametros]);
  const valor = (k: string) => (k in rascunho ? rascunho[k]! : (c.parametros[k] ?? ''));
  const sujo = Object.keys(rascunho).some((k) => rascunho[k] !== (c.parametros[k] ?? ''));
  const faltam = camposFaltando({ ...c.parametros, ...rascunho }).length;

  async function gravar() {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(rascunho)) if (v !== (c.parametros[k] ?? '')) patch[k] = v;
    if (!Object.keys(patch).length) return;
    try {
      await salvar.mutateAsync({ parametros: patch });
      toast('Quadro salvo.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  const grupos = useMemo(() => {
    const porNumero = new Map<string, typeof QUADRO[number][]>();
    for (const q of QUADRO) {
      const g = q.numero ? `Item ${q.numero}` : 'Outros campos';
      porNumero.set(g, [...(porNumero.get(g) ?? []), q]);
    }
    return [...porNumero.entries()];
  }, []);

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Quadro-resumo (Anexo I)</h2>
        <span className="c">{faltam ? `${faltam} a preencher` : 'completo'}</span>
      </div>
      {c.parametros._aviso_soma && (
        <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <span>{c.parametros._aviso_soma}</span>
        </div>
      )}
      {grupos.map(([g, campos]) => (
        <div key={g} className="card" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>{g}</span>
          {campos.map((q) => {
            const v = q.fonte === 'auto' ? (q.chave === 'q_valor' && c.valor != null ? formatBRL(c.valor) : '') : valor(q.chave);
            const vazio = q.obrigatorio && q.fonte !== 'auto' && !v.trim();
            return (
              <div key={q.chave} className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label htmlFor={`q-${q.chave}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{q.rotulo}{q.obrigatorio ? '' : ' (opcional)'}</span>
                  <span className={`chip ${vazio ? 'bad' : q.fonte === 'auto' ? '' : c.parametros[q.chave] ? 'on' : ''}`} style={{ textTransform: 'none' }}>
                    {q.fonte === 'auto' ? 'calculado' : vazio ? 'definir' : q.fonte === 'dossie' ? 'da proposta' : q.fonte === 'obra' ? 'da obra' : q.fonte === 'cadastro' ? 'do cadastro' : q.fonte === 'sugestao' ? 'sugestão' : 'preenchido'}
                  </span>
                </label>
                {q.multilinha ? (
                  <textarea id={`q-${q.chave}`} rows={3} value={v} disabled={!editavel || q.fonte === 'auto'} onChange={(e) => setRascunho((r) => ({ ...r, [q.chave]: e.target.value }))} />
                ) : (
                  <input id={`q-${q.chave}`} value={v} disabled={!editavel || q.fonte === 'auto'} onChange={(e) => setRascunho((r) => ({ ...r, [q.chave]: e.target.value }))} />
                )}
                <small style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: 'var(--muted)' }}>{q.ajuda}</small>
              </div>
            );
          })}
        </div>
      ))}
      {editavel && (
        <Button block icon="check" disabled={!sujo || salvar.isPending} onClick={() => void gravar()}>
          {salvar.isPending ? 'Salvando…' : sujo ? 'Salvar quadro' : 'Quadro salvo'}
        </Button>
      )}
    </>
  );
}

/* ---------- Etapa 7 · Revisão por IA ---------- */
function EtapaRevisao({ c, editavel, rodando }: { c: ContratoV2Detalhe; editavel: boolean; rodando: boolean }) {
  const resolver = useResolverAchado(c.id);
  const salvar = useSalvarContratoV2(c.id);
  const toast = useToast();
  const [aceitando, setAceitando] = useState<AchadoV2 | null>(null);
  const [just, setJust] = useState('');
  const r = c.revisao;
  const atual = r && r.status === 'concluida' && r.conteudoHash === c.conteudoHash;
  const bloq = r ? achadosBloqueantes(r.achados) : [];

  async function aplicarSugestao(a: AchadoV2) {
    if (!a.sugestao) return;
    try {
      if (a.numero.startsWith('quadro.')) {
        await salvar.mutateAsync({ parametros: { [a.numero.slice(7)]: a.sugestao } });
      } else if (/^\d+(\.\d+)*$/.test(a.numero)) {
        const item = c.itens.find((i) => i.numero === a.numero);
        if (!item) return toast('Item não encontrado no contrato.');
        await salvar.mutateAsync({ itens: [{ ...item, texto: a.sugestao, origem: 'variante', justificativa: `Sugestão da revisão IA: ${a.titulo}` }] });
      } else {
        return toast('Aplique esta sugestão manualmente na etapa correspondente.');
      }
      await resolver.mutateAsync({ achadoId: a.id, resolucao: 'corrigido' });
      toast('Sugestão aplicada e achado marcado como corrigido. Refaça a revisão ao terminar.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível aplicar.');
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Revisão obrigatória por IA</h2>
        <span className="c">{r ? (atual ? 'vale para esta versão' : r.status === 'processando' ? 'em andamento' : 'desatualizada') : 'não feita'}</span>
      </div>
      {rodando || r?.status === 'processando' ? (
        <div className="card">
          <div className="empty">
            <span className="thinking" aria-label="IA revisando"><i /><i /><i /></span>
            <p className="lead" style={{ marginTop: 8 }}>A IA está comparando a minuta com a proposta. Pode levar um ou dois minutos; você pode navegar e voltar.</p>
          </div>
        </div>
      ) : !r ? (
        <div className="card empty">
          A revisão compara o contrato montado com a proposta e aponta conflitos, lacunas e riscos. Sem revisão da versão atual, o contrato não vai para validação.
        </div>
      ) : (
        <>
          {r.status === 'falhou' && (
            <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
              <Icon name="alert" />
              <span>A última revisão falhou ({r.erro ?? 'erro'}). Tente de novo.</span>
            </div>
          )}
          {!atual && r.status === 'concluida' && (
            <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
              <Icon name="alert" />
              <span>O contrato mudou depois desta revisão. Refaça antes de enviar.</span>
            </div>
          )}
          {r.resumo && <div className="card" style={{ marginBottom: 12, fontSize: 13.5, lineHeight: 1.5 }}>{r.resumo}</div>}
          {bloq.length > 0 && (
            <p className="lead" style={{ color: 'var(--danger)', fontWeight: 800 }}>
              {bloq.length} {bloq.length === 1 ? 'achado alto bloqueia' : 'achados altos bloqueiam'} o envio: corrija ou aceite com justificativa.
            </p>
          )}
          {r.achados.length === 0 && r.status === 'concluida' && <div className="card empty">Nenhum achado. O contrato reflete a proposta.</div>}
          {r.achados.map((a) => (
            <div key={a.id} className={`card achado sev-${a.severidade}${a.resolucao ? ' resolvido' : ''}`} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`chip ${a.severidade === 'alta' ? 'bad' : a.severidade === 'media' ? 'warn' : ''}`}>{a.severidade}</span>
                <span className="chip">{a.tipo}</span>
                <span className="chip">{a.numero}</span>
                {a.resolucao && <span className="chip ok">{a.resolucao}</span>}
              </div>
              <div style={{ fontWeight: 900, fontSize: 14.5, marginTop: 8 }}>{a.titulo}</div>
              <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>{a.explicacao}</p>
              {a.trechoProposta && <blockquote className="trecho">“{a.trechoProposta}”</blockquote>}
              {a.sugestao && (
                <div className="sug" style={{ marginTop: 10 }}>
                  <Icon name="spark" />
                  <span><b>Sugestão:</b> {a.sugestao}</span>
                </div>
              )}
              {a.justificativa && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)' }}><b>Justificativa:</b> {a.justificativa}</p>}
              {editavel && !a.resolucao && (
                <div className="pair" style={{ marginTop: 10 }}>
                  <Button variant="ghost" size="sm" onClick={() => { setAceitando(a); setJust(''); }}>Aceitar com justificativa</Button>
                  <Button size="sm" icon="check" disabled={!a.sugestao || salvar.isPending || resolver.isPending} onClick={() => void aplicarSugestao(a)}>Aplicar sugestão</Button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      <Drawer
        aberto={aceitando !== null}
        onFechar={() => setAceitando(null)}
        titulo="Aceitar o achado"
        subtitulo={aceitando?.titulo}
        rodape={
          <Button block icon="check" disabled={!justificativaValida(just) || resolver.isPending} onClick={() => void resolver.mutateAsync({ achadoId: aceitando!.id, resolucao: 'aceito', justificativa: just }).then(() => { setAceitando(null); toast('Achado aceito com justificativa.'); }).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
            Aceitar
          </Button>
        }
      >
        <div className="field">
          <label htmlFor="just">Por que o contrato fica assim mesmo? (mínimo 10 caracteres)</label>
          <textarea id="just" rows={4} value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: prazo renegociado por e-mail em 30/10; fornecedor aceitou 60 dias." />
        </div>
        <p className="lead" style={{ fontSize: 12 }}>A justificativa fica registrada e aparece para quem valida o contrato.</p>
      </Drawer>
    </>
  );
}

export function dossiePronto(d: Dossie | null): boolean {
  return !!d;
}
