import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CERTAME_LABEL, PAPEL_LABEL, type CertameStatus } from '@bid/core';
import { Button, Icon, iconeCategoria } from '@bid/ui';
import {
  useAcessoObra,
  useApagarObra,
  useConvidarParaObra,
  useObra,
  useMudarPapelObra,
  usePapelObra,
  useRemoverAcessoObra,
} from '../data/hooks';
import { restaurarObra } from '../data/mutations';
import { useAtualizarObraContrato, usePartes } from '../data/cadastros';
import { Drawer } from '../app/Drawer';
import { cnoValido, formatarCep, formatarCno, gerencia } from '@bid/core';
import type { AcessoObra } from '../data/queries';
import type { Obra } from '../data/types';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../app/Toast';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { avisarConvite } from '../lib/convite';

/** Menu de 3 pontinhos da obra (apagar) — só o dono vê. */
function ObraMenu({ onApagar, apagando }: { onApagar: () => void; apagando: boolean }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [aberto]);
  return (
    <div ref={ref} className="kebab-wrap">
      <button
        type="button"
        className="kebab"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="dots" />
      </button>
      {aberto && (
        <div className="kebab-menu" role="menu">
          <button
            type="button"
            className="kebab-item danger"
            role="menuitem"
            disabled={apagando}
            onClick={() => {
              setAberto(false);
              onApagar();
            }}
          >
            <Icon name="trash" />
            {apagando ? 'Apagando…' : 'Apagar obra'}
          </button>
        </div>
      )}
    </div>
  );
}

const ACESSO_LABEL: Record<AcessoObra['status'], { texto: string; tom: 'neutro' | 'aberta' | 'analise' }> = {
  dono: { texto: 'dono', tom: 'aberta' },
  aceito: { texto: 'acesso', tom: 'neutro' },
  pendente: { texto: 'convidado', tom: 'analise' },
};

/**
 * Pessoas com acesso à obra. O dono convida por e-mail (a conta pode ainda não
 * existir — o convite espera o cadastro) e remove acessos com confirmação.
 */
