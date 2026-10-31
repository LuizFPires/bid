import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LOTE_MAX_ARQUIVOS,
  formatBRL,
  fornecedoresRepetidos,
  normalizarExtracao,
  podeArquivarLote,
  proximoAConferir,
  resumoLote,
  totalPropostasDoLote,
  type ItemLote,
  type Lote,
  type PropostaExtraida,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';
import { BarraAcao } from '../app/BarraAcao';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { useToast } from '../app/Toast';
import { AlertasLeitura } from '../components/AlertasLeitura';
import { fetchPropostasDaCategoriaNaObra } from '../data/queries';
import { ACCEPT_PROPOSTA } from '../data/mutations';
import {
  arquivarLote,
  confirmarItem,
  descartarLote,
  incluirArquivos,
  reabrirItem,
  removerItem,
  retomarLote,
  tentarDeNovo,
  useLote,
} from '../data/lote';

/* ---------- Tela do lote: leitura em paralelo → conferir um a um → arquivar ---------- */

export function LoteScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const lote = useLote();
  const [aberto, setAberto] = useState<string | null>(null);
  const [arquivando, setArquivando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    retomarLote();
  }, []);

  const existentes = useQuery({
    queryKey: ['lote-existentes', lote?.obraId, lote?.categoria],
    queryFn: () => fetchPropostasDaCategoriaNaObra(lote!.obraId, lote!.categoria),
    enabled: !!lote,
  });

  const resumo = useMemo(() => (lote ? resumoLote(lote) : null), [lote]);
  const repetidos = useMemo(
    () => (lote ? fornecedoresRepetidos(lote, existentes.data ?? []) : { noLote: new Set<string>(), jaExiste: new Map() }),
    [lote, existentes.data],
  );

  if (!lote || !resumo) {
    return (
      <>
        <div className="crumb">
          <button onClick={() => navigate('/propostas')}>Propostas</button>
          <Icon name="chev" />
          <span>Lote</span>
        </div>
        <div className="card">
          <div className="empty">
            Nenhum lote em andamento.
            <div style={{ marginTop: 12 }}>
              <Button variant="soft" icon="plus" onClick={() => navigate('/propostas/nova')}>
                Nova proposta
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const itemAberto = lote.itens.find((i) => i.id === aberto) ?? null;
  const pronto = podeArquivarLote(lote);
  const totalPropostas = totalPropostasDoLote(lote);
  const lendo = resumo.emAndamento > 0;

  async function arquivar() {
    if (!lote || !pronto) return;
    setArquivando(true);
    setErro(null);
    try {
      const r = await arquivarLote();
      qc.invalidateQueries({ queryKey: ['acervo'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['obra'] });
      qc.invalidateQueries({ queryKey: ['sugestoes'] });
      navigate('/propostas/lote/concluido', { replace: true, state: { ...r, obraNome: lote.obraNome, total: r.ids.length } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível arquivar o lote.');
    } finally {
      setArquivando(false);
    }
  }

  function abrirProximo(apos: string | null) {
    const prox = lote ? proximoAConferir(lote, apos) : null;
    setAberto(prox?.id ?? null);
    if (!prox && lote && podeArquivarLote(lote)) toast('Tudo conferido. Pode arquivar o lote.');
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Propostas</button>
        <Icon name="chev" />
        <span>Lote · {lote.categoria}</span>
      </div>

      <div className="page-head">
        <h1>{lendo ? `Lendo ${resumo.total} propostas` : `Conferir ${resumo.total} propostas`}</h1>
        <p className="lead">
          {lote.categoria} · {lote.obraNome}.{' '}
          {lendo
            ? 'A IA lê os arquivos ao mesmo tempo; você pode ir conferindo as que já ficaram prontas.'
            : 'Toque em cada uma, confira os dados que a IA leu e confirme. Só as confirmadas são arquivadas.'}
        </p>
      </div>

      <div className="lote-prog" aria-label="Progresso da leitura">
        <div className="prog-bar">
          <span className="prog-fill" style={{ width: `${Math.round(resumo.progressoLeitura * 100)}%` }} />
        </div>
        <small>
          {resumo.confirmadas} de {resumo.total} confirmadas
          {lendo ? ` · ${resumo.emAndamento} em leitura` : ''}
        </small>
      </div>

      <div className="card rowlist">
        {lote.itens.map((it, idx) => (
          <LinhaItem
            key={it.id}
            item={it}
            n={idx + 1}
            repetidoNoLote={repetidos.noLote.has(it.id)}
            jaExiste={repetidos.jaExiste.get(it.id)?.fornecedor ?? null}
            onAbrir={() => {
              if (it.situacao === 'fila' || it.situacao === 'lendo') return;
              if (it.situacao === 'confirmada') reabrirItem(it.id);
              setAberto(it.id);
            }}
            onRemover={() => removerItem(it.id)}
            onTentar={() => tentarDeNovo(it.id)}
          />
        ))}
      </div>

      <div className="lote-acoes">
        {lote.itens.length < LOTE_MAX_ARQUIVOS && (
          <>
            <button type="button" className="link" onClick={() => fileRef.current?.click()}>
              <Icon name="plus" /> Incluir mais arquivos
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT_PROPOSTA}
              style={{ display: 'none' }}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) incluirArquivos(fs);
                e.target.value = '';
              }}
            />
          </>
        )}
        <button type="button" className="link danger" onClick={() => setDescartando(true)}>
          <Icon name="trash" /> Descartar lote
        </button>
      </div>

      {erro && (
        <div className="banner warn" role="alert" style={{ marginTop: 14 }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      <BarraAcao>
        <Button block icon="check" disabled={!pronto || arquivando} onClick={() => void arquivar()}>
          {arquivando
            ? 'Arquivando…'
            : pronto
              ? `Arquivar ${totalPropostas} ${totalPropostas === 1 ? 'proposta' : 'propostas'}`
              : lendo
                ? 'Aguardando a leitura…'
                : `Confira ${resumo.total - resumo.confirmadas} para arquivar`}
        </Button>
      </BarraAcao>

      <DrawerConferencia
        lote={lote}
        item={itemAberto}
        jaExiste={itemAberto ? (repetidos.jaExiste.get(itemAberto.id) ?? null) : null}
        onFechar={() => setAberto(null)}
        onConfirmar={(dados, marcadas, novaVersaoDe) => {
          if (!itemAberto) return;
          confirmarItem(itemAberto.id, dados, marcadas, novaVersaoDe);
          abrirProximo(itemAberto.id);
        }}
      />

      <ConfirmDialog
        aberto={descartando}
        titulo="Descartar este lote?"
        confirmarLabel="Descartar"
        onCancelar={() => setDescartando(false)}
        onConfirmar={() => {
          descartarLote();
          setDescartando(false);
          navigate('/propostas', { replace: true });
        }}
      >
        Nada foi arquivado ainda. Os arquivos já enviados ficam no armazenamento, mas não viram propostas.
      </ConfirmDialog>
    </>
  );
}

function LinhaItem({
  item,
  n,
  repetidoNoLote,
  jaExiste,
  onAbrir,
  onRemover,
  onTentar,
}: {
  item: ItemLote;
  n: number;
  repetidoNoLote: boolean;
  jaExiste: string | null;
  onAbrir: () => void;
  onRemover: () => void;
  onTentar: () => void;
}) {
  const d = item.dados;
  const nome = d?.fornecedor?.trim() || item.nomeArquivo;
  const partes: string[] = [];
  if (d?.valor != null) partes.push(formatBRL(d.valor));
  if (d?.prazo_dias != null) partes.push(`${d.prazo_dias} dias`);
  if ((d?.opcoes.length ?? 0) >= 2) partes.push(`${d!.opcoes.length} opções de preço`);
  if ((d?.alertas.length ?? 0) > 0) partes.push(`${d!.alertas.length} ${d!.alertas.length === 1 ? 'alerta' : 'alertas'}`);

  const st = item.situacao;
  const sub =
    st === 'fila'
      ? 'na fila'
      : st === 'lendo'
        ? item.arquivoPath
          ? 'lendo…'
          : 'enviando…'
        : st === 'erro'
          ? (item.erro ?? 'falhou')
          : st === 'manual'
            ? 'a IA não lê este formato · preencha à mão'
            : partes.join(' · ') || 'sem dados lidos · preencha à mão';

  const chip =
    st === 'confirmada' ? (
      <span className="chip ok">confirmada</span>
    ) : st === 'lida' ? (
      <span className="chip on">conferir</span>
    ) : st === 'erro' ? (
      <span className="chip bad">erro</span>
    ) : st === 'manual' ? (
      <span className="chip warn">manual</span>
    ) : st === 'lendo' ? (
      <span className="chip">
        <span className="spin" aria-hidden="true" />
      </span>
    ) : (
      <span className="chip">aguarda</span>
    );

  const clicavel = st !== 'fila' && st !== 'lendo';
  return (
    <div
      className={`row lote-row${clicavel ? ' clicavel' : ''}`}
      role={clicavel ? 'button' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={clicavel ? onAbrir : undefined}
      onKeyDown={(e) => {
        if (clicavel && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      <span className={`ic ${st === 'confirmada' ? 'ok' : st === 'erro' || st === 'manual' ? 'warn' : ''}`}>
        {st === 'confirmada' ? <Icon name="check" /> : st === 'erro' || st === 'manual' ? <Icon name="alert" /> : n}
      </span>
      <span className="tt">
        <span className="t1">{nome}</span>
        <span className="t2">{sub}</span>
        {(repetidoNoLote || jaExiste) && (
          <span className="t2" style={{ color: 'var(--warn)' }}>
            {repetidoNoLote ? 'repetido no lote' : `já existe "${jaExiste}" nesta categoria`}
          </span>
        )}
      </span>
      <span className="rt" onClick={(e) => e.stopPropagation()}>
        {chip}
        {(st === 'erro' || st === 'fila') && (
          <span className="lote-mini">
            {st === 'erro' && (
              <button type="button" className="link" onClick={onTentar}>
                tentar de novo
              </button>
            )}
            <button type="button" className="link danger" onClick={onRemover} aria-label="Remover do lote">
              remover
            </button>
          </span>
        )}
      </span>
    </div>
  );
}

/* ---------- Drawer de conferência (mesmos campos do fluxo de 1 arquivo) ---------- */

function DrawerConferencia({
  lote,
  item,
  jaExiste,
  onFechar,
  onConfirmar,
}: {
  lote: Lote;
  item: ItemLote | null;
  jaExiste: { id: string; fornecedor: string } | null;
  onFechar: () => void;
  onConfirmar: (dados: PropostaExtraida, opcoesMarcadas: boolean[], novaVersaoDe: string | null) => void;
}) {
  const [fornecedor, setFornecedor] = useState('');
  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [pagamento, setPagamento] = useState('');
  const [garantia, setGarantia] = useState('');
  const [obs, setObs] = useState('');
  const [marcadas, setMarcadas] = useState<boolean[]>([]);
  const [precoUnico, setPrecoUnico] = useState(false);
  const [comoVersao, setComoVersao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const d = item?.dados;
    setFornecedor(d?.fornecedor ?? '');
    setValor(d?.valor != null ? formatBRL(d.valor).replace('R$', '').trim() : '');
    setPrazo(d?.prazo_dias != null ? String(d.prazo_dias) : '');
    setPagamento(d?.condicao_pagamento ?? '');
    setGarantia(d?.garantia ?? '');
    setObs(d?.observacoes ?? '');
    setMarcadas(item?.opcoesMarcadas.length ? item.opcoesMarcadas : (d?.opcoes.map(() => true) ?? []));
    setPrecoUnico(false);
    setComoVersao(!!item?.novaVersaoDe);
    setErro(null);
  }, [item]);

  if (!item) return null;
  const d = item.dados;
  const opcoes = precoUnico ? [] : (d?.opcoes ?? []);
  const comOpcoes = opcoes.length >= 2;
  const nMarcadas = marcadas.filter(Boolean).length;
  const idx = lote.itens.findIndex((i) => i.id === item.id) + 1;

  function confirmar() {
    if (!fornecedor.trim()) {
      setErro('Informe o fornecedor.');
      return;
    }
    if (comOpcoes && nMarcadas === 0) {
      setErro('Marque ao menos uma opção de preço.');
      return;
    }
    const limpos = normalizarExtracao({
      fornecedor,
      valor,
      prazo_dias: prazo,
      condicao_pagamento: pagamento,
      garantia,
      observacoes: obs,
      itens: d?.itens ?? [],
      alertas: d?.alertas ?? [],
      opcoes: comOpcoes ? opcoes : [],
    });
    onConfirmar({ ...limpos, fornecedor: fornecedor.trim() }, comOpcoes ? marcadas : [], comoVersao && jaExiste && !comOpcoes ? jaExiste.id : null);
  }

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={`${idx} de ${lote.itens.length} · ${fornecedor.trim() || item.nomeArquivo}`}
      subtitulo={
        item.situacao === 'erro'
          ? `${item.nomeArquivo} · ${item.erro ?? 'a IA não leu'} — preencha à mão.`
          : item.situacao === 'manual'
            ? `${item.nomeArquivo} · planilha: preencha à mão.`
            : `${item.nomeArquivo} · lido pela IA — confira e ajuste.`
      }
      rodape={
        <div className="pair" style={{ width: '100%' }}>
          <Button type="button" variant="ghost" onClick={onFechar}>
            Voltar
          </Button>
          <Button type="button" icon="check" onClick={confirmar}>
            Confirmar e próxima
          </Button>
        </div>
      }
    >
      <AlertasLeitura alertas={d?.alertas ?? []} compacto />

      {jaExiste && !comOpcoes && (
        <label className="lote-versao">
          <input type="checkbox" checked={comoVersao} onChange={(e) => setComoVersao(e.target.checked)} />
          <span>
            <b>Já existe “{jaExiste.fornecedor}” nesta categoria.</b> Arquivar como <b>nova versão</b> dessa proposta em vez de criar outra.
          </span>
        </label>
      )}

      {comOpcoes && (
        <div className="card opcoes" role="group" aria-label="Opções de preço">
          <div className="opcoes-head">
            <Icon name="alert" />
            <div>
              <strong>Este documento tem {opcoes.length} opções de preço</strong>
              <p>Cada opção marcada vira uma proposta no acervo (mesmo fornecedor e arquivo).</p>
            </div>
          </div>
          <ul className="opcoes-lista">
            {opcoes.map((op, i) => (
              <li key={i}>
                <label className="opcao">
                  <input type="checkbox" checked={!!marcadas[i]} onChange={(e) => setMarcadas((m) => m.map((x, j) => (j === i ? e.target.checked : x)))} />
                  <span className="tt">
                    <span className="t1">{op.rotulo}</span>
                    {op.descricao && <span className="t2">{op.descricao}</span>}
                  </span>
                  <span className="v">{op.valor != null ? formatBRL(op.valor) : '—'}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="link"
            onClick={() => {
              const v = opcoes[0]?.valor;
              if (v != null) setValor(formatBRL(v).replace('R$', '').trim());
              setPrecoUnico(true);
            }}
          >
            Não são opções — tratar como preço único
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor="lt-forn">Fornecedor</label>
        <input id="lt-forn" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Quem propôs" />
      </div>
      <div className="pair">
        {!comOpcoes && (
          <div className="field">
            <label htmlFor="lt-valor">Valor (R$)</label>
            <input id="lt-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.284.500,00" />
          </div>
        )}
        <div className="field">
          <label htmlFor="lt-prazo">Prazo (dias)</label>
          <input id="lt-prazo" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} placeholder="95" />
        </div>
      </div>
      <div className="pair">
        <div className="field">
          <label htmlFor="lt-pag">Pagamento</label>
          <input id="lt-pag" value={pagamento} onChange={(e) => setPagamento(e.target.value)} placeholder="30/40/30%" />
        </div>
        <div className="field">
          <label htmlFor="lt-gar">Garantia</label>
          <input id="lt-gar" value={garantia} onChange={(e) => setGarantia(e.target.value)} placeholder="5 anos" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="lt-obs">Observações</label>
        <textarea id="lt-obs" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Exclusões, ressalvas…" />
      </div>

      {erro && (
        <div className="banner warn" role="alert">
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Concluído: resumo + Equalizar agora ---------- */

export function LoteConcluidoScreen() {
  const navigate = useNavigate();
  const st = (useLocation().state ?? null) as { ids?: string[]; obraId?: string; categoria?: string; obraNome?: string; total?: number } | null;
  const total = st?.total ?? st?.ids?.length ?? 0;
  if (!st?.obraId || !st.categoria) {
    return (
      <div className="card">
        <div className="empty">
          Lote arquivado.
          <div style={{ marginTop: 12 }}>
            <Button variant="soft" onClick={() => navigate('/propostas')}>
              Ver propostas
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="lote-done">
      <span className="big" aria-hidden="true">
        <Icon name="check" />
      </span>
      <h1>
        {total} {total === 1 ? 'proposta arquivada' : 'propostas arquivadas'}
      </h1>
      <p className="lead">
        {st.categoria}
        {st.obraNome ? ` · ${st.obraNome}` : ''}. Todas já estão no acervo, com versão, opções e alertas de leitura.
      </p>
      <Button
        block
        icon="scale"
        onClick={() => navigate('/equalizacoes/nova', { state: { obraId: st.obraId, categoria: st.categoria } })}
        disabled={total < 2}
      >
        Equalizar agora
      </Button>
      <Button block variant="ghost" onClick={() => navigate('/propostas')} >
        Ver no acervo
      </Button>
    </div>
  );
}
