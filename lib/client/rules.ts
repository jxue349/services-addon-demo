/**
 * Locating rules inside the spec text so a rule chip can reveal the rule it
 * cites. Pure string work — no DOM — so it is trivially testable.
 */

const RULE_ID = /\bR-\d{3}\b/g;

/** Every distinct rule ID in the spec, in document order. */
export function extractRuleIds(spec: string): string[] {
  const seen = new Set<string>();
  for (const match of spec.matchAll(RULE_ID)) seen.add(match[0]);
  return [...seen];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type RuleRange = { start: number; end: number; line: number };

/**
 * Finds where a rule is *defined*, preferring a line that opens with the ID
 * (`- **R-102** — ...`) over a passing citation elsewhere, and returns the span
 * through the end of that paragraph.
 */
export function findRuleRange(spec: string, ruleId: string): RuleRange | null {
  const id = escapeRegExp(ruleId.trim());
  if (id === '') return null;

  const definition = new RegExp(`^[ \\t]*(?:[-*+][ \\t]+)?(?:\\*\\*|__)?${id}(?:\\*\\*|__)?\\b`, 'm');
  const match = definition.exec(spec);

  const start = match?.index ?? spec.indexOf(ruleId);
  if (start === -1) return null;

  const blank = spec.indexOf('\n\n', start);
  let end = blank === -1 ? spec.length : blank;

  // Don't drag trailing whitespace into the selection — at the end of the file
  // that would highlight the blank tail of the editor.
  while (end > start && /\s/.test(spec[end - 1] ?? '')) end -= 1;

  return { start, end, line: countLines(spec, start) };
}

/** Zero-based line index of `offset`. */
export function countLines(text: string, offset: number): number {
  let lines = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') lines += 1;
  }
  return lines;
}
