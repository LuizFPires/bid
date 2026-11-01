import { useEffect, useMemo, useRef, useState } from 'react';
import {
  aplicarBloco,
  derivarAnexos,
  divergenciaValor,
  fmtQtd,
  fmtUnit,
  formatBRL,
  importarXlsxLinhas,
  numeroBR,
  precisaRatificacao,
  reconciliarItensBlocos,
  sugerirBlocos,
  textoAnexoIII,
  totaisPorGrupo,
  totalLinha,
  totalPlanilha,
  type BlocoModelo,
  type LinhaPlanilha,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';
import { useToast } from '../app/Toast';
import { lerPlanilhaArquivo } from '../lib/xlsx';
import { useBlocosModelo, useSalvarContratoV2, type ContratoV2Detalhe } from '../data/contrato-v2';

/* =========================== Etapa 4 · Planilha =========================== */

type LinhaEdit = LinhaPlanilha & { _k: number };

export function EtapaPlanilha({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const salvar = useSalvarContratoV2(c.id);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaEdit[] | null>(null); // null = sem edição local
  const [aberta, setAberta] = useState<number | null>(null);
  const base: LinhaEdit[] = useMemo(() => c.planilha.map((l, i) => ({ _k: i + 1, codigo: l.codigo, grupo: l.grupo, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade, preco_unitario: l.preco_unitario })), [c.planilha]);
  const chavePlanilha = JSON.stringify(c.planilha);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLinhas(null), [c.id, chavePlanilha]);
  const atual = linhas ?? base;
  const soma = totalPlanilha(atual);
  const valorProposta = c.dossie?.proposta.valor ?? null;
  const dif = divergenciaValor(soma, valorProposta);
  const sujo = linhas !== null;

  const totaisGrupo = useMemo(() => new Map([...totaisPorGrupo(atual)].map(([i, t]) => [atual[i]!._k, t])), [atual]);

  function editar(k: number, patch: Partial<LinhaPlanilha>) {
    setLinhas((ls) => (ls ?? base).map((l) => (l._k === k ? { ...l, ...patch } : l)));
  }
  function adicionar(grupo: boolean) {
    const k = Math.max(0, ...atual.map((l) => l._k)) + 1;
    setLinhas([...(linhas ?? base), { _k: k, codigo: null, grupo, descricao: '', unidade: grupo ? null : 'un', quantidade: null, preco_unitario: null }]);
    setAberta(k);
  }
  function remover(k: number) {
    setLinhas((ls) => (ls ?? base).filter((l) => l._k !== k));
    setAberta(null);
  }
  async function importar(file: File) {
    try {
      const rows = await lerPlanilhaArquivo(file);
      const r = importarXlsxLinhas(rows);
      if (!r.linhas.length) return toast(r.avisos[0] ?? 'Planilha vazia.');
      setLinhas(r.linhas.map((l, i) => ({ ...l, _k: i + 1 })));
      toast(`${r.linhas.length} linhas importadas${r.avisos.length ? ` · ${r.avisos[0]}` : ''}. Confira e salve.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ler a planilha.');
    }
  }
  async function gravar() {
    const invalida = atual.find((l) => !l.descricao.trim());
    if (invalida) return toast('Há linha sem descrição.');
    try {
      await salvar.mutateAsync({ planilha: atual.map(({ _k: _, ...l }) => l) });
      setLinhas(null);
      toast('Planilha salva. O valor do contrato é a soma das linhas.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  const linhaAberta = atual.find((l) => l._k === aberta) ?? null;
  const nItens = atual.filter((l) => !l.grupo).length;
  const nGrupos = atual.filter((l) => l.grupo).length;

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Planilha de preços (Anexo I)</h2>
        <span className="c">{nItens} {nItens === 1 ? 'item' : 'itens'}{nGrupos ? ` · ${nGrupos} grupos` : ''}</span>
      </div>
      <div className={`banner ${dif.difere ? 'warn' : 'ok'}`} style={{ marginBottom: 12 }}>
        <Icon name={dif.difere ? 'alert' : 'check'} />
        <span>
          Soma <b>{formatBRL(soma)}</b>
          {valorProposta != null ? (dif.difere ? ` · difere da proposta (${formatBRL(valorProposta)}) em ${formatBRL(Math.abs(dif.diferenca))}. A revisão por IA vai apontar.` : ' · confere com a proposta.') : '.'}
        </span>
      </div>

      {atual.length === 0 ? (
        <div className="card empty">Sem linhas. Importe a planilha do fornecedor (.xlsx/.csv) ou adicione itens.</div>
      ) : (
        <div className="card flush" style={{ overflow: 'hidden' }}>
          <table className="pl">
            <tbody>
              {atual.map((l) =>
                l.grupo ? (
                  <tr key={l._k} className="g" onClick={() => editavel && setAberta(l._k)}>
                    <td>{l.codigo ? <span className="cod">{l.codigo}</span> : null}{l.descricao || <i>grupo sem nome</i>}</td>
                    <td className="r">{formatBRL(totaisGrupo.get(l._k) ?? 0)}</td>
                  </tr>
                ) : (
                  <tr key={l._k} onClick={() => editavel && setAberta(l._k)}>
                    <td>
                      {l.codigo ? <span className="cod">{l.codigo}</span> : null}
                      {l.descricao || <i>sem descrição</i>}
                      <div className="mut">
                        {fmtQtd(l.quantidade)} {l.unidade ?? ''} × {fmtUnit(l.preco_unitario)}
                      </div>
                    </td>
                    <td className="r">{(() => { const t = totalLinha(l.quantidade, l.preco_unitario); return t == null ? '—' : t.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); })()}</td>
                  </tr>
                ),
              )}
              <tr className="g total">
                <td>Total</td>
                <td className="r">{formatBRL(soma)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {editavel && (
        <>
          <div className="lote-acoes" style={{ marginTop: 10 }}>
            <button type="button" className="link" onClick={() => adicionar(false)}><Icon name="plus" /> Item</button>
            <button type="button" className="link" onClick={() => adicionar(true)}><Icon name="plus" /> Grupo</button>
            <button type="button" className="link" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Importar .xlsx/.csv</button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ''; }} />
          </div>
          <Button block icon="check" disabled={!sujo || salvar.isPending} style={{ marginTop: 10 }} onClick={() => void gravar()}>
            {salvar.isPending ? 'Salvando…' : sujo ? 'Salvar planilha' : 'Planilha salva'}
          </Button>
        </>
      )}

      <Drawer
        aberto={linhaAberta !== null}
        onFechar={() => setAberta(null)}
        titulo={linhaAberta?.grupo ? 'Grupo' : 'Item da planilha'}
        subtitulo="Preço unitário com até 4 casas; o total da linha é arredondado a 2."
        rodape={
          <div className="pair" style={{ width: '100%' }}>
            <Button variant="ghost" onClick={() => linhaAberta && remover(linhaAberta._k)}>Remover</Button>
            <Button icon="check" onClick={() => setAberta(null)}>Pronto</Button>
          </div>
        }
      >
        {linhaAberta && (
          <>
            <div className="pair">
              <div className="field">
                <label>Código</label>
                <input value={linhaAberta.codigo ?? ''} onChange={(e) => editar(linhaAberta._k, { codigo: e.target.value || null })} placeholder="2.1" />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select value={linhaAberta.grupo ? 'grupo' : 'item'} onChange={(e) => editar(linhaAberta._k, { grupo: e.target.value === 'grupo' })}>
                  <option value="item">Item</option>
                  <option value="grupo">Grupo</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Descrição</label>
              <input value={linhaAberta.descricao} onChange={(e) => editar(linhaAberta._k, { descricao: e.target.value })} placeholder="Estaca hélice contínua Ø40 cm" />
            </div>
            {!linhaAberta.grupo && (
              <>
                <div className="pair">
                  <div className="field">
                    <label>Unidade</label>
                    <input value={linhaAberta.unidade ?? ''} onChange={(e) => editar(linhaAberta._k, { unidade: e.target.value || null })} placeholder="m" />
                  </div>
                  <div className="field">
                    <label>Quantidade</label>
                    <input key={`q${linhaAberta._k}`} inputMode="decimal" defaultValue={linhaAberta.quantidade != null ? fmtQtd(linhaAberta.quantidade) : ''} onBlur={(e) => editar(linhaAberta._k, { quantidade: numeroBR(e.target.value) })} placeholder="1.800" />
                  </div>
                </div>
                <div className="pair">
                  <div className="field">
                    <label>Preço unitário (R$)</label>
                    <input key={`u${linhaAberta._k}`} inputMode="decimal" defaultValue={linhaAberta.preco_unitario != null ? fmtUnit(linhaAberta.preco_unitario) : ''} onBlur={(e) => editar(linhaAberta._k, { preco_unitario: numeroBR(e.target.value) })} placeholder="152,4725" />
                  </div>
                  <div className="field">
                    <label>Total</label>
                    <input value={(() => { const t = totalLinha(linhaAberta.quantidade, linhaAberta.preco_unitario); return t == null ? '' : formatBRL(t); })()} disabled />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

/* ==================== Etapa 5 · Condições específicas ==================== */

interface Escolha {
  marcado: boolean;
  params: Record<string, string>;
}

export function EtapaCondicoes({ c, editavel }: { c: ContratoV2Detalhe; editavel: boolean }) {
  const salvar = useSalvarContratoV2(c.id);
  const toast = useToast();
  const blocosQ = useBlocosModelo(c.modeloId);
  const blocos = blocosQ.data ?? [];
  const sugestoes = useMemo(() => sugerirBlocos(c.categoria, c.dossie, blocos), [c.categoria, c.dossie, blocos]);

  // Anexo III (proposta anexada) — guardado nos parâmetros.
  const p = c.parametros;
  const incluirPadrao = p.anexo_iii_incluir ? p.anexo_iii_incluir === 'sim' : !!c.dossie?.proposta.arquivoPath;
  const [anexoIII, setAnexoIII] = useState({
    incluir: incluirPadrao,
    numero: p.prop_numero ?? '',
    data: p.prop_data ?? '',
    emitente: p.prop_emitente ?? c.dossie?.proposta.fornecedor ?? '',
    destinatario: p.prop_destinatario ?? '',
  });
  const chaveParams = JSON.stringify([p.anexo_iii_incluir, p.prop_numero, p.prop_data, p.prop_emitente, p.prop_destinatario]);
  useEffect(() => {
    setAnexoIII({ incluir: p.anexo_iii_incluir ? p.anexo_iii_incluir === 'sim' : !!c.dossie?.proposta.arquivoPath, numero: p.prop_numero ?? '', data: p.prop_data ?? '', emitente: p.prop_emitente ?? c.dossie?.proposta.fornecedor ?? '', destinatario: p.prop_destinatario ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, chaveParams]);
  const ratificacaoObrigatoria = precisaRatificacao(c.partes, { incluir: anexoIII.incluir, emitente: anexoIII.emitente, destinatario: anexoIII.destinatario });

  // Estado por bloco: começa pelo que já está no contrato; senão pela sugestão.
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  useEffect(() => {
    const e: Record<string, Escolha> = {};
    for (const s of sugestoes) {
      const aplicado = c.blocos.find((b) => b.chave === s.chave);
      e[s.chave] = aplicado
        ? { marcado: true, params: Object.fromEntries(Object.entries(aplicado.parametros ?? {}).map(([k, v]) => [k, String(v ?? '')])) }
        : { marcado: c.blocos.length ? false : s.marcado, params: { ...s.parametros } };
    }
    setEscolhas(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sugestoes), JSON.stringify(c.blocos)]);
  const [aberto, setAberto] = useState<string | null>(null);

  const marcados = blocos.filter((b) => escolhas[b.chave]?.marcado || (b.chave === 'ratificacao_proposta' && ratificacaoObrigatoria));
  const paramsDe = (chave: string): Record<string, string> => ({ ...(escolhas[chave]?.params ?? {}), ...(chave === 'ratificacao_proposta' ? { prop_numero: anexoIII.numero, prop_data: anexoIII.data, prop_emitente: anexoIII.emitente, prop_destinatario: anexoIII.destinatario } : {}) });
  const aplicados = marcados.map((b) => aplicarBloco(b, paramsDe(b.chave)));
  const faltando = aplicados.flatMap((a) => a.faltando.map((f) => `${a.titulo}: ${f}`));

  async function gravar() {
    try {
      // Itens de cláusula: alterados por bloco, inseridos, e os que saíram (regra no core).
      const itens = reconciliarItensBlocos(c.itens, aplicados);
      const anexo = anexoIII.incluir ? textoAnexoIII({ fornecedor: c.dossie?.proposta.fornecedor ?? '', numero: anexoIII.numero || null, data: anexoIII.data || null, destinatario: anexoIII.destinatario || null }) : null;
      const derivados = derivarAnexos({ anexoIII: anexoIII.incluir });
      await salvar.mutateAsync({
        blocos: aplicados.map((a) => ({ chave: a.chave, titulo: a.titulo, itens: a.itens, parametros: paramsDe(a.chave) })),
        ...(itens.length ? { itens } : {}),
        parametros: {
          anexo_iii_incluir: anexoIII.incluir ? 'sim' : 'nao',
          anexo_iii_titulo: anexo?.titulo ?? '',
          anexo_iii_texto: anexo?.texto ?? '',
          prop_numero: anexoIII.numero,
          prop_data: anexoIII.data,
          prop_emitente: anexoIII.emitente,
          prop_destinatario: anexoIII.destinatario,
          ...derivados,
        },
      });
      toast(`Condições salvas: ${aplicados.length} ${aplicados.length === 1 ? 'bloco' : 'blocos'} no Anexo I.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  const blocoAberto = blocos.find((b) => b.chave === aberto) ?? null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        <h2>Condições específicas (Anexo I)</h2>
        <span className="c">{marcados.length} {marcados.length === 1 ? 'bloco' : 'blocos'}</span>
      </div>
      {blocosQ.isLoading && <div className="card empty">Carregando a biblioteca…</div>}
      {!blocosQ.isLoading && blocos.length === 0 && <div className="card empty">A minuta ativa não tem biblioteca de blocos carregada.</div>}
      {blocos.length > 0 && (
        <div className="card rowlist">
          {sugestoes.map((s) => {
            const b = blocos.find((x) => x.chave === s.chave)!;
            const esc = escolhas[s.chave] ?? { marcado: false, params: {} };
            const obrigatoria = s.chave === 'ratificacao_proposta' && ratificacaoObrigatoria;
            const on = esc.marcado || obrigatoria;
            const apl = aplicados.find((a) => a.chave === s.chave);
            return (
              <div key={s.chave} className="row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setAberto(s.chave)}>
                <span className={`ck${on ? ' on' : ''}`} aria-hidden="true" onClick={(e) => { e.stopPropagation(); if (editavel && !obrigatoria) setEscolhas((x) => { const cur = x[s.chave] ?? { marcado: false, params: {} }; return { ...x, [s.chave]: { ...cur, marcado: !cur.marcado } }; }); }}>
                  {on && <Icon name="check" />}
                </span>
                <span className="tt">
                  <span className="t1">{b.titulo}</span>
                  <span className="t2">{obrigatoria ? 'obrigatório: proposta dirigida a outra empresa (RC-14)' : s.motivo}{apl && apl.faltando.length ? ` · faltam ${apl.faltando.length} ${apl.faltando.length === 1 ? 'parâmetro' : 'parâmetros'}` : ''}</span>
                </span>
                <Icon name="chev" />
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 18 }}>
        <h2>Anexo III · proposta anexada</h2>
        <span className="c">{anexoIII.incluir ? 'incluída' : 'não incluída'}</span>
      </div>
      <div className="card">
        <label className="lote-versao" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={anexoIII.incluir} disabled={!editavel} onChange={(e) => setAnexoIII({ ...anexoIII, incluir: e.target.checked })} />
          <span><b>Anexar a proposta comercial como Anexo III.</b> O arquivo da proposta, como arquivado no bid, entra no fim do PDF do contrato. Em conflito, prevalecem o contrato e o Anexo I (cláusula 1.3).</span>
        </label>
        {anexoIII.incluir && (
          <>
            <div className="pair">
              <div className="field"><label>Nº da proposta</label><input value={anexoIII.numero} disabled={!editavel} onChange={(e) => setAnexoIII({ ...anexoIII, numero: e.target.value })} placeholder="045/2026" /></div>
              <div className="field"><label>Data</label><input value={anexoIII.data} disabled={!editavel} onChange={(e) => setAnexoIII({ ...anexoIII, data: e.target.value })} placeholder="20/10/2026" /></div>
            </div>
            <div className="field"><label>Emitente (quem assina a proposta)</label><input value={anexoIII.emitente} disabled={!editavel} onChange={(e) => setAnexoIII({ ...anexoIII, emitente: e.target.value })} /></div>
            <div className="field"><label>Dirigida a</label><input value={anexoIII.destinatario} disabled={!editavel} onChange={(e) => setAnexoIII({ ...anexoIII, destinatario: e.target.value })} placeholder="Empresa destinatária original" /></div>
            {ratificacaoObrigatoria && (
              <div className="banner warn" role="status">
                <Icon name="alert" />
                <span>Emitente ou destinatário divergem das partes: o bloco <b>Proposta anexada e prevalência</b> entra obrigatoriamente, e os itens 1.3, 1.4 e 22.4 são trocados (RC-14).</span>
              </div>
            )}
          </>
        )}
      </div>

      {faltando.length > 0 && (
        <p className="lead" style={{ color: 'var(--warn)', fontWeight: 800, marginTop: 10 }}>
          Parâmetros em aberto: {faltando.join(' · ')}. Entram como pendência até serem preenchidos.
        </p>
      )}
      {editavel && (
        <Button block icon="check" disabled={salvar.isPending || blocosQ.isLoading} style={{ marginTop: 12 }} onClick={() => void gravar()}>
          {salvar.isPending ? 'Salvando…' : 'Salvar condições e Anexo III'}
        </Button>
      )}

      <Drawer
        aberto={blocoAberto !== null}
        onFechar={() => setAberto(null)}
        titulo={blocoAberto?.titulo ?? ''}
        subtitulo={blocoAberto?.quando ?? undefined}
        rodape={<Button block icon="check" onClick={() => setAberto(null)}>Pronto</Button>}
      >
        {blocoAberto && (
          <DetalheBloco
            bloco={blocoAberto}
            escolha={escolhas[blocoAberto.chave] ?? { marcado: false, params: {} }}
            editavel={editavel}
            obrigatoria={blocoAberto.chave === 'ratificacao_proposta' && ratificacaoObrigatoria}
            paramsExtras={blocoAberto.chave === 'ratificacao_proposta' ? { prop_numero: anexoIII.numero, prop_data: anexoIII.data, prop_emitente: anexoIII.emitente, prop_destinatario: anexoIII.destinatario } : {}}
            onChange={(esc) => setEscolhas((x) => ({ ...x, [blocoAberto.chave]: esc }))}
          />
        )}
      </Drawer>
    </>
  );
}

function DetalheBloco({ bloco, escolha, editavel, obrigatoria, paramsExtras, onChange }: { bloco: BlocoModelo; escolha: Escolha; editavel: boolean; obrigatoria: boolean; paramsExtras: Record<string, string>; onChange: (e: Escolha) => void }) {
  const params = { ...escolha.params, ...paramsExtras };
  const apl = aplicarBloco(bloco, params);
  return (
    <>
      <label className="lote-versao">
        <input type="checkbox" checked={escolha.marcado || obrigatoria} disabled={!editavel || obrigatoria} onChange={(e) => onChange({ ...escolha, marcado: e.target.checked })} />
        <span><b>Incluir no Anexo I.</b> {obrigatoria ? 'Obrigatório neste contrato (RC-14).' : bloco.quando ?? ''}</span>
      </label>
      {bloco.parametros.filter((p) => !(p.chave in paramsExtras)).map((p) => (
        <div key={p.chave} className="field">
          <label>{p.rotulo}</label>
          {p.tipo === 'opcoes' && p.opcoes ? (
            <select value={params[p.chave] ?? ''} disabled={!editavel} onChange={(e) => onChange({ ...escolha, params: { ...escolha.params, [p.chave]: e.target.value } })}>
              <option value="">Escolha…</option>
              {p.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : p.tipo === 'sim_nao' ? (
            <select value={params[p.chave] ?? ''} disabled={!editavel} onChange={(e) => onChange({ ...escolha, params: { ...escolha.params, [p.chave]: e.target.value } })}>
              <option value="">Escolha…</option>
              <option value="sim">Sim</option>
              <option value="não">Não</option>
            </select>
          ) : p.tipo === 'lista' || p.tipo === 'texto_longo' ? (
            <textarea rows={3} value={params[p.chave] ?? ''} disabled={!editavel} onChange={(e) => onChange({ ...escolha, params: { ...escolha.params, [p.chave]: e.target.value } })} placeholder={p.tipo === 'lista' ? 'um por linha' : ''} />
          ) : (
            <input value={params[p.chave] ?? ''} disabled={!editavel} inputMode={p.tipo === 'moeda' ? 'decimal' : undefined} onChange={(e) => onChange({ ...escolha, params: { ...escolha.params, [p.chave]: e.target.value } })} />
          )}
        </div>
      ))}
      {bloco.parametros.filter((p) => p.chave in paramsExtras).length > 0 && <p className="lead" style={{ fontSize: 12 }}>Nº, data, emitente e destinatário vêm da seção Anexo III.</p>}
      <div className="section-title" style={{ marginTop: 6 }}>
        <h2 style={{ fontSize: 14 }}>Como fica no Anexo I</h2>
      </div>
      <ol className="num-list">
        {apl.itens.map((t, i) => (
          <li key={i}><span className="num">{i + 1}</span><div style={{ fontSize: 13 }}>{t}</div></li>
        ))}
      </ol>
      {apl.alteracoes.length > 0 && (
        <p className="lead" style={{ fontSize: 12, marginTop: 8 }}>
          Também altera {apl.alteracoes.map((a) => a.numero ? `o item ${a.numero}` : `insere após ${a.apos}`).join(', ')} da minuta (origem "bloco").
        </p>
      )}
    </>
  );
}
