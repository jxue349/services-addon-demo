'use client';

import { useState } from 'react';
import { RuleChips } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, PriorityTag } from './ui';
import { compileTests } from '@/lib/client/api';
import { downloadText, testsToCsv, testsToMarkdown } from '@/lib/client/export';
import type { TestMatrix } from '@/lib/schemas';

export function TestsTab({
  spec,
  matrix,
  onMatrix,
  onReveal,
}: {
  spec: string;
  matrix: TestMatrix | null;
  onMatrix: (matrix: TestMatrix) => void;
  onReveal: (rule: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onMatrix(await compileTests(spec));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const tests = matrix?.tests ?? [];
  const uncovered = tests.filter((t) => !t.inPrototype).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void run()} loading={busy} disabled={spec.trim() === ''}>
          {matrix ? 'Recompile test matrix' : 'Compile test matrix'}
        </Button>
        {matrix ? (
          <>
            <Button onClick={() => downloadText('qa-test-matrix.md', 'text/markdown', testsToMarkdown(tests))}>
              Export Markdown
            </Button>
            <Button onClick={() => downloadText('qa-test-matrix.csv', 'text/csv', testsToCsv(tests))}>
              Export CSV
            </Button>
          </>
        ) : null}
      </div>

      {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

      {matrix ? (
        <>
          <Panel className="border-secondary/40 bg-secondary/5 px-3 py-2 text-xs text-ink">
            <span className="font-semibold text-secondary">{uncovered}</span> of {tests.length} tests cover behavior
            the prototype never visualized
            {uncovered > 0 ? ' — that is the untested surface area of this spec.' : '.'}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-inkDim">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Scenario</th>
                    <th className="px-3 py-2 font-medium">Expected</th>
                    <th className="px-3 py-2 font-medium">Pri</th>
                    <th className="px-3 py-2 font-medium">Rules</th>
                    <th className="px-3 py-2 font-medium">In proto</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t, i) => (
                    <tr key={`${t.id}-${i}`} className="border-b border-line/60 align-top last:border-0">
                      <td className="px-3 py-2 font-mono text-[10px] text-inkDim">{t.id}</td>
                      <td className="max-w-[260px] px-3 py-2 leading-relaxed text-ink">{t.scenario}</td>
                      <td className="max-w-[260px] px-3 py-2 leading-relaxed text-ink">{t.expected}</td>
                      <td className="px-3 py-2">
                        <PriorityTag priority={t.priority} />
                      </td>
                      <td className="px-3 py-2">
                        <RuleChips rules={t.rules} onReveal={onReveal} />
                      </td>
                      <td className="px-3 py-2">
                        {t.inPrototype ? (
                          <span className="font-mono text-[10px] text-inkDim">yes</span>
                        ) : (
                          <span className="font-mono text-[10px] text-warning">no</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <EmptyState>Compile the spec into a QA matrix. Recompile after a spec edit to see the delta.</EmptyState>
      )}
    </div>
  );
}
