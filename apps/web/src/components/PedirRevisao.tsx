import { useEffect, useMemo, useState } from 'react';
import { linkWhatsAppMensagem, mensagemRevisao, type PedidoRevisao } from '@bid/core';
import { Drawer } from '../app/Drawer';

/** Drawer com a mensagem de pedido de revisão pronta para o WhatsApp (editável). */
export function DrawerRevisao({
  pedido,
  categoria,
  obra,
  onFechar,
}: {
  pedido: PedidoRevisao | null;
  categoria: string;
  obra: string | null;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState('');

  // Ao abrir: mensagem pronta para esse fornecedor.
  useEffect(() => {
    if (!pedido) return;
    setTexto(mensagemRevisao({ categoria, obra, pontos: pedido.pontos }));
  }, [pedido, categoria, obra]);

  const href = useMemo(() => linkWhatsAppMensagem(texto), [texto]);

  return (
    <Drawer
      aberto={pedido !== null}
      onFechar={onFechar}
      titulo="Pedir revisão"
      subtitulo={pedido ? `${pedido.nome} · abre no WhatsApp, pronta para enviar` : undefined}
      rodape={
        <a
          className="btn primary"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Abrir no WhatsApp
        </a>
      }
    >
      <div className="field">
        <label htmlFor="rev-msg">Mensagem</label>
        <textarea id="rev-msg" rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <p style={{ fontSize: 12, marginTop: 'var(--sp-label)', color: 'var(--muted)' }}>
        Revise o texto antes de enviar; no WhatsApp você escolhe o contato. Os pontos vêm da matriz "lado a lado" do relatório.
      </p>
    </Drawer>
  );
}
