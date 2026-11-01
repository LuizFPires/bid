import { useEffect, useMemo, useState } from 'react';
import {
  ORIGEM_LABEL,
  achadosBloqueantes,
  agruparPorClausula,
  aplicarParametrosClausula,
  aplicarVariante,
  editarTexto,
  gerencia,
  itemExtra,
  justificativaValida,
  pendencias,
  pendenciasBloqueantes,
  restaurarPadrao,
  suprimir,
  type ItemClausula,
  type Pendencia,
  type VarianteModelo,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';
import { useToast } from '../app/Toast';
import { usePapelObra } from '../data/hooks';
import { entregarArquivo } from '../data/mutations';
import { supabase } from '../lib/supabase';
import {
  baixarMinuta,
  useAprovacaoVigente,
  useAprovarContrato,
  useCatalogoModelo,
  useConferirMinuta,
  useDevolverContrato,
  useEnviarValidacao,
  useParametrosModelo,
  useSalvarContratoV2,
  useVariantesModelo,
  type ContratoV2Detalhe,
} from '../data/contrato-v2';

/* =========================== Etapa 6 · Minuta =========================== */

export function EtapaMinuta({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const catalogoQ = useCatalogoModelo(c.modeloId);
  const variantesQ = useVariantesModelo(c.modeloId);
  const paramsQ = useParametrosModelo(c.modeloId);
  const salvar = useSalvarContratoV2(c.id);
  const toast = useToast();
  const catalogo = catalogoQ.data ?? null;
  const variantes = variantesQ.data ?? [];
  const paramsModelo = paramsQ.data ?? [];

  // Itens como vão ao documento (parâmetros de cláusula aplicados na leitura).
  const itensExibidos = useMemo(() => aplicarParametrosClausula(c.itens, paramsModelo, c.parametros), [c.itens, paramsModelo, c.parametros]);
  const grupos = useMemo(() => (catalogo ? agruparPorClausula(catalogo, itensExibidos) : []), [catalogo, itensExibidos]);
  const decl = useMemo(() => (catalogo?.anexo_ii ?? []).map((d) => ({ d, item: itensExibidos.find((i) => i.numero === `decl:${d.numero}`) ?? null })), [catalogo, itensExibidos]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const itemAberto = itensExibidos.find((i) => i.numero === aberto) ?? null;
  const alterados = c.itens.filter((i) => i.origem !== 'padrao').length;

  // Parâmetros de cláusula: rascunho local gravado em `parametros`.
  const [pc, setPc] = useState<Record<string, string>>({});
  const chavePc = JSON.stringify(paramsModelo.map((p) => [p.parametro, c.parametros[p.parametro] ?? '']));
  useEffect(() => {
    const o: Record<string, string> = {};
    for (const p of paramsModelo) o[p.parametro] = c.parametros[p.parametro] ?? '';
    setPc(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePc]);
  const pcSujo = paramsModelo.some((p) => (pc[p.parametro] ?? '') !== (c.parametros[p.parametro] ?? ''));

  async function gravarItem(novo: ItemClausula, msg: string) {
    try {
      await salvar.mutateAsync({ itens: [novo] });
      setAberto(null);
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  if (catalogoQ.isLoading) return <div className="card empty" style={{ marginTop: 14 }}>Carregando a minuta…</div>;
  if (!catalogo) return <div className="card empty" style={{ marginTop: 14 }}>O modelo da minuta não tem catálogo carregado.</div>;

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Minuta e variantes</h2>
        <span className="c">{alterados ? `${alterados} ${alterados === 1 ? 'item alterado' : 'itens alterados'}` : 'tudo no padrão'}</span>
      </div>
      <p className="lead" style={{ fontSize: 12.5, marginTop: 0 }}>
        Toque num item para ver o padrão, trocar por uma variante do catálogo, editar (vira variante com justificativa), suprimir ou incluir um item extra.
      </p>

      {paramsModelo.length > 0 && (
        <details className="card minuta-cl" open={abertos.has('params')} onToggle={(e) => setAbertos((s) => { const n = new Set(s); if ((e.target as HTMLDetailsElement).open) n.add('params'); else n.delete('params'); return n; })}>
          <summary>
            <span className="t1">Parâmetros de cláusula</span>
            <span className="t2">{paramsModelo.filter((p) => (c.parametros[p.parametro] ?? '').trim()).length} em uso</span>
          </summary>
          <div className="minuta-params">
            {paramsModelo.map((p) => (
              <div key={p.parametro} className="field">
                <label>{p.rotulo} <small>· troca o item {p.numero}</small></label>
                <input value={pc[p.parametro] ?? ''} disabled={!editavel} inputMode={p.tipo === 'moeda' ? 'decimal' : undefined} placeholder={p.tipo === 'data' ? 'dd/mm/aaaa' : p.tipo === 'opcoes' ? 'escolha conforme o rótulo; vazio = padrão' : 'vazio = texto padrão'} onChange={(e) => setPc({ ...pc, [p.parametro]: e.target.value })} />
              </div>
            ))}
            {editavel && (
              <Button size="sm" icon="check" disabled={!pcSujo || salvar.isPending} onClick={() => void salvar.mutateAsync({ parametros: pc }).then(() => toast('Parâmetros salvos: os itens afetados passam a "parâmetro".')).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
                Salvar parâmetros
              </Button>
            )}
          </div>
        </details>
      )}

      {grupos.map((g) => {
        const mudados = g.itens.filter((i) => i.origem !== 'padrao').length;
        return (
          <details key={g.clausula} className="card minuta-cl" open={abertos.has(g.clausula)} onToggle={(e) => setAbertos((s) => { const n = new Set(s); if ((e.target as HTMLDetailsElement).open) n.add(g.clausula); else n.delete(g.clausula); return n; })}>
            <summary>
              <span className="t1">Cláusula {g.clausula.toLowerCase()} — {g.titulo}</span>
              <span className="t2">{g.itens.length} itens{mudados ? ` · ${mudados} ${mudados === 1 ? 'alterado' : 'alterados'}` : ''}</span>
            </summary>
            <div className="minuta-itens">
              {g.itens.map((it) => <LinhaItem key={it.numero} it={it} onClick={() => setAberto(it.numero)} />)}
            </div>
          </details>
        );
      })}

      {decl.length > 0 && (
        <details className="card minuta-cl" open={abertos.has('decl')} onToggle={(e) => setAbertos((s) => { const n = new Set(s); if ((e.target as HTMLDetailsElement).open) n.add('decl'); else n.delete('decl'); return n; })}>
          <summary>
            <span className="t1">Anexo II — Declaração de capacidade</span>
            <span className="t2">{decl.length} itens</span>
          </summary>
          <div className="minuta-itens">
            {decl.map(({ d, item }) => item ? <LinhaItem key={item.numero} it={item} titulo={d.titulo} onClick={() => setAberto(item.numero)} /> : null)}
          </div>
        </details>
      )}

      <Drawer aberto={itemAberto !== null} onFechar={() => setAberto(null)} titulo={itemAberto ? `Item ${itemAberto.numero.replace('decl:', 'Anexo II · ')}` : ''} subtitulo={itemAberto ? ORIGEM_LABEL[itemAberto.origem].texto : undefined}>
        {itemAberto && (
          <DetalheItem
            it={itemAberto}
            original={c.itens.find((i) => i.numero === itemAberto.numero) ?? itemAberto}
            todos={c.itens}
            variantes={variantes.filter((v) => v.numero === itemAberto.numero)}
            editavel={editavel}
            ocupado={salvar.isPending}
            onGravar={gravarItem}
          />
        )}
      </Drawer>
    </>
  );
}

function Selo({ it }: { it: ItemClausula }) {
  const o = ORIGEM_LABEL[it.origem];
  return (
    <span className={`selo ${it.reduzProtecao ? 'reduz' : o.tom}`}>
      {it.suprimido ? 'suprimido' : o.texto}
      {it.reduzProtecao ? ' · reduz proteção' : ''}
    </span>
  );
}

function LinhaItem({ it, titulo, onClick }: { it: ItemClausula; titulo?: string; onClick: () => void }) {
  return (
    <div className="minuta-item" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <span className="n">{it.numero.replace('decl:', '')}.</span>
      <span className="tx">
        {it.origem !== 'padrao' || it.suprimido ? <Selo it={it} /> : null}
        <span className={`t${it.suprimido ? ' sup' : ''}`}>{titulo ? <b>{titulo} </b> : null}{it.suprimido ? 'Não se aplica.' : it.texto.replace(/\*\*/g, '')}</span>
      </span>
      <Icon name="chev" />
    </div>
  );
}

type Modo = 'ver' | 'editar' | 'variante' | 'suprimir' | 'extra';

function DetalheItem({ it, original, todos, variantes, editavel, ocupado, onGravar }: { it: ItemClausula; original: ItemClausula; todos: readonly ItemClausula[]; variantes: VarianteModelo[]; editavel: boolean; ocupado: boolean; onGravar: (novo: ItemClausula, msg: string) => Promise<void> }) {
  const [modo, setModo] = useState<Modo>('ver');
  const [texto, setTexto] = useState(it.texto);
  const [just, setJust] = useState('');
  const [varSel, setVarSel] = useState<VarianteModelo | null>(null);
  const [verPadrao, setVerPadrao] = useState(false);
  const toast = useToast();
  useEffect(() => { setModo('ver'); setTexto(it.texto); setJust(''); setVarSel(null); setVerPadrao(false); }, [it.numero]);
  const difereDoPadrao = it.textoPadrao != null && it.texto !== it.textoPadrao;
  const bloqueado = it.origem === 'bloco' || it.origem === 'parametro';

  async function confirmar() {
    try {
      if (modo === 'editar') await onGravar(editarTexto(original, texto, just), 'Item alterado (variante com justificativa).');
      else if (modo === 'variante' && varSel) await onGravar(aplicarVariante(original, varSel, just), `Variante "${varSel.titulo}" aplicada.`);
      else if (modo === 'suprimir') await onGravar(suprimir(original, just), 'Item suprimido: sai como "Não se aplica.".');
      else if (modo === 'extra') await onGravar(itemExtra(todos, original.numero, texto, just), 'Item extra incluído.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Selo it={it} />
        {it.varianteChave && <span className="chip">{it.varianteChave}</span>}
        {it.blocoChave && <span className="chip">bloco {it.blocoChave}</span>}
      </div>
      <p className="minuta-texto">{it.suprimido ? 'Não se aplica.' : it.texto.replace(/\*\*/g, '')}</p>
      {it.justificativa && <p className="lead" style={{ fontSize: 12.5 }}><b>Justificativa:</b> {it.justificativa}</p>}
      {it.origem === 'parametro' && <p className="lead" style={{ fontSize: 12.5 }}>Texto definido por um parâmetro de cláusula. Para voltar ao padrão, limpe o parâmetro.</p>}
      {it.origem === 'bloco' && <p className="lead" style={{ fontSize: 12.5 }}>Texto definido por uma condição específica: ajuste na etapa 5.</p>}
      {(difereDoPadrao || it.suprimido) && it.textoPadrao != null && (
        <>
          <button type="button" className="link" onClick={() => setVerPadrao((v) => !v)}><Icon name="doc" /> {verPadrao ? 'Ocultar padrão' : 'Ver texto padrão'}</button>
          {verPadrao && <p className="minuta-texto padrao">{it.textoPadrao.replace(/\*\*/g, '')}</p>}
        </>
      )}

      {editavel && !bloqueado && modo === 'ver' && (
        <div className="minuta-acoes">
          {variantes.length > 0 && <Button variant="soft" size="sm" icon="scale" onClick={() => setModo('variante')}>Variantes ({variantes.length})</Button>}
          {!it.suprimido && <Button variant="soft" size="sm" icon="pencil" onClick={() => { setTexto(it.texto); setModo('editar'); }}>Editar</Button>}
          {!it.suprimido && <Button variant="ghost" size="sm" onClick={() => setModo('suprimir')}>Suprimir</Button>}
          {!it.numero.startsWith('decl:') && it.textoPadrao != null && <Button variant="ghost" size="sm" icon="plus" onClick={() => { setTexto(''); setModo('extra'); }}>Item extra</Button>}
          {(it.origem !== 'padrao' || it.suprimido) && it.textoPadrao != null && (
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => void onGravar(restaurarPadrao(original), 'Item de volta ao padrão.').catch(() => undefined)}>Voltar ao padrão</Button>
          )}
        </div>
      )}

      {modo === 'variante' && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="section-title" style={{ marginTop: 0 }}><h2 style={{ fontSize: 14 }}>Variantes negociadas</h2></div>
          {variantes.map((v) => (
            <label key={v.chave} className={`lote-versao var${varSel?.chave === v.chave ? ' on' : ''}`}>
              <input type="radio" name="var" checked={varSel?.chave === v.chave} onChange={() => setVarSel(v)} />
              <span>
                <b>{v.titulo}</b> {v.reduz_protecao && <span className="selo reduz">reduz proteção</span>}
                <span className="var-exp">{v.explicacao}</span>
              </span>
            </label>
          ))}
          {varSel && <p className="minuta-texto" style={{ marginTop: 8 }}>{varSel.texto}</p>}
        </div>
      )}
      {(modo === 'editar' || modo === 'extra') && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>{modo === 'extra' ? `Texto do item novo (entra depois do ${it.numero})` : 'Texto do item'}</label>
          <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      )}
      {modo !== 'ver' && (
        <>
          <div className="field">
            <label>Justificativa (mínimo 10 caracteres)</label>
            <textarea rows={3} value={just} onChange={(e) => setJust(e.target.value)} placeholder={modo === 'suprimir' ? 'Ex.: não há subempreitada neste serviço.' : 'Ex.: negociado com o fornecedor em 30/10; aceito pela diretoria.'} />
          </div>
          <div className="pair">
            <Button variant="ghost" onClick={() => setModo('ver')}>Cancelar</Button>
            <Button icon="check" disabled={ocupado || !justificativaValida(just) || (modo === 'variante' && !varSel) || ((modo === 'editar' || modo === 'extra') && !texto.trim())} onClick={() => void confirmar()}>
              {modo === 'suprimir' ? 'Suprimir' : modo === 'variante' ? 'Aplicar variante' : 'Salvar'}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/* ====================== Etapa 7 · Conferir e enviar ====================== */

export function PainelEnvio({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const conferir = useConferirMinuta(c.id);
  const enviar = useEnviarValidacao(c.id);
  const toast = useToast();
  const [baixando, setBaixando] = useState<'docx' | 'pdf' | null>(null);
  const lista: Pendencia[] = useMemo(
    () => pendencias({ dossie: c.dossie, parametros: c.parametros, partes: c.partes, itens: c.itens, planilha: c.planilha, blocos: c.blocos, signatarios: c.signatarios, faltandoServidor: c.faltandoServidor ?? undefined }),
    [c],
  );
  const bloq = pendenciasBloqueantes(lista);
  const r = c.revisao;
  const revisaoOk = !!c.conteudoHash && r?.status === 'concluida' && r.conteudoHash === c.conteudoHash;
  const altosAbertos = r ? achadosBloqueantes(r.achados).length : 0;
  const minutaConferida = c.faltandoServidor !== null && !!c.conteudoHash;

  async function baixar(formato: 'docx' | 'pdf') {
    setBaixando(formato);
    try {
      const { arquivo, faltando } = await baixarMinuta(c.id, formato);
      await entregarArquivo(arquivo);
      if (faltando) toast(`Minuta gerada com ${faltando} ${faltando === 1 ? 'marcador vazio' : 'marcadores vazios'} ([A PREENCHER]).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar a minuta.');
    } finally {
      setBaixando(null);
    }
  }
  async function conferirEEnviar() {
    try {
      const { hash, faltando } = await conferir.mutateAsync();
      if (faltando.length) return toast(`Faltam ${faltando.length} ${faltando.length === 1 ? 'marcador' : 'marcadores'} no documento: ${faltando.slice(0, 5).join(', ')}${faltando.length > 5 ? '…' : ''}.`);
      if (!(r?.status === 'concluida' && r.conteudoHash === hash)) return toast('Revise com IA esta versão antes de enviar (o conteúdo mudou desde a última revisão).');
      await enviar.mutateAsync(hash);
      toast('Enviado para validação. O dono ou um gestor da obra aprova ou devolve.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível enviar.');
    }
  }

  const checks: { ok: boolean; texto: string }[] = [
    { ok: !lista.some((p) => p.etapa === 1 && p.bloqueia), texto: 'Dossiê montado' },
    { ok: !lista.some((p) => p.etapa === 2 && p.bloqueia), texto: 'Partes qualificadas e signatários' },
    { ok: !lista.some((p) => p.etapa === 3 && p.bloqueia), texto: 'Quadro-resumo completo' },
    { ok: !lista.some((p) => p.etapa === 4 && p.bloqueia), texto: 'Planilha de preços' },
    { ok: !lista.some((p) => p.etapa === 5 && p.bloqueia), texto: 'Condições específicas e Anexo III' },
    { ok: !lista.some((p) => p.etapa === 6 && p.bloqueia), texto: 'Minuta: alterações justificadas' },
    { ok: minutaConferida && (c.faltandoServidor?.length ?? 0) === 0, texto: minutaConferida ? 'Minuta sem marcador vazio' : 'Minuta ainda não conferida nesta versão' },
    { ok: revisaoOk, texto: 'Revisão por IA desta versão concluída' },
    { ok: revisaoOk && altosAbertos === 0, texto: 'Achados altos corrigidos ou aceitos' },
  ];
  const avisos = lista.filter((p) => !p.bloqueia);

  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <h2>Conferir e enviar</h2>
        <span className="c">{checks.filter((x) => x.ok).length} de {checks.length}</span>
      </div>
      <div className="card flush">
        <ul className="chk-list">
          {checks.map((x, i) => (
            <li key={i} className={x.ok ? 'ok' : ''}>
              <Icon name={x.ok ? 'check' : 'alert'} />
              <span>{x.texto}</span>
            </li>
          ))}
        </ul>
      </div>
      {bloq.length > 0 && (
        <ul className="pend-list">
          {bloq.map((p) => <li key={p.codigo}><span className="chip">etapa {p.etapa}</span> {p.texto}</li>)}
        </ul>
      )}
      {avisos.length > 0 && (
        <ul className="pend-list aviso">
          {avisos.map((p) => <li key={p.codigo}><span className="chip warn">aviso</span> {p.texto}</li>)}
        </ul>
      )}
      <div className="lote-acoes" style={{ marginTop: 10 }}>
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('docx')}><Icon name="doc" /> {baixando === 'docx' ? 'Gerando…' : 'Baixar minuta .docx'}</button>
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('pdf')}><Icon name="doc" /> {baixando === 'pdf' ? 'Gerando…' : 'Baixar minuta PDF'}</button>
      </div>
      {editavel && (
        <Button block icon="arrow" style={{ marginTop: 12 }} disabled={bloq.length > 0 || conferir.isPending || enviar.isPending || !revisaoOk || altosAbertos > 0} onClick={() => void conferirEEnviar()}>
          {conferir.isPending ? 'Conferindo a minuta…' : enviar.isPending ? 'Enviando…' : 'Enviar para validação'}
        </Button>
      )}
      <p className="lead" style={{ fontSize: 12, marginTop: 8 }}>
        A minuta sai com o aviso "não válida para assinatura" até a emissão. O envio confere o documento no servidor e trava o conteúdo até a decisão do dono/gestor.
      </p>
    </>
  );
}

/* ======================= Validação (dono/gestor) ======================= */

function useMeuId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => setId(data.session?.user.id ?? null));
  }, []);
  return id;
}

export function PainelValidacao({ c }: { c: ContratoV2Detalhe }) {
  const papel = usePapelObra(c.obraId);
  const meuId = useMeuId();
  const aprovacao = useAprovacaoVigente(c.id);
  const aprovar = useAprovarContrato(c.id);
  const devolver = useDevolverContrato(c.id);
  const toast = useToast();
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [devolvendo, setDevolvendo] = useState(false);
  const [comentario, setComentario] = useState('');
  const [baixando, setBaixando] = useState<'docx' | 'pdf' | null>(null);
  const reduzem = c.itens.filter((i) => i.reduzProtecao && !i.suprimido);
  const aceitos = (c.revisao?.achados ?? []).filter((a) => a.resolucao === 'aceito');
  const variantes = c.itens.filter((i) => i.origem === 'variante');
  const podeAprovar = gerencia(papel);
  const todosLidos = reduzem.every((i) => lidos.has(i.numero));
  const a = aprovacao.data;
  const autoaprovacao = !!a && a.acao === 'enviado' && a.autor === meuId;

  async function baixar(formato: 'docx' | 'pdf') {
    setBaixando(formato);
    try {
      const { arquivo } = await baixarMinuta(c.id, formato);
      await entregarArquivo(arquivo);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar a minuta.');
    } finally {
      setBaixando(null);
    }
  }

  return (
    <>
      <div className="banner" style={{ marginTop: 14 }}>
        <Icon name="scale" />
        <span>
          <b>Aguardando validação.</b> {a?.acao === 'enviado' ? `Enviado em ${new Date(a.criadaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : ''} {podeAprovar ? 'Você pode aprovar ou devolver.' : 'O dono ou um gestor da obra aprova ou devolve.'}
        </span>
      </div>
      {autoaprovacao && podeAprovar && (
        <div className="banner warn" role="status" style={{ marginTop: 8 }}>
          <Icon name="alert" />
          <span>Você mesmo enviou este contrato. A aprovação é permitida, mas fica registrada como <b>autoaprovação</b>.</span>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 16 }}>
        <h2>Resumo para validar</h2>
      </div>
      <div className="card flush doss">
        <div className="dl"><span className="k">Contratada</span><span className="v">{c.dossie?.proposta.fornecedor ?? '—'}</span></div>
        <div className="dl"><span className="k">Valor</span><span className="v">{c.valor != null ? c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}<small>soma da planilha</small></span></div>
        <div className="dl"><span className="k">Revisão IA</span><span className="v">{c.revisao?.resumo ?? '—'}</span></div>
        <div className="dl"><span className="k">Itens alterados</span><span className="v">{variantes.length}<small>{reduzem.length} reduzem proteção</small></span></div>
      </div>

      {reduzem.length > 0 && (
        <>
          <div className="section-title"><h2>Variantes que reduzem proteção</h2><span className="c">li e aprovo, item a item (RC-06)</span></div>
          {reduzem.map((i) => (
            <label key={i.numero} className="card lote-versao" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={lidos.has(i.numero)} disabled={!podeAprovar} onChange={(e) => setLidos((s) => { const n = new Set(s); if (e.target.checked) n.add(i.numero); else n.delete(i.numero); return n; })} />
              <span>
                <b>Item {i.numero}</b> <span className="selo reduz">reduz proteção</span>
                <span className="var-exp">{i.texto.replace(/\*\*/g, '')}</span>
                {i.justificativa && <span className="var-exp"><b>Justificativa:</b> {i.justificativa}</span>}
              </span>
            </label>
          ))}
        </>
      )}
      {variantes.filter((i) => !i.reduzProtecao).length > 0 && (
        <>
          <div className="section-title"><h2>Demais alterações</h2></div>
          <div className="card flush">
            <div className="minuta-itens">
              {variantes.filter((i) => !i.reduzProtecao).map((i) => (
                <div key={i.numero} className="minuta-item">
                  <span className="n">{i.numero.replace('decl:', '')}.</span>
                  <span className="tx"><Selo it={i} /><span className={`t${i.suprimido ? ' sup' : ''}`}>{i.suprimido ? 'Não se aplica.' : i.texto.replace(/\*\*/g, '')}</span>{i.justificativa && <span className="var-exp"><b>Justificativa:</b> {i.justificativa}</span>}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {aceitos.length > 0 && (
        <>
          <div className="section-title"><h2>Achados aceitos com justificativa</h2></div>
          {aceitos.map((x) => (
            <div key={x.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}><span className={`chip ${x.severidade === 'alta' ? 'bad' : x.severidade === 'media' ? 'warn' : ''}`}>{x.severidade}</span><span className="chip">{x.numero}</span></div>
              <div style={{ fontWeight: 900, marginTop: 6 }}>{x.titulo}</div>
              <p style={{ margin: '4px 0 0', fontSize: 12.5 }}><b>Justificativa:</b> {x.justificativa}</p>
            </div>
          ))}
        </>
      )}

      <div className="lote-acoes" style={{ marginTop: 10 }}>
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('pdf')}><Icon name="doc" /> {baixando === 'pdf' ? 'Gerando…' : 'Baixar minuta PDF'}</button>
        <button type="button" className="link" disabled={baixando !== null} onClick={() => void baixar('docx')}><Icon name="doc" /> {baixando === 'docx' ? 'Gerando…' : 'Baixar minuta .docx'}</button>
      </div>

      {podeAprovar && (
        <div className="pair" style={{ marginTop: 12 }}>
          <Button variant="ghost" disabled={devolver.isPending} onClick={() => { setComentario(''); setDevolvendo(true); }}>Devolver</Button>
          <Button icon="check" disabled={!todosLidos || aprovar.isPending || !c.conteudoHash} onClick={() => void aprovar.mutateAsync({ hash: c.conteudoHash!, itensLidos: [...lidos] }).then(() => toast('Contrato aprovado. A emissão (número, .docx e PDF finais) vem no próximo passo.')).catch((e) => toast(e instanceof Error ? e.message : 'Não foi possível aprovar.'))}>
            {aprovar.isPending ? 'Aprovando…' : 'Aprovar'}
          </Button>
        </div>
      )}
      {podeAprovar && !todosLidos && <p className="lead" style={{ fontSize: 12, marginTop: 6 }}>Marque "li e aprovo" em cada variante que reduz proteção para liberar a aprovação.</p>}

      <Drawer
        aberto={devolvendo}
        onFechar={() => setDevolvendo(false)}
        titulo="Devolver para ajustes"
        subtitulo="O comentário é obrigatório e aparece para quem montou o contrato."
        rodape={
          <Button block icon="arrow" disabled={comentario.trim().length < 3 || devolver.isPending} onClick={() => void devolver.mutateAsync(comentario).then(() => { setDevolvendo(false); toast('Contrato devolvido com comentário.'); }).catch((e) => toast(e instanceof Error ? e.message : 'Falhou'))}>
            Devolver
          </Button>
        }
      >
        <div className="field">
          <label>O que precisa mudar?</label>
          <textarea rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: incluir o seguro RC no item 15 e corrigir o prazo do quadro." />
        </div>
      </Drawer>
    </>
  );
}
