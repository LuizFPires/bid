import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatBRL,
  normalizarExtracao,
  somaItens,
  type OpcaoExtraida,
  type PropostaExtraida,
} from '@bid/core';
import { Autocomplete, Button, Icon } from '@bid/ui';
import { useObras, useSugestoes } from '../data/hooks';
import { useCriarProposta } from '../data/hooks';
import { extrairProposta, uploadPropostaArquivo } from '../data/mutations';

import { LeituraIA } from '../components/LeituraIA';

type Fase = 'form' | 'lendo' | 'conferir';

const VAZIO: PropostaExtraida = {
  fornecedor: null,
  valor: null,
  prazo_dias: null,
  condicao_pagamento: null,
  garantia: null,
  itens: [],
  opcoes: [],
  observacoes: null,
};

/** Campo de texto simples com o visual do design system. */
function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function NovaPropostaScreen() {
  const navigate = useNavigate();
  const obras = useObras();
  const categoriasSug = useSugestoes('categoria');
  const criar = useCriarProposta();

  const fileRef = useRef<HTMLInputElement>(null);
  // Evita re-upload (e arquivo órfão) se o mesmo File for reenviado após "Voltar".
  const enviadoRef = useRef<{ file: File; path: string; ehPdf: boolean } | null>(null);

  const [fase, setFase] = useState<Fase>('form');
  const [obraId, setObraId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [arquivoPath, setArquivoPath] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Campos conferíveis (string para edição livre; convertidos ao salvar).
  const [fornecedor, setFornecedor] = useState('');
  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [pagamento, setPagamento] = useState('');
  const [garantia, setGarantia] = useState('');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<PropostaExtraida['itens']>([]);
  // Alternativas de preço detectadas pela IA (≥2) e quais o usuário quer arquivar.
  // Cada opção marcada vira UMA proposta no acervo (mesmo fornecedor e arquivo).
  const [opcoes, setOpcoes] = useState<OpcaoExtraida[]>([]);
  const [opcoesMarcadas, setOpcoesMarcadas] = useState<boolean[]>([]);

  const ehPdf =
    !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  const podeProsseguir = Boolean(obraId && categoria.trim() && file);

  function preencher(d: PropostaExtraida) {
    setFornecedor(d.fornecedor ?? '');
    setValor(d.valor !== null ? formatBRL(d.valor).replace('R$', '').trim() : '');
    setPrazo(d.prazo_dias !== null ? String(d.prazo_dias) : '');
    setPagamento(d.condicao_pagamento ?? '');
    setGarantia(d.garantia ?? '');
    setObs(d.observacoes ?? '');
    setItens(d.itens);
    setOpcoes(d.opcoes);
    setOpcoesMarcadas(d.opcoes.map(() => true));
  }

  /** Volta ao fluxo de preço único (o valor fica com a opção escolhida ou a 1ª). */
  function tratarComoPrecoUnico(idx = 0) {
    const v = opcoes[idx]?.valor;
    if (v != null) setValor(formatBRL(v).replace('R$', '').trim());
    setOpcoes([]);
    setOpcoesMarcadas([]);
  }

  async function prosseguir(e: FormEvent) {
    e.preventDefault();
    if (!file || !obraId || !categoria.trim()) return;
    setErro(null);
    // Feedback IMEDIATO ao tocar (o upload + leitura levam alguns segundos).
    setFase('lendo');

    // 1) Upload: se falhar, volta ao formulário (não grava proposta sem arquivo).
    let enviado: { file: File; path: string; ehPdf: boolean };
    try {
      enviado =
        enviadoRef.current?.file === file
          ? enviadoRef.current
          : { ...(await uploadPropostaArquivo(file)), file };
      enviadoRef.current = enviado;
      setArquivoPath(enviado.path);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
      setFase('form');
      return;
    }

    // 2) Extração (só PDF): se falhar, segue para conferência manual — o arquivo
    // já subiu, então o usuário preenche os dados à mão.
    if (!enviado.ehPdf) {
      preencher(VAZIO);
      setFase('conferir');
      return;
    }
    try {
      preencher(await extrairProposta(enviado.path));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'A IA não conseguiu ler; confira manualmente.');
      preencher(VAZIO);
    }
    setFase('conferir');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!fornecedor.trim()) {
      setErro('Informe o fornecedor para arquivar.');
      return;
    }
    // Mesma normalização do core do caminho de extração (rejeita prazo não
    // positivo, entende valor no padrão brasileiro) — sem duplicar regra.
    const limpos = normalizarExtracao({
      fornecedor,
      valor,
      prazo_dias: prazo,
      condicao_pagamento: pagamento,
      garantia,
      observacoes: obs,
      itens,
    });
    const base = { ...limpos, fornecedor: fornecedor.trim() };
    const escolhidas = opcoes.filter((_, i) => opcoesMarcadas[i]);
    try {
      if (escolhidas.length === 0) {
        const id = await criar.mutateAsync({ obraId, categoria: categoria.trim(), arquivoPath, dados: base });
        // Vai direto para a proposta recém-arquivada.
        navigate(`/propostas/${id}`, { replace: true });
      } else {
        // Uma proposta por alternativa: só valor e rótulo mudam; o que a opção
        // altera no escopo vai para as observações daquela proposta.
        let primeira: string | null = null;
        for (const op of escolhidas) {
          const obsOp = [op.descricao, base.observacoes].filter(Boolean).join('\n\n') || null;
          const id = await criar.mutateAsync({
            obraId,
            categoria: categoria.trim(),
            arquivoPath,
            opcao: op.rotulo,
            dados: { ...base, valor: op.valor, observacoes: obsOp },
          });
          primeira ??= id;
        }
        // Com várias opções, o acervo mostra as propostas lado a lado; com uma só, abre ela.
        navigate(escolhidas.length === 1 && primeira ? `/propostas/${primeira}` : '/propostas', {
          replace: true,
        });
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível arquivar a proposta.');
    }
  }

  const listaObras = obras.data ?? [];
  const soma = somaItens(itens);
  const nMarcadas = opcoesMarcadas.filter(Boolean).length;
  const comOpcoes = opcoes.length >= 2;

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Propostas</button>
        <Icon name="chev" />
        <span>Nova proposta</span>
      </div>

      {fase === 'form' && (
        <>
          <div className="page-head">
            <h1>Nova proposta</h1>
            <p className="lead">Diga a obra e a categoria e anexe o arquivo — a IA lê o resto da proposta.</p>
          </div>

          {listaObras.length === 0 ? (
            <div className="card">
              <div className="empty">
                Nenhuma obra ainda. Crie uma obra antes de arquivar propostas.
                <div style={{ marginTop: 12 }}>
                  <Button variant="soft" icon="plus" onClick={() => navigate('/obras/nova')}>
                    Nova obra
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={prosseguir}>
              <div className="field">
                <label htmlFor="np-obra">Obra</label>
                <select id="np-obra" value={obraId} onChange={(e) => setObraId(e.target.value)}>
                  <option value="">Selecione a obra…</option>
                  {listaObras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </div>

              <Autocomplete
                label="Categoria de serviço"
                placeholder="Ex.: Estrutura pré-moldada"
                value={categoria}
                onChange={setCategoria}
                options={(categoriasSug.data ?? []).map((s) => s.texto)}
              />

              <div className="field">
                <label>Arquivo da proposta</label>
                <button
                  type="button"
                  className="dropzone"
                  onClick={() => fileRef.current?.click()}
                >
                  <Icon name={file ? 'doc' : 'upload'} />
                  {file ? file.name : 'Toque para anexar (PDF, planilha ou imagem)'}
                  <small>
                    {file
                      ? ehPdf
                        ? 'PDF — a IA vai ler e preencher os dados'
                        : 'A IA lê PDF; neste formato você preenche à mão'
                      : 'Máx. 8 MB'}
                  </small>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {erro && (
                <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                  <Icon name="alert" />
                  <span>{erro}</span>
                </div>
              )}

              <Button type="submit" block icon="spark" disabled={!podeProsseguir}>
                {ehPdf ? 'Ler proposta com IA' : 'Anexar e conferir'}
              </Button>
            </form>
          )}
        </>
      )}

      {fase === 'lendo' && <LeituraIA />}

      {fase === 'conferir' && (
        <>
          <div className="page-head">
            <h1>Confira os dados</h1>
            <p className="lead">Revise o que a IA extraiu antes de arquivar. Nada é salvo sem você.</p>
          </div>

          <form onSubmit={salvar}>
            {comOpcoes && (
              <div className="card opcoes" role="group" aria-label="Opções de preço">
                <div className="opcoes-head">
                  <Icon name="alert" />
                  <div>
                    <strong>Este documento tem {opcoes.length} opções de preço</strong>
                    <p>
                      Cada opção marcada vira uma proposta no acervo (mesmo fornecedor e arquivo),
                      para você comparar e escolher a vencedora.
                    </p>
                  </div>
                </div>
                <ul className="opcoes-lista">
                  {opcoes.map((op, i) => (
                    <li key={i}>
                      <label className="opcao">
                        <input
                          type="checkbox"
                          checked={!!opcoesMarcadas[i]}
                          onChange={(e) =>
                            setOpcoesMarcadas((m) => m.map((x, j) => (j === i ? e.target.checked : x)))
                          }
                        />
                        <span className="tt">
                          <span className="t1">{op.rotulo}</span>
                          {op.descricao && <span className="t2">{op.descricao}</span>}
                        </span>
                        <span className="v">{op.valor != null ? formatBRL(op.valor) : '—'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" className="link" onClick={() => tratarComoPrecoUnico()}>
                  Não são opções — tratar como preço único
                </button>
              </div>
            )}

            <Campo label="Fornecedor" value={fornecedor} onChange={setFornecedor} placeholder="Quem propôs" />
            <div className="pair">
              {!comOpcoes && (
                <Campo
                  label="Valor (R$)"
                  value={valor}
                  onChange={setValor}
                  inputMode="decimal"
                  placeholder="1.284.500,00"
                />
              )}
              <Campo
                label="Prazo (dias)"
                value={prazo}
                onChange={setPrazo}
                inputMode="numeric"
                placeholder="95"
              />
            </div>
            <Campo label="Condição de pagamento" value={pagamento} onChange={setPagamento} placeholder="30/40/30%" />
            <Campo label="Garantia" value={garantia} onChange={setGarantia} placeholder="5 anos" />
            <div className="field">
              <label>Observações</label>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Exclusões, ressalvas…" />
            </div>

            {itens.length > 0 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <strong style={{ fontSize: 13 }}>
                  {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                  {soma !== null && ` · total ${formatBRL(soma)}`}
                </strong>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {itens.slice(0, 8).map((it, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '4px 0',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      <span>{it.descricao}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {it.total !== null ? formatBRL(it.total) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erro && (
              <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                <Icon name="alert" />
                <span>{erro}</span>
              </div>
            )}

            <div className="pair">
              <Button type="button" variant="ghost" onClick={() => setFase('form')}>
                Voltar
              </Button>
              <Button
                type="submit"
                icon="check"
                disabled={criar.isPending || !fornecedor.trim() || (comOpcoes && nMarcadas === 0)}
              >
                {criar.isPending
                  ? 'Arquivando…'
                  : comOpcoes
                    ? `Arquivar ${nMarcadas} ${nMarcadas === 1 ? 'proposta' : 'propostas'}`
                    : 'Arquivar no acervo'}
              </Button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
