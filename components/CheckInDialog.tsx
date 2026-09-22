'use client';

import { useEffect, useState } from 'react';
import { Button, ErrorNote, SectionLabel } from './ui';
import type { CommitResponse } from '@/lib/schemas';

/**
 * Check-in dialog. Defaults to branch + pull request. A direct commit to the
 * base branch is only offered when the server allows it, and then only behind
 * a second explicit confirmation — spec changes are product-truth changes.
 */
export function CheckInDialog({
  open,
  allowDirectCommit,
  baseBranch,
  submitting,
  error,
  result,
  onSubmit,
  onClose,
  onAcceptUpstream,
}: {
  open: boolean;
  allowDirectCommit: boolean;
  baseBranch: string;
  submitting: boolean;
  error: unknown;
  result: CommitResponse | null;
  onSubmit: (input: { commitMessage: string; prTitle: string; prBody: string; direct: boolean }) => void;
  onClose: () => void;
  onAcceptUpstream?: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [prBody, setPrBody] = useState('');
  const [direct, setDirect] = useState(false);
  const [confirmedDirect, setConfirmedDirect] = useState(false);

  useEffect(() => {
    if (open) {
      setSummary('');
      setPrBody('');
      setDirect(false);
      setConfirmedDirect(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = summary.trim();
  const commitMessage = `spec: ${trimmed}`;
  const conflicted = typeof error === 'object' && error !== null && 'status' in error && error.status === 409;
  const blocked = trimmed === '' || submitting || (direct && !confirmedDirect);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Check in spec changes</h3>
          <button onClick={onClose} className="text-inkDim hover:text-white" aria-label="Close">
            ×
          </button>
        </header>

        {result ? (
          <div className="space-y-3 px-4 py-4 text-xs">
            <div className="rounded-md border border-accent/50 bg-accent/10 px-3 py-3 text-accent">
              {result.mode === 'pull-request' ? (
                <>
                  <div className="font-medium">Pull request opened.</div>
                  <div className="mt-1 font-mono text-[10px] text-accent/80">{result.branch}</div>
                  {result.prUrl ? (
                    <a
                      href={result.prUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-block underline underline-offset-2"
                    >
                      Review it on GitHub →
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="font-medium">Committed directly to {result.branch}.</div>
                  <div className="mt-1 font-mono text-[10px] text-accent/80">{result.commitSha.slice(0, 7)}</div>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            {error ? <ErrorNote error={error} /> : null}

            {conflicted && onAcceptUpstream ? (
              <div className="rounded-md border border-secondary/50 bg-secondary/10 px-3 py-2 text-xs text-ink">
                The upstream spec moved. Load the upstream version into the editor, re-apply your edit, then check in
                again.
                <div className="mt-2">
                  <Button onClick={onAcceptUpstream}>Load upstream version</Button>
                </div>
              </div>
            ) : null}

            <label className="block space-y-1">
              <SectionLabel>Summary</SectionLabel>
              <input
                autoFocus
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="grace period applies to website purchases too"
                className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent/60"
              />
              <p className="font-mono text-[10px] text-inkDim">
                commit &amp; PR title: {trimmed === '' ? 'spec: …' : commitMessage}
              </p>
            </label>

            <label className="block space-y-1">
              <SectionLabel>PR description (optional)</SectionLabel>
              <textarea
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                rows={4}
                placeholder="What behavior changed, and why."
                className="scroll-thin w-full resize-none rounded-md border border-line bg-panelAlt px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent/60"
              />
            </label>

            {allowDirectCommit ? (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
                <label className="flex items-start gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={direct}
                    onChange={(e) => {
                      setDirect(e.target.checked);
                      setConfirmedDirect(false);
                    }}
                    className="mt-0.5 accent-[#FF7A6B]"
                  />
                  <span>
                    Commit straight to <span className="font-mono">{baseBranch}</span>, skipping review.
                  </span>
                </label>
                {direct ? (
                  <label className="flex items-start gap-2 text-xs text-warning">
                    <input
                      type="checkbox"
                      checked={confirmedDirect}
                      onChange={(e) => setConfirmedDirect(e.target.checked)}
                      className="mt-0.5 accent-[#FF7A6B]"
                    />
                    <span>
                      I understand this changes product truth with no review, and that rollback means reverting the
                      commit by hand.
                    </span>
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="font-mono text-[10px] text-inkDim">
                Direct commits are disabled. This opens a pull request against {baseBranch}.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button
                variant={direct ? 'danger' : 'primary'}
                loading={submitting}
                disabled={blocked}
                onClick={() => onSubmit({ commitMessage, prTitle: commitMessage, prBody, direct })}
              >
                {direct ? `Commit to ${baseBranch}` : 'Open pull request'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
