import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { agruparCategorias, type CategoriaAgrupada } from '@bid/core';
import { Button, Icon, iconeCategoria } from '@bid/ui';
import { useCategorias, useMesclarCategoria } from '../data/hooks';
import { useToast } from '../app/Toast';
import { Drawer } from '../app/Drawer';
import { ConfirmDialog } from '../app/ConfirmDialog';

/**
 * Organizar categorias de serviço (opção A aprovada): lista com uso, marca as
 * parecidas (core) e, ao tocar, drawer para RENOMEAR ou MESCLAR COM outra.
 * Mesclar/renomear passa por confirmação (muda propostas e tomadas de preços).
 */
export function CategoriasScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCategorias();
  const mesclar = useMesclarCategoria();
  const toast = useToast();

  const lista = useMemo(() => agruparCategorias(data ?? []), [data]);
  const [aberta, setAberta] = useState<CategoriaAgrupada | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [destino, setDestino] = useState('');
  const [confirmar, setConfirmar] = useState<{ de: string; para: string; tipo: 'renomear' | 'mesclar' } | null>(null);

  function abrir(c: CategoriaAgrupada) {
    setAberta(c);
    setNovoNome(c.nome);
    setDestino(c.parecidas[0] ?? '');
  }

  function pedirRenomear(e: FormEvent) {
    e.preventDefault();
    if (!aberta) return;
    const para = novoNome.trim();
    if (!para || para === aberta.nome) return;
    const existe = lista.some((c) => c.nome === para);
    setConfirmar({ de: aberta.nome, para, tipo: existe ? 'mesclar' : 'renomear' });
  }
  function pedirMesclar() {
    if (!aberta || !destino) return;
    setConfirmar({ de: aberta.nome, para: destino, tipo: 'mesclar' });
  }

  async function executar() {
    if (!confirmar) return;
    const { de, para, tipo } = confirmar;
    try {
      const n = await mesclar.mutateAsync({ de, para });
      setConfirmar(null);
      setAberta(null);
      toast(
        tipo === 'renomear'
          ? `"${de}" renomeada para "${para}".`
          : `"${de}" mesclada em "${para}" (${n} ${n === 1 ? 'tomada de preços' : 'tomadas de preços'}).`,
      );
    } catch (e) {
      setConfirmar(null);
      toast(e instanceof Error ? e.message : 'Não foi possível alterar a categoria.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Início</button>
        <Icon name="chev" />
        <span>Categorias</span>
      </div>
      <div className="page-head">
        <h1>Categorias</h1>
        <p className="lead">
          Toque para renomear ou mesclar. Propostas só entram juntas na equalização quando estão na mesma categoria.
        </p>
      </div>

      {isLoading ? (
        <div className="card">
          <div className="empty">
            <span className="thinking" aria-label="Carregando">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      ) : isError ? (
        <div className="banner warn" role="alert">
          <Icon name="alert" />
          <span>Não foi possível carregar as categorias.</span>
        </div>
      ) : lista.length === 0 ? (
        <div className="card empty">Nenhuma categoria ainda.</div>
      ) : (
        <div className="card rowlist">
          {lista.map((c) => (
            <button key={c.nome} type="button" className="row" onClick={() => abrir(c)}>
              <span className="ic">
                <Icon name={iconeCategoria(c.nome)} />
              </span>
              <span className="tt">
                <span className="t1">{c.nome}</span>
                <span className="t2">
                  {c.propostas} {c.propostas === 1 ? 'proposta' : 'propostas'}
                  {c.obras > 0 ? ` · ${c.obras} ${c.obras === 1 ? 'obra' : 'obras'}` : ' · sem uso'}
                </span>
              </span>
              <span className="rt">
                {c.padrao ? (
                  <span className="pill aberta">padrão</span>
                ) : c.parecidas.length > 0 ? (
                  <span className="pill analise">parecida</span>
                ) : null}
              </span>
              <span className="chev">
                <Icon name="chev" />
              </span>
            </button>
          ))}
        </div>
      )}

      <Drawer
        aberto={aberta !== null}
        onFechar={() => setAberta(null)}
        titulo={aberta?.nome ?? ''}
        subtitulo={
          aberta
            ? `${aberta.propostas} ${aberta.propostas === 1 ? 'proposta' : 'propostas'}${aberta.obras ? ` · ${aberta.obras} ${aberta.obras === 1 ? 'obra' : 'obras'}` : ''}`
            : undefined
        }
      >
        {aberta && (
          <>
            <form onSubmit={pedirRenomear}>
              <div className="field">
                <label htmlFor="cat-nome">Renomear para</label>
                <input id="cat-nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </div>
              <Button type="submit" block variant="ghost" disabled={!novoNome.trim() || novoNome.trim() === aberta.nome}>
                Renomear
              </Button>
            </form>

            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="cat-destino">Ou mesclar com</label>
              <select id="cat-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Escolha a categoria de destino…</option>
                {aberta.parecidas.length > 0 && (
                  <optgroup label="Parecidas">
                    {aberta.parecidas.map((n) => {
                      const o = lista.find((c) => c.nome === n);
                      return (
                        <option key={n} value={n}>
                          {n}
                          {o ? ` · ${o.propostas} propostas` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                <optgroup label="Todas">
                  {lista
                    .filter((c) => c.nome !== aberta.nome && !aberta.parecidas.includes(c.nome))
                    .map((c) => (
                      <option key={c.nome} value={c.nome}>
                        {c.nome} · {c.propostas} propostas
                      </option>
                    ))}
                </optgroup>
              </select>
              <p className="field-help">
                Ao mesclar, as propostas de “{aberta.nome}” passam para a categoria escolhida e as tomadas de preços da
                mesma obra se juntam. “{aberta.nome}” sai das sugestões.
              </p>
            </div>
            <Button type="button" block icon="arrow" disabled={!destino} onClick={pedirMesclar}>
              Mesclar em {destino || '…'}
            </Button>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        aberto={confirmar !== null}
        titulo={
          confirmar?.tipo === 'renomear'
            ? `Renomear “${confirmar.de}” para “${confirmar.para}”?`
            : `Mesclar “${confirmar?.de ?? ''}” em “${confirmar?.para ?? ''}”?`
        }
        confirmarLabel={confirmar?.tipo === 'renomear' ? 'Renomear' : 'Mesclar'}
        ocupado={mesclar.isPending}
        onConfirmar={executar}
        onCancelar={() => setConfirmar(null)}
      >
        {confirmar?.tipo === 'renomear'
          ? 'Todas as tomadas de preços e propostas desta categoria passam a usar o novo nome.'
          : 'As propostas migram e as tomadas de preços da mesma obra se juntam. Tomadas já adjudicadas bloqueiam a mescla.'}
      </ConfirmDialog>
    </>
  );
}
