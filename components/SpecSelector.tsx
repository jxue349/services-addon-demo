'use client';

import { SectionLabel } from './ui';
import type { SpecListEntry } from '@/lib/schemas';

/**
 * Picks which spec the editor and the compilers work on: the parent knowledge
 * base, or one child spec.
 *
 * Deliberately one-at-a-time rather than a merged view. Each spec is its own
 * source of truth until it is merged into the parent, and compiling a union of
 * documents would make rule citations ambiguous about which spec they came
 * from — the one thing this tool must never be vague about.
 */
export function SpecSelector({
  specs,
  value,
  disabled,
  onChange,
}: {
  specs: SpecListEntry[];
  value: string;
  disabled: boolean;
  onChange: (path: string) => void;
}) {
  if (specs.length === 0) return null;

  const children = specs.filter((spec) => !spec.isParent);
  const parent = specs.find((spec) => spec.isParent);

  return (
    <label className="block space-y-1">
      <SectionLabel>Spec</SectionLabel>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60 disabled:opacity-50"
      >
        {parent ? (
          <optgroup label="Knowledge base">
            <option value={parent.path}>{parent.label}</option>
          </optgroup>
        ) : null}
        {children.length > 0 ? (
          <optgroup label={`Specs (${children.length})`}>
            {children.map((spec) => (
              <option key={spec.path} value={spec.path}>
                {spec.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
