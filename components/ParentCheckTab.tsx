'use client';

import { useState } from 'react';
import { RuleChip } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, SectionLabel } from './ui';
import { compileConflicts, getSpec, requestParentChange } from '@/lib/client/api';
import type { ConflictReport, RequestChangeResponse, SpecResponse } from '@/lib/schemas';

const KIND = {
  addition: { label: 'addition', className: 'border-accent/50 text-accent' },
  contradiction: { label: 'contradiction', className: 'border-warning/60 text-warning' },
  duplicate: { label: 'duplicate', className: 'border-line text-inkDim' },
} as const;

function KindTag({ kind }: { kind: keyof typeof KIND }) {
  const k = KIND[kind];
  return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${k.className}`}>{k.label}</span>;
}

/**
 * Checks the selected child spec against the parent knowledge base, then
 * optionally opens a change request against the parent.
 *
 * Only meaningful for a child spec: the parent has nothing to be checked
 * against.
 */
export function ParentCheckTab({
  spec,
  draft,
  onReveal,
}: {
  spec: SpecResponse | null;
  draft: string;
  onReveal: (rule: string) => void;
}) {
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [requested, setRequested] = useState<RequestChangeResponse | null>(null);

  if (spec === null) return <EmptyState>Load a spec first.</EmptyState>;

  if (spec.isParent) {
    return (
      <EmptyState>
        This <em>is</em> the parent knowledge base. Select a child spec to check it against the parent and request a
        change.
      </EmptyState>
    );
  }

  const childLabel = spec.specPath.split('/').slice(-2, -1)[0] ?? spec.specPath;

  const run = async () => {
    setBusy(true);
    setError(null);
    setRequested(null);
    try {
      // Fetch the parent fresh: the check is only meaningful against what the
      // knowledge base says right now, not a copy from earlier in the session.
      const parent = await getSpec(spec.parentPath);
      setReport(await compileConflicts(parent.content, draft, childLabel));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (report === null) return;
    setRequesting(true);
    setRequestError(null);
    try {
      setRequested(
        await requestParentChange({
          childPath: spec.specPath,
          childLabel,
          summary: `absorb ${report.proposedAdditions.length} rule(s) from ${childLabel}`,
          additions: report.proposedAdditions,
          conflicts: report.findings,
        }),
      );
    } catch (err) {
      setRequestError(err);
    } finally {
      setRequesting(false);
    }
  };

  const contradictions = report?.findings.filter((f) => f.kind === 'contradiction') ?? [];
  const additions = report?.proposedAdditions ?? [];
  const canRequest = additions.length > 0 || contradictions.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void run()} loading={busy} disabled={draft.trim() === ''}>
          {report ? 'Re-check against parent' : 'Check against parent'}
        </Button>
        <span className="font-mono text-[10px] text-inkDim">
          {childLabel} → {spec.parentPath}
        </span>
      </div>

      {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

      {report ? (
        <>
          <Panel
            className={`px-3 py-3 text-xs leading-relaxed ${
              contradictions.length > 0
                ? 'border-warning/50 bg-warning/10 text-warning'
                : 'border-accent/50 bg-accent/10 text-accent'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Headline</div>
            <p className="mt-1">{report.headline}</p>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-inkDim">
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Child rule</th>
                    <th className="px-3 py-2 font-medium">Parent rule</th>
                    <th className="px-3 py-2 font-medium">Summary</th>
                    <th className="px-3 py-2 font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {report.findings.map((f, i) => (
                    <tr key={`${f.childRule}-${i}`} className="border-b border-line/60 align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">
                        <KindTag kind={f.kind} />
                      </td>
                      <td className="px-3 py-2">
                        <RuleChip rule={f.childRule} onReveal={onReveal} />
                      </td>
                      <td className="px-3 py-2">
                        {f.parentRule ? (
                          <span className="font-mono text-[10px] text-inkDim">{f.parentRule}</span>
                        ) : (
                          <span className="font-mono text-[10px] text-inkDim">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-3 py-2 leading-relaxed text-ink">{f.summary}</td>
                      <td className="max-w-[240px] px-3 py-2 leading-relaxed text-inkDim">{f.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-3">
            <SectionLabel>Request a change to the parent</SectionLabel>
            <p className="mt-1 text-xs leading-relaxed text-ink">
              Opens a pull request against <span className="font-mono">{spec.parentPath}</span> and asks the parent
              spec&apos;s followers to review.{' '}
              {additions.length > 0 ? (
                <>
                  <span className="text-accent">{additions.length} rule(s)</span> would be merged in.
                </>
              ) : (
                'No rules can be merged automatically.'
              )}{' '}
              {contradictions.length > 0 ? (
                <>
                  <span className="text-warning">{contradictions.length} conflict(s)</span> go to the followers as a
                  decision — contradictions are never applied automatically.
                </>
              ) : null}
            </p>

            {requestError ? (
              <div className="mt-2">
                <ErrorNote error={requestError} onDismiss={() => setRequestError(null)} />
              </div>
            ) : null}

            {requested ? (
              <div className="mt-3 rounded-md border border-accent/50 bg-accent/10 px-3 py-3 text-xs text-accent">
                <div className="font-medium">Change requested.</div>
                <div className="mt-1 font-mono text-[10px] text-accent/80">{requested.branch}</div>
                <div className="mt-1">
                  {requested.additionsApplied} rule(s) merged
                  {requested.reviewersRequested.length > 0
                    ? ` · review requested from ${requested.reviewersRequested.join(', ')}`
                    : ''}
                  {requested.reviewersMentioned.length > 0
                    ? ` · mentioned ${requested.reviewersMentioned.join(', ')} (no write access)`
                    : ''}
                </div>
                <a
                  href={requested.prUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block underline underline-offset-2"
                >
                  Review it on GitHub →
                </a>
              </div>
            ) : (
              <div className="mt-3">
                <Button
                  variant="primary"
                  onClick={() => void submit()}
                  loading={requesting}
                  disabled={!canRequest}
                  title={canRequest ? undefined : 'Nothing to merge and nothing to resolve'}
                >
                  Request change to parent
                </Button>
              </div>
            )}
          </Panel>
        </>
      ) : (
        <EmptyState>
          Compare this spec against the knowledge base: what can be merged, what contradicts it, what it already
          covers.
        </EmptyState>
      )}
    </div>
  );
}
