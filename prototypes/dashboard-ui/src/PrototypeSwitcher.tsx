// PROTOTYPE — floating variant switcher. Dev builds only.
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { setParams } from './model';

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => {
    const next = variants[(idx + d + variants.length) % variants.length];
    setParams((p) => p.set('variant', next.key));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!import.meta.env.DEV) return null;
  const v = variants[idx];
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 p-1 text-white shadow-2xl ring-4 ring-fuchsia-300/40">
      <button onClick={() => go(-1)} className="rounded-full p-1.5 hover:bg-white/15"><ChevronLeft className="size-4" /></button>
      <span className="min-w-52 px-2 text-center text-sm font-medium">
        <span className="mr-1.5 rounded bg-white/20 px-1.5 font-mono">{v.key}</span>
        {v.name}
        <span className="ml-2 text-xs opacity-70">PROTOTYPE · ← →</span>
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1.5 hover:bg-white/15"><ChevronRight className="size-4" /></button>
    </div>
  );
}