function Pessoas({ obraId, obraNome, gerencia }: { obraId: string; obraNome: string; gerencia: boolean }) {
  const acesso = useAcessoObra(obraId);
  const convidar = useConvidarParaObra(obraId);
  const remover = useRemoverAcessoObra(obraId);
  const mudarPapel = useMudarPapelObra(obraId);
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<'gestor' | 'colaborador'>('colaborador');
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<AcessoObra | null>(null);
  const meuEmail = useAuth().session?.user?.email ?? null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const destinatario = email.trim();
      await convidar.mutateAsync({ obraId, email: destinatario, papel });
      // O bid não manda e-mail: quem convida avisa a pessoa (toast com atalho).
      toast(`Convite registrado para ${destinatario} como ${PAPEL_LABEL[papel].texto.toLowerCase()}. Avise a pessoa.`, {
        actionLabel: 'Avisar',
        duration: 8000,
        onAction: () => void avisarConvite({ obraNome, email: destinatario }).catch(() => {}),
      });
      setEmail('');
      setPapel('colaborador');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível convidar.');
    }
  }

  async function confirmarRemocao() {
    if (!removendo?.conviteId) return;
    try {
      await remover.mutateAsync(removendo.conviteId);
      toast(`Acesso de ${removendo.email} removido.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível remover o acesso.');
    } finally {
      setRemovendo(null);
    }
  }

  const lista = acesso.data ?? [];

  return (
    <section className="acesso" style={{ marginTop: 18 }}>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Pessoas</h2>
        <p className="lead" style={{ marginTop: 2 }}>
          {gerencia
            ? 'Só quem for convidado vê esta obra. A pessoa entra no bid com o e-mail convidado e aceita em Perfil › Convites. Gestor aprova, emite e apaga; colaborador sobe, equaliza e monta contratos.'
            : 'Quem tem acesso a esta obra.'}
        </p>
      </div>

      {gerencia && (
        <form className="acesso-form" onSubmit={enviar}>
          <div className="field">
            <label htmlFor="acesso-email">Convidar por e-mail</label>
            <input
              id="acesso-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="acesso-papel">Papel na obra</label>
            <select id="acesso-papel" value={papel} onChange={(e) => setPapel(e.target.value as 'gestor' | 'colaborador')}>
              <option value="colaborador">Colaborador</option>
              <option value="gestor">Gestor — aprova, emite e apaga</option>
            </select>
          </div>
          <Button type="submit" block icon="plus" disabled={convidar.isPending || !email.trim()}>
            {convidar.isPending ? 'Convidando…' : 'Convidar'}
          </Button>
        </form>
      )}
      {erro && (
        <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      {lista.length > 0 && (
        <div className="card rowlist">
          {lista.map((a) => {
            const l = ACESSO_LABEL[a.status];
            return (
              <div key={a.conviteId ?? 'dono'} className="row">
                <span className="ic">
                  <Icon name="user" />
                </span>
                <span className="tt">
                  <span className="t1">{a.email}</span>
                </span>
                <span className="rt" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {a.status === 'dono' ? (
                    <span className={`pill ${l.tom}`}>
                      <span className={`dot ${l.tom}`} />
                      Dono
                    </span>
                  ) : gerencia && a.conviteId && a.email.toLowerCase() !== (meuEmail ?? '').toLowerCase() ? (
                    <select
                      className="papel-sel"
                      aria-label={`Papel de ${a.email}`}
                      value={a.papel}
                      disabled={mudarPapel.isPending}
                      onChange={async (e) => {
                        const novo = e.target.value as 'gestor' | 'colaborador';
                        try {
                          await mudarPapel.mutateAsync({ conviteId: a.conviteId!, papel: novo });
                          toast(`${a.email} agora é ${PAPEL_LABEL[novo].texto.toLowerCase()}.`);
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Não foi possível mudar o papel.');
                        }
                      }}
                    >
                      <option value="colaborador">Colaborador{a.status === 'pendente' ? ' · convidado' : ''}</option>
                      <option value="gestor">Gestor{a.status === 'pendente' ? ' · convidado' : ''}</option>
                    </select>
                  ) : (
                    <span className={`pill ${a.papel === 'gestor' ? 'aberta' : l.tom}`}>
                      <span className={`dot ${a.papel === 'gestor' ? 'aberta' : l.tom}`} />
                      {a.status === 'pendente' ? 'convidado · ' : ''}
                      {PAPEL_LABEL[a.papel].texto.toLowerCase()}
                    </span>
                  )}
                  {gerencia && a.conviteId && a.status === 'pendente' && (
                    <button
                      type="button"
                      className="avisar"
                      aria-label={`Avisar ${a.email} do convite`}
                      title="Avisar do convite (WhatsApp ou compartilhar)"
                      onClick={() => void avisarConvite({ obraNome, email: a.email }).catch(() => {})}
                    >
                      <Icon name="link" />
                    </button>
                  )}
                  {gerencia && a.conviteId && (
                    <button
                      type="button"
                      className="remover"
                      aria-label={`Remover acesso de ${a.email}`}
                      disabled={remover.isPending}
                      onClick={() => setRemovendo(a)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={removendo !== null}
        titulo={`Remover o acesso de ${removendo?.email ?? ''}?`}
        confirmarLabel="Remover acesso"
        ocupado={remover.isPending}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemovendo(null)}
      >
        A pessoa deixa de ver esta obra e suas propostas. Você pode convidar de novo depois.
      </ConfirmDialog>
    </section>
  );
}

/**
 * Dados que a minuta de contrato precisa da obra: endereço, CEP, CNO, foro e as
 * partes CONTRATANTE e CONSTRUTORA (cadastros). Só dono/gestor edita.
 */
function DadosContrato({ obra, podeEditar }: { obra: Obra; podeEditar: boolean }) {
  const partes = usePartes(obra.org_id);
  const salvar = useAtualizarObraContrato(obra.id);
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ endereco: '', cep: '', cno: '', foro: '', contratante_id: '', construtora_id: '' });
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (aberto) {
      setF({ endereco: obra.endereco ?? '', cep: obra.cep ?? '', cno: obra.cno ?? '', foro: obra.foro ?? '', contratante_id: obra.contratante_id ?? '', construtora_id: obra.construtora_id ?? '' });
      setErro(null);
    }
  }, [aberto, obra]);
  const lista = partes.data ?? [];
  const contratante = lista.find((p) => p.id === obra.contratante_id) ?? null;
  const construtora = lista.find((p) => p.id === obra.construtora_id) ?? null;
  const pendentes = [!obra.endereco && 'endereço', !obra.cno && 'CNO', !obra.contratante_id && 'contratante', !obra.construtora_id && 'construtora'].filter(Boolean) as string[];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (f.cno.trim() && !cnoValido(f.cno)) return setErro('CNO deve ter 12 dígitos.');
    try {
      await salvar.mutateAsync({ endereco: f.endereco, cep: f.cep, cno: f.cno, foro: f.foro, contratante_id: f.contratante_id || null, construtora_id: f.construtora_id || null });
      toast('Dados de contrato da obra salvos.');
      setAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <section style={{ marginTop: 18 }}>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Dados para contrato</h2>
        <p className="lead" style={{ marginTop: 2 }}>
          {pendentes.length ? `Falta: ${pendentes.join(', ')}. ` : 'Completo. '}
          Entram na qualificação e no quadro-resumo da minuta.
        </p>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <Linha k="Endereço" v={obra.endereco ? `${obra.endereco}${obra.cep ? ` · CEP ${formatarCep(obra.cep)}` : ''}` : null} />
        <Linha k="CNO" v={obra.cno ? formatarCno(obra.cno) : null} />
        <Linha k="Foro" v={obra.foro} />
        <Linha k="Contratante" v={contratante ? (contratante.nome_curto || contratante.razao_social) : null} />
        <Linha k="Construtora" v={construtora ? `${construtora.nome_curto || construtora.razao_social}${construtora.marca ? ` · ${construtora.marca === 'ampla' ? 'AMPLA' : 'Clássica'}` : ''}` : null} />
        {podeEditar && (
          <Button variant="soft" icon="pencil" onClick={() => setAberto(true)} style={{ marginTop: 4 }}>
            Editar dados
          </Button>
        )}
      </div>

      <Drawer
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo="Dados para contrato"
        subtitulo={obra.nome}
        rodape={
          <Button block icon="check" disabled={salvar.isPending} onClick={(e) => void enviar(e as unknown as FormEvent)}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        }
      >
        <form onSubmit={enviar}>
          <div className="field">
            <label>Endereço da obra</label>
            <input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Rua, nº, bairro, Cidade/UF" />
          </div>
          <div className="pair">
            <div className="field">
              <label>CEP</label>
              <input value={f.cep} inputMode="numeric" onChange={(e) => setF({ ...f, cep: e.target.value })} placeholder="00000-000" />
            </div>
            <div className="field">
              <label>CNO</label>
              <input value={f.cno} inputMode="numeric" onChange={(e) => setF({ ...f, cno: e.target.value })} placeholder="00.000.00000/00" />
            </div>
          </div>
          <div className="field">
            <label>Foro</label>
            <input value={f.foro} onChange={(e) => setF({ ...f, foro: e.target.value })} placeholder="Cidade/UF (padrão: a cidade da obra)" />
          </div>
          <div className="field">
            <label>Contratante (dono do empreendimento)</label>
            <select value={f.contratante_id} onChange={(e) => setF({ ...f, contratante_id: e.target.value })}>
              <option value="">Selecione…</option>
              {lista.filter((p) => p.tipo === 'contratante').map((p) => (
                <option key={p.id} value={p.id}>{p.nome_curto || p.razao_social}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Construtora (administra a obra)</label>
            <select value={f.construtora_id} onChange={(e) => setF({ ...f, construtora_id: e.target.value })}>
              <option value="">Selecione…</option>
              {lista.filter((p) => p.tipo === 'construtora').map((p) => (
                <option key={p.id} value={p.id}>{p.nome_curto || p.razao_social}{p.marca ? ` · ${p.marca === 'ampla' ? 'AMPLA' : 'Clássica'}` : ''}</option>
              ))}
            </select>
          </div>
          <p className="lead" style={{ fontSize: 12 }}>
            Falta alguma parte? Cadastre em <Link to="/cadastros">Cadastros</Link> (menu do perfil).
          </p>
          {erro && (
            <div className="banner warn" role="alert">
              <Icon name="alert" />
              <span>{erro}</span>
            </div>
          )}
          <button type="submit" hidden />
        </form>
      </Drawer>
    </section>
  );
}

function Linha({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{k}</span>
      <span style={{ fontWeight: 800, textAlign: 'right', color: v ? 'inherit' : 'var(--faint)' }}>{v || '—'}</span>
    </div>
  );
}

export function ObraScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObra(id);
  const { session } = useAuth();
  const apagar = useApagarObra();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  // Antes de qualquer `return` condicional: hook depois de um early return muda
  // a ordem dos hooks entre renders e derruba a árvore inteira (tela preta).
  const papelAqui = usePapelObra(id);

  async function apagarEsta(obraId: string, nome: string) {
    try {
      await apagar.mutateAsync(obraId);
      setConfirmando(false);
      navigate('/obras');
      toast(`Obra "${nome}" excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarObra(obraId);
            qc.invalidateQueries({ queryKey: ['obras'] });
            qc.invalidateQueries({ queryKey: ['obra'] });
          } catch {
            toast('Não foi possível restaurar a obra.');
          }
        },
      });
    } catch (e) {
      setConfirmando(false);
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a obra.');
    }
  }

  if (isLoading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty">
          <span className="thinking" aria-label="Carregando">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <>
        <div className="crumb">
          <Link to="/obras">Obras</Link>
          <Icon name="chev" />
          <span>Obra</span>
        </div>
        <div className="card empty">Obra não encontrada.</div>
      </>
    );
  }

  const { obra, certames } = data;
  const ehDono = !!session?.user?.id && obra.criado_por === session.user.id;

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/obras')}>Obras</button>
        <Icon name="chev" />
        <span>{obra.nome}</span>
      </div>
      <div className="page-head prop-head">
        <div style={{ minWidth: 0 }}>
          <h1>{obra.nome}</h1>
          <p className="lead">
            {obra.cidade ?? '—'} · {certames.length}{' '}
            {certames.length === 1 ? 'tomada de preços' : 'tomadas de preços'}
          </p>
        </div>
        {ehDono && <ObraMenu apagando={apagar.isPending} onApagar={() => setConfirmando(true)} />}
      </div>

      <ConfirmDialog
        aberto={confirmando}
        titulo={`Apagar a obra "${obra.nome}"?`}
        confirmarLabel="Apagar obra"
        ocupado={apagar.isPending}
        onConfirmar={() => apagarEsta(obra.id, obra.nome)}
        onCancelar={() => setConfirmando(false)}
      >
        A obra sai da lista para todas as pessoas com acesso. Você ainda pode desfazer por alguns
        segundos.
      </ConfirmDialog>

      {certames.length === 0 ? (
        <div className="card empty">Nenhuma tomada de preços nesta obra ainda.</div>
      ) : (
        <div className="card rowlist">
          {certames.map((c) => {
            const label = CERTAME_LABEL[c.status as CertameStatus] ?? { texto: c.status, tom: 'neutro' as const };
            return (
              <div key={c.id} className="row">
                <span className="ic">
                  <Icon name={c.vencedoraFornecedor ? 'trophy' : iconeCategoria(c.categoria)} />
                </span>
                <span className="tt">
                  <span className="t1">{c.categoria}</span>
                  <span className="t2">
                    {c.totalPropostas} proposta{c.totalPropostas === 1 ? '' : 's'}
                    {c.vencedoraFornecedor && (
                      <>
                        {' · '}
                        <Icon name="trophy" style={{ width: 13, height: 13, color: 'var(--ok)' }} />
                        {c.vencedoraFornecedor}
                      </>
                    )}
                  </span>
                </span>
                <span className="rt">
                  <span className={`pill ${label.tom}`}>
                    <span className={`dot ${label.tom}`} />
                    {label.texto}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <DadosContrato obra={obra} podeEditar={gerencia(papelAqui) || ehDono} />
      <Pessoas obraId={obra.id} obraNome={obra.nome} gerencia={ehDono || papelAqui === 'gestor'} />
    </>
  );
}
