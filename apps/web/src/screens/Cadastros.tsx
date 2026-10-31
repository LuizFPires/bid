import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { cepValido, cnpjValido, cpfValido, formatarCnpj, mascararCpf, qualificar } from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { useToast } from '../app/Toast';
import { SwipeRow } from '../components/SwipeRow';
import { useMinhaOrg } from '../data/hooks';
import {
  restaurarCadastro,
  useApagarCadastro,
  useFornecedores,
  usePartes,
  useSalvarFornecedor,
  useSalvarParte,
  type Fornecedor,
  type Parte,
  type Signatario,
} from '../data/cadastros';

type Aba = 'partes' | 'fornecedores';

/**
 * Cadastros (menu do perfil): PARTES (contratante / construtora) e
 * FORNECEDORES (contratada), com signatários. É daqui que a minuta tira a
 * qualificação completa das três partes (core.qualificar).
 */
export function CadastrosScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('partes');
  // A tela Cadastros administra a MINHA organização (partes/fornecedores da empresa).
  const org = useMinhaOrg();
  const orgId = org.data?.id;
  const partes = usePartes(orgId);
  const fornecedores = useFornecedores(orgId);
  // Membro da org edita partes (RLS confere); convidados de obra só veem.
  const administra = !!orgId;
  const apagar = useApagarCadastro();

  const [parteAberta, setParteAberta] = useState<Partial<Parte> | null>(null);
  const [fornAberto, setFornAberto] = useState<Partial<Fornecedor> | null>(null);
  const [paraApagar, setParaApagar] = useState<{ tabela: 'partes' | 'fornecedores'; id: string; nome: string } | null>(null);

  async function confirmarApagar() {
    if (!paraApagar) return;
    const alvo = paraApagar;
    setParaApagar(null);
    try {
      await apagar.mutateAsync({ tabela: alvo.tabela, id: alvo.id });
      toast(`"${alvo.nome}" removido.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarCadastro(alvo.tabela, alvo.id);
            void (alvo.tabela === 'partes' ? partes.refetch() : fornecedores.refetch());
          } catch {
            toast('Não foi possível restaurar.');
          }
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível remover.');
    }
  }

  const listaPartes = partes.data ?? [];
  const listaForn = fornecedores.data ?? [];

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Início</button>
        <Icon name="chev" />
        <span>Cadastros</span>
      </div>
      <div className="page-head">
        <h1>Cadastros</h1>
        <p className="lead">Quem assina os contratos: contratante e construtora (da obra) e fornecedores (contratada), com CNPJ, endereço e signatários.</p>
      </div>

      <div className="seg" role="tablist" aria-label="Cadastros" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={aba === 'partes'} className={aba === 'partes' ? 'on' : ''} onClick={() => setAba('partes')}>
          Partes
        </button>
        <button type="button" role="tab" aria-selected={aba === 'fornecedores'} className={aba === 'fornecedores' ? 'on' : ''} onClick={() => setAba('fornecedores')}>
          Fornecedores
        </button>
      </div>

      {aba === 'partes' && (
        <>
          <div className="section-title">
            <h2>Contratante e construtora</h2>
            <span className="c">{listaPartes.length}</span>
          </div>
          {listaPartes.length === 0 ? (
            <div className="card empty">Nenhuma parte cadastrada. Cadastre a construtora (AMPLA ou Clássica) e a contratante de cada obra.</div>
          ) : (
            <div className="card rowlist">
              {listaPartes.map((p) => (
                <SwipeRow key={p.id} onApagar={administra ? () => setParaApagar({ tabela: 'partes', id: p.id, nome: p.razao_social }) : undefined}>
                  <LinhaCadastro
                    titulo={p.nome_curto || p.razao_social}
                    sub={`${p.tipo === 'construtora' ? 'Construtora' : 'Contratante'}${p.marca ? ` · ${p.marca === 'ampla' ? 'AMPLA' : 'Clássica'}` : ''} · ${formatarCnpj(p.cnpj)}`}
                    extra={`${p.signatarios.length} ${p.signatarios.length === 1 ? 'signatário' : 'signatários'}`}
                    onClick={() => setParteAberta(p)}
                  />
                </SwipeRow>
              ))}
            </div>
          )}
          {administra && (
            <Button block variant="soft" icon="plus" style={{ marginTop: 14 }} onClick={() => setParteAberta({ tipo: 'contratante', signatarios: [] })}>
              Nova parte
            </Button>
          )}
          {!administra && <p className="lead" style={{ marginTop: 12 }}>Só dono ou gestor de obra edita as partes.</p>}
        </>
      )}

      {aba === 'fornecedores' && (
        <>
          <div className="section-title">
            <h2>Fornecedores (contratada)</h2>
            <span className="c">{listaForn.length}</span>
          </div>
          {listaForn.length === 0 ? (
            <div className="card empty">Nenhum fornecedor cadastrado. O cadastro por CNPJ é reaproveitado em todos os contratos da empresa.</div>
          ) : (
            <div className="card rowlist">
              {listaForn.map((f) => (
                <SwipeRow key={f.id} onApagar={() => setParaApagar({ tabela: 'fornecedores', id: f.id, nome: f.razao_social })}>
                  <LinhaCadastro
                    titulo={f.nome_curto || f.razao_social}
                    sub={`${formatarCnpj(f.cnpj)}${f.responsavel_tecnico ? ` · RT ${f.responsavel_tecnico}` : ''}`}
                    extra={`${f.signatarios.length} ${f.signatarios.length === 1 ? 'signatário' : 'signatários'}`}
                    onClick={() => setFornAberto(f)}
                  />
                </SwipeRow>
              ))}
            </div>
          )}
          <Button block variant="soft" icon="plus" style={{ marginTop: 14 }} onClick={() => setFornAberto({ signatarios: [] })}>
            Novo fornecedor
          </Button>
        </>
      )}

      <DrawerParte parte={parteAberta} orgId={orgId} somenteLeitura={!administra} onFechar={() => setParteAberta(null)} />
      <DrawerFornecedor fornecedor={fornAberto} orgId={orgId} onFechar={() => setFornAberto(null)} />

      <ConfirmDialog
        aberto={paraApagar !== null}
        titulo={`Remover "${paraApagar?.nome ?? ''}"?`}
        confirmarLabel="Remover"
        onCancelar={() => setParaApagar(null)}
        onConfirmar={() => void confirmarApagar()}
      >
        Contratos já gerados não mudam. Você pode desfazer por alguns segundos.
      </ConfirmDialog>
    </>
  );
}

function LinhaCadastro({ titulo, sub, extra, onClick }: { titulo: string; sub: string; extra: string; onClick: () => void }) {
  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="ic">
        <Icon name="bldg" />
      </span>
      <span className="tt">
        <span className="t1">{titulo}</span>
        <span className="t2">{sub}</span>
      </span>
      <span className="rt" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
        {extra} <Icon name="chev" />
      </span>
    </div>
  );
}

/* ---------- formulário comum (parte / fornecedor) ---------- */

interface FormBase {
  razao_social: string;
  nome_curto: string;
  natureza: string;
  cnpj: string;
  endereco: string;
  cep: string;
  email: string;
  signatarios: Signatario[];
}

function baseDe(x: Partial<Parte | Fornecedor> | null): FormBase {
  return {
    razao_social: x?.razao_social ?? '',
    nome_curto: x?.nome_curto ?? '',
    natureza: x?.natureza ?? '',
    cnpj: x?.cnpj ? formatarCnpj(x.cnpj) : '',
    endereco: x?.endereco ?? '',
    cep: x?.cep ?? '',
    email: x?.email ?? '',
    signatarios: (x?.signatarios ?? []).map((s) => ({ ...s })),
  };
}

function validarBase(f: FormBase): string | null {
  if (!f.razao_social.trim()) return 'Informe a razão social.';
  if (!cnpjValido(f.cnpj)) return 'CNPJ inválido (confira os dígitos).';
  if (!f.endereco.trim()) return 'Informe o endereço da sede.';
  if (f.cep.trim() && !cepValido(f.cep)) return 'CEP deve ter 8 dígitos.';
  for (const s of f.signatarios) {
    if (!s.nome.trim()) return 'Signatário sem nome.';
    if (s.cpf && s.cpf.trim() && !cpfValido(s.cpf)) return `CPF de ${s.nome} inválido.`;
  }
  return null;
}

function CamposBase({ f, set, soLeitura }: { f: FormBase; set: (p: Partial<FormBase>) => void; soLeitura: boolean }) {
  const previa = f.razao_social.trim() && cnpjValido(f.cnpj) && f.endereco.trim()
    ? qualificar({ razao_social: f.razao_social, natureza: f.natureza, cnpj: f.cnpj, endereco: f.endereco, cep: f.cep }, f.signatarios)
    : null;
  return (
    <>
      <div className="field">
        <label>Razão social</label>
        <input value={f.razao_social} disabled={soLeitura} onChange={(e) => set({ razao_social: e.target.value })} placeholder="Construtora Exemplo S.A." />
      </div>
      <div className="pair">
        <div className="field">
          <label>Nome curto (no texto)</label>
          <input value={f.nome_curto} disabled={soLeitura} onChange={(e) => set({ nome_curto: e.target.value })} placeholder="SPE EXEMPLO" />
        </div>
        <div className="field">
          <label>CNPJ</label>
          <input value={f.cnpj} disabled={soLeitura} inputMode="numeric" onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
        </div>
      </div>
      <div className="field">
        <label>Natureza jurídica</label>
        <input value={f.natureza} disabled={soLeitura} onChange={(e) => set({ natureza: e.target.value })} placeholder="sociedade empresária limitada" />
      </div>
      <div className="field">
        <label>Endereço da sede</label>
        <input value={f.endereco} disabled={soLeitura} onChange={(e) => set({ endereco: e.target.value })} placeholder="Rua, nº, bairro, Cidade/UF" />
      </div>
      <div className="pair">
        <div className="field">
          <label>CEP</label>
          <input value={f.cep} disabled={soLeitura} inputMode="numeric" onChange={(e) => set({ cep: e.target.value })} placeholder="00000-000" />
        </div>
        <div className="field">
          <label>E-mail oficial</label>
          <input value={f.email} disabled={soLeitura} type="email" onChange={(e) => set({ email: e.target.value })} placeholder="contratos@empresa.com" />
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 6 }}>
        <h2 style={{ fontSize: 14 }}>Signatários</h2>
        <span className="c">{f.signatarios.length}</span>
      </div>
      {f.signatarios.map((s, i) => (
        <div key={s.id ?? `n${i}`} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <div className="pair">
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Nome</label>
              <input value={s.nome} disabled={soLeitura} onChange={(e) => set({ signatarios: f.signatarios.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Cargo</label>
              <input value={s.cargo ?? ''} disabled={soLeitura} onChange={(e) => set({ signatarios: f.signatarios.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)) })} placeholder="Diretor" />
            </div>
          </div>
          <div className="pair">
            <div className="field" style={{ marginBottom: 8 }}>
              <label>CPF</label>
              <input value={soLeitura ? mascararCpf(s.cpf) : (s.cpf ?? '')} disabled={soLeitura} inputMode="numeric" onChange={(e) => set({ signatarios: f.signatarios.map((x, j) => (j === i ? { ...x, cpf: e.target.value } : x)) })} placeholder="000.000.000-00" />
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>E-mail / WhatsApp</label>
              <input value={s.email ?? ''} disabled={soLeitura} onChange={(e) => set({ signatarios: f.signatarios.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} placeholder="para o link de assinatura" />
            </div>
          </div>
          {!soLeitura && (
            <button type="button" className="link danger" onClick={() => set({ signatarios: f.signatarios.filter((_, j) => j !== i) })}>
              <Icon name="trash" /> remover signatário
            </button>
          )}
        </div>
      ))}
      {!soLeitura && (
        <button type="button" className="link" onClick={() => set({ signatarios: [...f.signatarios, { nome: '', cpf: null, cargo: null, email: null, telefone: null, ordem: f.signatarios.length + 1 }] })}>
          <Icon name="plus" /> Adicionar signatário
        </button>
      )}

      {previa && (
        <div className="card" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
          <small style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>Como vai no contrato</small>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{previa}</p>
        </div>
      )}
    </>
  );
}

function DrawerParte({ parte, orgId, somenteLeitura, onFechar }: { parte: Partial<Parte> | null; orgId: string | undefined; somenteLeitura: boolean; onFechar: () => void }) {
  const salvar = useSalvarParte();
  const toast = useToast();
  const [f, setF] = useState<FormBase>(baseDe(null));
  const [tipo, setTipo] = useState<'contratante' | 'construtora'>('contratante');
  const [marca, setMarca] = useState<'ampla' | 'classica' | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setF(baseDe(parte));
    setTipo(parte?.tipo ?? 'contratante');
    setMarca(parte?.marca ?? '');
    setErro(null);
  }, [parte]);
  if (!parte) return null;
  const set = (p: Partial<FormBase>) => setF((x) => ({ ...x, ...p }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const v = validarBase(f);
    if (v) return setErro(v);
    if (tipo === 'construtora' && !marca) return setErro('Escolha a marca da construtora (define a logo do contrato).');
    try {
      if (!orgId) return setErro('Organização não carregada.');
      await salvar.mutateAsync({ ...f, orgId, id: parte?.id, tipo, marca: tipo === 'construtora' ? (marca as 'ampla' | 'classica') : null, nome_curto: f.nome_curto || null, natureza: f.natureza || null, cep: f.cep || null, email: f.email || null });
      toast(parte?.id ? 'Parte atualizada.' : 'Parte cadastrada.');
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={parte.id ? (parte.nome_curto || parte.razao_social || 'Parte') : 'Nova parte'}
      subtitulo="Contratante (dono do empreendimento) ou construtora (AMPLA / Clássica)."
      rodape={
        somenteLeitura ? undefined : (
          <Button block icon="check" disabled={salvar.isPending} onClick={(e) => void enviar(e as unknown as FormEvent)}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        )
      }
    >
      <form onSubmit={enviar}>
        <div className="pair">
          <div className="field">
            <label>Tipo</label>
            <select value={tipo} disabled={somenteLeitura} onChange={(e) => setTipo(e.target.value as 'contratante' | 'construtora')}>
              <option value="contratante">Contratante</option>
              <option value="construtora">Construtora</option>
            </select>
          </div>
          {tipo === 'construtora' && (
            <div className="field">
              <label>Marca (logo)</label>
              <select value={marca} disabled={somenteLeitura} onChange={(e) => setMarca(e.target.value as 'ampla' | 'classica' | '')}>
                <option value="">Escolha…</option>
                <option value="classica">Clássica</option>
                <option value="ampla">AMPLA</option>
              </select>
            </div>
          )}
        </div>
        <CamposBase f={f} set={set} soLeitura={somenteLeitura} />
        {erro && (
          <div className="banner warn" role="alert" style={{ marginTop: 12 }}>
            <Icon name="alert" />
            <span>{erro}</span>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

function DrawerFornecedor({ fornecedor, orgId, onFechar }: { fornecedor: Partial<Fornecedor> | null; orgId: string | undefined; onFechar: () => void }) {
  const salvar = useSalvarFornecedor();
  const toast = useToast();
  const [f, setF] = useState<FormBase>(baseDe(null));
  const [rt, setRt] = useState('');
  const [crea, setCrea] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setF(baseDe(fornecedor));
    setRt(fornecedor?.responsavel_tecnico ?? '');
    setCrea(fornecedor?.crea ?? '');
    setErro(null);
  }, [fornecedor]);
  if (!fornecedor) return null;
  const set = (p: Partial<FormBase>) => setF((x) => ({ ...x, ...p }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const v = validarBase(f);
    if (v) return setErro(v);
    try {
      if (!orgId) return setErro('Organização não carregada.');
      await salvar.mutateAsync({ ...f, orgId, id: fornecedor?.id, nome_curto: f.nome_curto || null, natureza: f.natureza || null, cep: f.cep || null, email: f.email || null, responsavel_tecnico: rt || null, crea: crea || null });
      toast(fornecedor?.id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={fornecedor.id ? (fornecedor.nome_curto || fornecedor.razao_social || 'Fornecedor') : 'Novo fornecedor'}
      subtitulo="A contratada do contrato. Cadastro por CNPJ, reaproveitado em todas as obras."
      rodape={
        <Button block icon="check" disabled={salvar.isPending} onClick={(e) => void enviar(e as unknown as FormEvent)}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <form onSubmit={enviar}>
        <CamposBase f={f} set={set} soLeitura={false} />
        <div className="pair" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Responsável técnico</label>
            <input value={rt} onChange={(e) => setRt(e.target.value)} placeholder="Eng. Fulano" />
          </div>
          <div className="field">
            <label>CREA / CAU</label>
            <input value={crea} onChange={(e) => setCrea(e.target.value)} placeholder="MG-000000/D" />
          </div>
        </div>
        {erro && (
          <div className="banner warn" role="alert" style={{ marginTop: 12 }}>
            <Icon name="alert" />
            <span>{erro}</span>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
