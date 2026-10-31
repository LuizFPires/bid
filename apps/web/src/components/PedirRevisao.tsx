import { useEffect, useMemo, useState } from 'react';
import { linkWhatsAppMensagem, mensagemRevisao, type PedidoRevisao } from '@bid/core';
import { Icon } from '@bid/ui';
import { Drawer } from '../app/Drawer';

/**
 * Lista "pedir revisão": um fornecedor por linha com o que falta e um botão
 * que abre o drawer com a mensagem pronta para o WhatsApp (editável).
 */
export function PedirRevisao({ pedidos, onEscolher }: { pedidos: PedidoRevisao[]; onEscolher: (p: PedidoRevisao) => void }) {
  if (!pedidos.length) return null;
  return (
    <>
      <div className="card rowlist">
        {pedidos.map((p) => (
          <button key={p.proposta_id} type="button" className="row" onClick={() => onEscolher(p)}>
            <span className="ic">
              <Icon name="alert" />
            </span>
            <span className="tt">
              <span className="t1">{p.nome}</span>
              <span className="t2">
                {p.pontos.length === 1 ? '1 ponto' : `${p.pontos.length} pontos`} ·{' '}
                {p.pontos.map((x) => x.criterio.toLocaleLowerCase('pt-BR')).join(', ')}
              </span>
            </span>
            <span className="rt whats">
              WhatsApp <Icon name="chev" />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

const CHAVE_TEL = 'bid:whatsapp:';

export function DrawerRevisao({
  pedido,
  categoria,
  obra,
  remetente,
  onFechar,
}: {
  pedido: PedidoRevisao | null;
  categoria: string;
  obra: string | null;
  remetente: string | null;
  onFechar: () => void;
}) {
  const [telefone, setTelefone] = useState('');
  const [texto, setTexto] = useState('');

  // Ao abrir: mensagem pronta e telefone lembrado para esse fornecedor.
  useEffect(() => {
    if (!pedido) return;
    setTexto(mensagemRevisao({ fornecedor: pedido.nome.split(' · ')[0] ?? pedido.nome, categoria, obra, pontos: pedido.pontos, remetente }));
    try {
      setTelefone(localStorage.getItem(CHAVE_TEL + pedido.nome) ?? '');
    } catch {
      setTelefone('');
    }
  }, [pedido, categoria, obra, remetente]);

  const href = useMemo(() => linkWhatsAppMensagem(texto, telefone), [texto, telefone]);

  function lembrarTelefone() {
    if (!pedido) return;
    try {
      if (telefone.trim()) localStorage.setItem(CHAVE_TEL + pedido.nome, telefone.trim());
      else localStorage.removeItem(CHAVE_TEL + pedido.nome);
    } catch {
      /* sem armazenamento local: segue sem lembrar */
    }
  }

  return (
    <Drawer
      aberto={pedido !== null}
      onFechar={onFechar}
      titulo="Pedir revisão"
      subtitulo={pedido ? `${pedido.nome} · a mensagem abre no WhatsApp, pronta para enviar` : undefined}
      rodape={
        <a
          className="btn primary"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={lembrarTelefone}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Abrir no WhatsApp
        </a>
      }
    >
      <div className="field">
        <label htmlFor="rev-tel">Telefone do fornecedor (opcional)</label>
        <input
          id="rev-tel"
          type="tel"
          inputMode="tel"
          placeholder="(31) 99999-0000 · sem número, você escolhe o contato no WhatsApp"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: 'var(--sp-block)' }}>
        <label htmlFor="rev-msg">Mensagem</label>
        <textarea id="rev-msg" rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <p style={{ fontSize: 12, marginTop: 'var(--sp-label)', color: 'var(--muted)' }}>
        Revise o texto antes de enviar. Os pontos vêm da matriz "lado a lado" do relatório.
      </p>
    </Drawer>
  );
}
