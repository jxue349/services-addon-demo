'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ApiError } from '@/lib/client/api';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({ variant = 'ghost', loading = false, className = '', children, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
  const styles = {
    primary: 'bg-accent text-[#08221c] hover:bg-accent/85',
    ghost: 'border border-line bg-panelAlt text-ink hover:border-accent/60 hover:text-white',
    danger: 'border border-warning/60 bg-warning/10 text-warning hover:bg-warning/20',
  }[variant];

  return (
    <button className={`${base} ${styles} ${className}`} disabled={rest.disabled ?? loading} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
    />
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel ${className}`}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkDim">{children}</div>;
}

/** Friendly error surface. Shows the request ID so a server log can be found. */
export function ErrorNote({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  if (error === null || error === undefined) return null;

  const message = error instanceof Error ? error.message : String(error);
  const requestId = error instanceof ApiError ? error.requestId : null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning">
      <div>
        <div>{message}</div>
        {requestId ? <div className="mt-1 font-mono text-[10px] text-warning/70">request {requestId}</div> : null}
      </div>
      {onDismiss ? (
        <button onClick={onDismiss} className="shrink-0 text-warning/70 hover:text-warning" aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-xs text-inkDim">
      {children}
    </div>
  );
}

export function PriorityTag({ priority }: { priority: 'P1' | 'P2' | 'P3' }) {
  const tone = {
    P1: 'border-warning/60 text-warning',
    P2: 'border-secondary/60 text-secondary',
    P3: 'border-line text-inkDim',
  }[priority];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>{priority}</span>
  );
}
