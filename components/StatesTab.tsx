'use client';

import { useEffect, useRef, useState } from 'react';
import { RuleChips } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, SectionLabel } from './ui';
import { compileStates } from '@/lib/client/api';
import { toMermaidSource } from '@/lib/client/mermaid-source';
import type { StateMachine } from '@/lib/schemas';

/**
 * Mermaid is loaded lazily on first render so it stays out of the initial
 * bundle, and runs with securityLevel 'strict'. The SVG it returns is its own
 * output, built from labels we already whitelisted in toMermaidSource — no
 * model text is ever injected as markup.
 */
function useMermaid(source: string | null) {
  const host = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (source === null) return;
    let cancelled = false;

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          themeVariables: {
            darkMode: true,
            background: '#262626',
            primaryColor: '#2E2E2E',
            primaryBorderColor: '#1DF0BB',
            primaryTextColor: '#C8C8C8',
            lineColor: '#827AFF',
            textColor: '#C8C8C8',
          },
        });

        const { svg } = await mermaid.render(`sm-${Date.now()}`, source);
        if (cancelled || host.current === null) return;
        host.current.innerHTML = svg;
        setRenderError(null);
      } catch (err) {
        if (!cancelled) setRenderError(err instanceof Error ? err.message : 'Diagram could not be rendered.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return { host, renderError };
}

export function StatesTab({ spec, onReveal }: { spec: string; onReveal: (rule: string) => void }) {
  const [machine, setMachine] = useState<StateMachine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const source = machine === null ? null : toMermaidSource(machine);
  const { host, renderError } = useMermaid(source);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setMachine(await compileStates(spec));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="primary" onClick={() => void run()} loading={busy} disabled={spec.trim() === ''}>
        {machine ? 'Recompile state machine' : 'Compile state machine'}
      </Button>

      {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

      {machine ? (
        <>
          <Panel className="p-3">
            <SectionLabel>Lifecycle</SectionLabel>
            <div className="scroll-thin mermaid-host mt-2 overflow-x-auto" ref={host} />
            {renderError ? (
              <p className="mt-2 text-[11px] text-warning">Diagram render failed: {renderError}</p>
            ) : null}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-inkDim">
                    <th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">To</th>
                    <th className="px-3 py-2 font-medium">Rules</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.transitions.map((t, i) => (
                    <tr key={i} className="border-b border-line/60 align-top last:border-0">
                      <td className="px-3 py-2 text-ink">{t.from}</td>
                      <td className="px-3 py-2 text-secondary">{t.event}</td>
                      <td className="px-3 py-2 text-ink">{t.to}</td>
                      <td className="px-3 py-2">
                        <RuleChips rules={t.rules} onReveal={onReveal} />
                      </td>
                      <td className="max-w-[300px] px-3 py-2 leading-relaxed text-inkDim">{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <EmptyState>Compile the lifecycle states and transitions the spec defines.</EmptyState>
      )}
    </div>
  );
}
