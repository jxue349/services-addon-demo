'use client';

import type { RefObject } from 'react';
import { Button, ErrorNote, Spinner } from './ui';
import type { SpecResponse } from '@/lib/schemas';

function shortDate(iso: string): string {
  if (iso === '') return 'unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SpecPanel({
  spec,
  draft,
  dirty,
  loading,
  pulling,
  notFound,
  initializing,
  error,
  prNotice,
  editorRef,
  onDraftChange,
  onPullLatest,
  onCheckIn,
  onOpenHistory,
  onInitialize,
  onDismissError,
}: {
  spec: SpecResponse | null;
  draft: string;
  dirty: boolean;
  loading: boolean;
  pulling: boolean;
  notFound: boolean;
  initializing: boolean;
  error: unknown;
  prNotice: { url: string; branch: string } | null;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onPullLatest: () => void;
  onCheckIn: () => void;
  onOpenHistory: () => void;
  onInitialize: () => void;
  onDismissError: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-[0.14em] text-inkDim">
          Product Behavior Spec
        </h2>

        {spec ? (
          <a
            href={spec.htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={`${spec.commit.message || 'no commit message'} — ${spec.commit.author}`}
            className="rounded border border-line bg-panelAlt px-2 py-0.5 font-mono text-[10px] text-accent hover:border-accent/60"
          >
            v: {spec.commit.sha ? spec.commit.sha.slice(0, 7) : 'unknown'} · {shortDate(spec.commit.date)}
          </a>
        ) : null}

        {dirty ? (
          <span className="rounded border border-secondary/60 bg-secondary/10 px-2 py-0.5 font-mono text-[10px] text-secondary">
            edited · uncommitted
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button onClick={onPullLatest} loading={pulling} disabled={loading || pulling}>
          Pull latest
        </Button>
        <Button variant="primary" onClick={onCheckIn} disabled={!dirty || loading || spec === null}>
          Check in changes
        </Button>
        <Button onClick={onOpenHistory} disabled={spec === null}>
          History
        </Button>
        <span className="ml-auto font-mono text-[10px] text-inkDim">
          {spec ? `${spec.specPath} @ ${spec.baseBranch}` : ''}
        </span>
      </div>

      {error ? (
        <div className="px-3 pt-3">
          <ErrorNote error={error} onDismiss={onDismissError} />
        </div>
      ) : null}

      {prNotice ? (
        <div className="mx-3 mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent">
          Pull request open on <span className="font-mono">{prNotice.branch}</span>. It becomes the version of record
          once merged — pull latest after that.{' '}
          <a href={prNotice.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            Review →
          </a>
        </div>
      ) : null}

      {notFound ? (
        <div className="m-3 rounded-md border border-secondary/50 bg-secondary/10 px-3 py-3 text-xs">
          <p className="text-ink">
            No spec file in the repo yet. Initialize it with a starter Wyze subscription-management spec — it goes in
            through the same pull-request flow as any other change.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={onInitialize} loading={initializing}>
              Initialize spec in repo
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-panel/80 text-xs text-inkDim">
            <Spinner /> loading spec…
          </div>
        ) : null}
        <textarea
          ref={editorRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          spellCheck={false}
          placeholder="The spec loads from GitHub. Edit here, then check the change back in."
          className="scroll-thin h-full w-full resize-none bg-panel px-3 py-3 font-mono text-[11.5px] leading-[1.6] text-ink outline-none placeholder:text-inkDim/60"
        />
      </div>

      <footer className="flex items-center justify-between border-t border-line px-3 py-1.5 font-mono text-[10px] text-inkDim">
        <span>{draft.split('\n').length} lines</span>
        <span>{(new TextEncoder().encode(draft).length / 1024).toFixed(1)} KB / 100 KB</span>
      </footer>
    </section>
  );
}
