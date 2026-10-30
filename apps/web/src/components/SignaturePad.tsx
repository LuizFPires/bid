import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@bid/ui';

export interface SignaturePadHandle {
  /** PNG (base64 sem prefixo) ou null se vazio. */
  toPngBase64: () => string | null;
  clear: () => void;
}

/**
 * Quadro de assinatura a dedo (ponteiro/toque). Fundo transparente (PNG), traço
 * escuro. Exposto por ref: `toPngBase64()` e `clear()`.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(function SignaturePad(
  { height = 180 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14152e';
  }, []);

  useImperativeHandle(ref, () => ({
    toPngBase64: () => {
      const canvas = canvasRef.current;
      if (!canvas || vazio) return null;
      const url = canvas.toDataURL('image/png');
      const i = url.indexOf(',');
      return i >= 0 ? url.slice(i + 1) : null;
    },
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setVazio(true);
    },
  }));

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    desenhando.current = true;
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vazio) setVazio(false);
  }

  function fim() {
    desenhando.current = false;
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVazio(true);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          border: '1.5px dashed var(--line)',
          borderRadius: 12,
          background: 'var(--surface-2)',
          touchAction: 'none',
          display: 'block',
        }}
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerLeave={fim}
        aria-label="Quadro de assinatura"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--faint)', fontWeight: 700 }}>
          {vazio ? 'Assine com o dedo acima' : 'Assinatura capturada'}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={limpar}>
          Limpar
        </Button>
      </div>
    </div>
  );
});
