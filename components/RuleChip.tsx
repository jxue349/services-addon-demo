'use client';

/**
 * A cited rule ID. Clicking it reveals the rule in the spec editor — the link
 * between a compiled conclusion and the line of spec that produced it.
 */
export function RuleChip({ rule, onReveal }: { rule: string; onReveal: (rule: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onReveal(rule)}
      title={`Show ${rule} in the spec`}
      className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent transition-colors hover:border-accent hover:bg-accent/20"
    >
      {rule}
    </button>
  );
}

export function RuleChips({
  rules,
  onReveal,
  emptyLabel = 'no rule cited',
}: {
  rules: readonly string[];
  onReveal: (rule: string) => void;
  emptyLabel?: string;
}) {
  if (rules.length === 0) {
    return <span className="font-mono text-[10px] text-warning/80">{emptyLabel}</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {rules.map((rule, i) => (
        <RuleChip key={`${rule}-${i}`} rule={rule} onReveal={onReveal} />
      ))}
    </span>
  );
}
