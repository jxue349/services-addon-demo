'use client';

import { useEffect, useState } from 'react';
import { ErrorNote, Spinner } from './ui';
import { getHistory } from '@/lib/client/api';
import type { HistoryVersionEntry } from '@/lib/client/api';

/** Last 10 commits touching the spec file. Read-only; GitHub owns the truth. */
export function HistoryDrawer({ open, specPath, onClose }: { open: boolean; specPath: string; onClose: () => void }) {
  const [commits, setCommits] = useState<HistoryVersionEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCommits(null);
    setError(null);
    void getHistory(specPath)
      .then((res) => {
        if (!cancelled) setCommits(res.commits);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [open, specPath]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <button className="flex-1 bg-black/50" onClick={onClose} aria-label="Close history" />
      <aside className="flex w-full max-w-md flex-col border-l border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Spec history</h3>
            <p className="font-mono text-[10px] text-inkDim">{specPath}</p>
          </div>
          <button onClick={onClose} className="text-inkDim hover:text-white" aria-label="Close">
            ×
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <ErrorNote error={error} /> : null}
          {commits === null && error === null ? (
            <div className="flex items-center gap-2 text-xs text-inkDim">
              <Spinner /> loading history…
            </div>
          ) : null}
          {commits?.length === 0 ? <p className="text-xs text-inkDim">No commits touch this path yet.</p> : null}
          <ol className="space-y-2">
            {(commits ?? []).map((c) => (
              <li key={c.sha}>
                <a
                  href={c.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-md border border-line bg-panelAlt px-3 py-2 transition-colors hover:border-accent/50"
                >
                  <div className="flex items-baseline gap-2">
                    {c.version !== null ? (
                      <span className="rounded border border-secondary/50 px-1 font-mono text-[10px] text-secondary">
                        v{c.version}
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] text-accent">{c.shortSha}</span>
                    <span className="truncate text-xs text-ink">{c.message || '(no message)'}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-inkDim">
                    {c.author}
                    {c.date ? ` · ${new Date(c.date).toLocaleString()}` : ''}
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
