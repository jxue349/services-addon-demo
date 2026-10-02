'use client';

import { useState } from 'react';
import { RuleChip } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel } from './ui';
import { compileConsistency } from '@/lib/client/api';
import type { ConsistencyReport, TestMatrix } from '@/lib/schemas';

const MARKS = {
  covered: { glyph: '✓', className: 'text-accent', label: 'covered' },
  partial: { glyph: '◐', className: 'text-secondary', label: 'partial' },
  missing: { glyph: '✕', className: 'text-warning', label: 'missing' },
  unknown: { glyph: '—', className: 'text-inkDim', label: 'unknown' },
} as const;

function Mark({ status }: { status: keyof typeof MARKS }) {
  const mark = MARKS[status];
  return (
    <span className={`font-mono text-xs ${mark.className}`} title={mark.label}>
      {mark.glyph} <span className="text-[10px]">{mark.label}</span>
    </span>
  );
}

export function ConsistencyTab({
  spec,
  matrix,
  onReveal,
}: {
  spec: string;
  matrix: TestMatrix | null;
  onReveal: (rule: string) => void;
}) {
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await compileConsistency(spec, matrix?.tests));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const missing = report?.findings.filter((f) => f.prototype === 'missing').length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void run()} loading={busy} disabled={spec.trim() === ''}>
          {report ? 'Re-run consistency check' : 'Run consistency check'}
        </Button>
        <span className="font-mono text-[10px] text-inkDim">
          {matrix
            ? `QA coverage judged against ${matrix.tests.length} tests compiled this session`
            : 'no test matrix compiled — QA column will read "unknown"'}
        </span>
      </div>

      {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

      {report ? (
        <>
          <Panel
            className={`px-3 py-3 text-xs leading-relaxed ${
              missing > 0 ? 'border-warning/50 bg-warning/10 text-warning' : 'border-accent/50 bg-accent/10 text-accent'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Headline finding</div>
            <p className="mt-1">{report.headline}</p>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-inkDim">
                    <th className="px-3 py-2 font-medium">Rule</th>
                    <th className="px-3 py-2 font-medium">Requires</th>
                    <th className="px-3 py-2 font-medium">Prototype</th>
                    <th className="px-3 py-2 font-medium">QA</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {report.findings.map((f, i) => (
                    <tr key={`${f.rule}-${i}`} className="border-b border-line/60 align-top last:border-0">
                      <td className="px-3 py-2">
                        <RuleChip rule={f.rule} onReveal={onReveal} />
                      </td>
                      <td className="max-w-[260px] px-3 py-2 leading-relaxed text-ink">{f.summary}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Mark status={f.prototype} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Mark status={f.qa} />
                      </td>
                      <td className="max-w-[280px] px-3 py-2 leading-relaxed text-inkDim">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <EmptyState>
          Check every rule in the spec against what the prototype shows and what QA covers. Compile the test matrix
          first to get a real QA column.
        </EmptyState>
      )}
    </div>
  );
}
