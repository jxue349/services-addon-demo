'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckInDialog } from '@/components/CheckInDialog';
import { ConsistencyTab } from '@/components/ConsistencyTab';
import { ExplorerTab } from '@/components/ExplorerTab';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { SpecPanel } from '@/components/SpecPanel';
import { StatesTab } from '@/components/StatesTab';
import { TestsTab } from '@/components/TestsTab';
import { ApiError, commitSpec, getSpec, initSpec, listSpecs, pullLatest } from '@/lib/client/api';
import { findRuleRange } from '@/lib/client/rules';
import type { CommitResponse, SpecListEntry, SpecResponse, TestMatrix } from '@/lib/schemas';

const TABS = [
  { id: 'explorer', label: 'Behavior Explorer' },
  { id: 'tests', label: 'QA Test Matrix' },
  { id: 'states', label: 'State Machine' },
  { id: 'consistency', label: 'Consistency Check' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Page() {
  const [spec, setSpec] = useState<SpecResponse | null>(null);
  const [specs, setSpecs] = useState<SpecListEntry[]>([]);
  // undefined = "whatever the server considers the parent"; set once chosen.
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [specError, setSpecError] = useState<unknown>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<unknown>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [prNotice, setPrNotice] = useState<{ url: string; branch: string } | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('explorer');
  const [matrix, setMatrix] = useState<TestMatrix | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = spec !== null && draft !== spec.content;

  const load = useCallback(async (mode: 'initial' | 'pull', path?: string) => {
    if (mode === 'initial') setLoading(true);
    else setPulling(true);
    setSpecError(null);
    try {
      const next = mode === 'initial' ? await getSpec(path) : await pullLatest(path);
      setSpec(next);
      setDraft(next.content);
      setSelectedPath(next.specPath);
      setNotFound(false);
      setPrNotice(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        setSpec(null);
      } else {
        setSpecError(err);
      }
    } finally {
      setLoading(false);
      setPulling(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
    // The selector is additive: if listing fails the app still works on the
    // parent spec, so this failure is not surfaced as a blocking error.
    void listSpecs()
      .then((res) => setSpecs(res.specs))
      .catch(() => setSpecs([]));
  }, [load]);

  /** Switching spec discards uncommitted edits, so confirm first. */
  const selectSpec = (path: string) => {
    if (path === spec?.specPath) return;
    if (dirty && !window.confirm('Switching spec discards your uncommitted edits. Continue?')) return;
    setMatrix(null); // a compiled matrix belongs to the spec it came from
    void load('pull', path);
  };

  /** Reveals a cited rule in the editor: scroll to it and select its paragraph. */
  const revealRule = useCallback(
    (rule: string) => {
      const editor = editorRef.current;
      if (editor === null) return;

      const range = findRuleRange(draft, rule);
      if (range === null) {
        // A cited rule that is not in the spec is itself worth seeing.
        editor.focus();
        return;
      }

      editor.focus();
      editor.setSelectionRange(range.start, range.end);

      const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 18;
      editor.scrollTop = Math.max(0, range.line * lineHeight - editor.clientHeight / 3);

      editor.classList.add('flash-accent');
      window.setTimeout(() => editor.classList.remove('flash-accent'), 750);
    },
    [draft],
  );

  const handlePull = () => {
    if (dirty && !window.confirm('Pulling the latest spec discards your uncommitted edits. Continue?')) return;
    void load('pull', selectedPath);
  };

  const handleInitialize = async () => {
    setInitializing(true);
    setSpecError(null);
    try {
      const result = await initSpec();
      if (result.mode === 'pull-request' && result.prUrl) {
        // The file lives only on the PR branch until someone merges it, so the
        // base branch is still legitimately empty — keep the init panel up.
        setPrNotice({ url: result.prUrl, branch: result.branch });
      } else {
        await load('pull');
      }
    } catch (err) {
      setSpecError(err);
    } finally {
      setInitializing(false);
    }
  };

  const handleCheckIn = async (input: {
    commitMessage: string;
    prTitle: string;
    prBody: string;
    direct: boolean;
  }) => {
    if (spec === null) return;
    setSubmitting(true);
    setCommitError(null);
    try {
      const result = await commitSpec({
        specPath: spec.specPath,
        content: draft,
        baseSha: spec.sha,
        commitMessage: input.commitMessage,
        prTitle: input.prTitle,
        prBody: input.prBody,
        ...(input.direct ? { direct: true } : {}),
      });
      setCommitResult(result);
      if (result.mode === 'pull-request' && result.prUrl) {
        setPrNotice({ url: result.prUrl, branch: result.branch });
      } else {
        // Direct commit landed on the base branch: re-read so the version badge
        // and the base SHA reflect reality and the editor stops reading dirty.
        await load('pull', spec.specPath);
      }
    } catch (err) {
      setCommitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  /** 409 recovery: take the upstream text so the user can re-apply their edit. */
  const acceptUpstream = () => {
    const err = commitError;
    if (!(err instanceof ApiError) || !err.upstream) return;
    setDraft(err.upstream.content);
    setSpec((prev) =>
      prev === null ? prev : { ...prev, content: err.upstream!.content, sha: err.upstream!.sha },
    );
    setCommitError(null);
    setDialogOpen(false);
  };

  return (
    <main className="flex h-screen flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-sm font-semibold tracking-wide text-white">AI Spec Explorer</h1>
        <p className="text-[11px] text-inkDim">
          The spec in Git is the source of truth. It compiles into four views — edit a rule, recompile, and the views
          move with it.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <SpecPanel
          specs={specs}
          selectedPath={selectedPath ?? spec?.specPath ?? ''}
          onSelectSpec={selectSpec}
          spec={spec}
          draft={draft}
          dirty={dirty}
          loading={loading}
          pulling={pulling}
          notFound={notFound}
          initializing={initializing}
          error={specError}
          prNotice={prNotice}
          editorRef={editorRef}
          onDraftChange={setDraft}
          onPullLatest={handlePull}
          onCheckIn={() => {
            setCommitResult(null);
            setCommitError(null);
            setDialogOpen(true);
          }}
          onOpenHistory={() => setHistoryOpen(true)}
          onInitialize={() => void handleInitialize()}
          onDismissError={() => setSpecError(null)}
        />

        <section className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
          <nav className="flex shrink-0 gap-1 border-b border-line px-2 py-2" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-accent/15 text-accent'
                    : 'text-inkDim hover:bg-panelAlt hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
            {dirty ? (
              <p className="mb-3 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-1.5 text-[11px] text-secondary">
                Compiling against your uncommitted edit, not the committed version.
              </p>
            ) : null}

            {/* All four stay mounted so results survive tab switches. */}
            <div className={tab === 'explorer' ? 'block' : 'hidden'}>
              <ExplorerTab spec={draft} onReveal={revealRule} />
            </div>
            <div className={tab === 'tests' ? 'block' : 'hidden'}>
              <TestsTab spec={draft} matrix={matrix} onMatrix={setMatrix} onReveal={revealRule} />
            </div>
            <div className={tab === 'states' ? 'block' : 'hidden'}>
              <StatesTab spec={draft} onReveal={revealRule} />
            </div>
            <div className={tab === 'consistency' ? 'block' : 'hidden'}>
              <ConsistencyTab spec={draft} matrix={matrix} onReveal={revealRule} />
            </div>
          </div>
        </section>
      </div>

      <CheckInDialog
        open={dialogOpen}
        allowDirectCommit={spec?.allowDirectCommit ?? false}
        baseBranch={spec?.baseBranch ?? 'main'}
        submitting={submitting}
        error={commitError}
        result={commitResult}
        onSubmit={(input) => void handleCheckIn(input)}
        onClose={() => {
          setDialogOpen(false);
          setCommitResult(null);
          setCommitError(null);
        }}
        onAcceptUpstream={acceptUpstream}
      />

      <HistoryDrawer open={historyOpen} specPath={spec?.specPath ?? ''} onClose={() => setHistoryOpen(false)} />
    </main>
  );
}
