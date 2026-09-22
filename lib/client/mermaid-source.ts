import type { StateMachine } from '../schemas';

/**
 * Builds Mermaid `stateDiagram-v2` source from compiler output.
 *
 * State names and event labels come from the model, so they are whitelisted
 * down to plain label characters before being interpolated. That keeps
 * diagram syntax (`:`, `-->`, `[`, newlines) out of the label position and
 * removes any markup before it reaches Mermaid, which then does its own
 * sanitising under securityLevel: 'strict'.
 */

const LABEL_ALLOWED = /[^A-Za-z0-9 _.,'’&+()/-]/g;

export function sanitizeLabel(raw: string, fallback = 'unspecified'): string {
  const cleaned = raw
    .replace(LABEL_ALLOWED, ' ')
    // Hyphens are worth keeping ("16-day", "cross-channel"), but a run of them
    // is the remains of an arrow and would read as edge syntax.
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned === '' ? fallback : cleaned;
}

export function toMermaidSource(machine: StateMachine): string {
  // Every state that appears anywhere gets a node, even if the model forgot to
  // list it — a dangling transition target is a spec finding, not a render error.
  const ordered: string[] = [];
  const push = (name: string) => {
    const label = sanitizeLabel(name);
    if (!ordered.includes(label)) ordered.push(label);
  };

  machine.states.forEach(push);
  machine.transitions.forEach((t) => {
    push(t.from);
    push(t.to);
  });

  const idOf = new Map(ordered.map((label, i) => [label, `S${i}`]));

  const lines = ['stateDiagram-v2', '  direction LR'];
  for (const label of ordered) lines.push(`  ${idOf.get(label) ?? 'S0'} : ${label}`);

  for (const t of machine.transitions) {
    const from = idOf.get(sanitizeLabel(t.from));
    const to = idOf.get(sanitizeLabel(t.to));
    if (from === undefined || to === undefined) continue;
    lines.push(`  ${from} --> ${to} : ${sanitizeLabel(t.event, 'event')}`);
  }

  return lines.join('\n');
}
