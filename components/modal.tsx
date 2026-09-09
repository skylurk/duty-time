'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, close, children, bottomSheet=false }: { bottomSheet?:boolean; title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null), closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    function keyboard(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(n => n.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = original; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, []);
  return <div className={`modal-backdrop ${bottomSheet?'bottom-sheet-backdrop':''}`} onClick={close}><section ref={ref} className={`sheet ${bottomSheet?'station-bottom-sheet':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>{bottomSheet&&<div className="bottom-sheet-handle" aria-hidden="true"/>}<button className="sheet-close icon-button" aria-label="Close" onClick={close}><X size={20}/></button>{children}</section></div>;
}
