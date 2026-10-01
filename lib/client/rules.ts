/**
 * Locating rules inside the spec text so a rule chip can reveal the rule it
 * cites. Pure string work — no DOM — so it is trivially testable.
 */

/**
 * A rule ID, with or without a spec namespace.
 *
 * Child specs namespace their rules (`CAMPLUS-R-101`) so that merging them
 * into the parent cannot collide, and so a citation says which spec it came
 * from. Bare `R-101` stays valid for the parent spec and for anything written
 * before namespacing.
 */
const RULE_ID = /\b(?:[A-Z][A-Z0-9]{1,15}-)?R-\d{3}\b/g;

/** Every distinct rule ID in the spec, in document order. */
export function extractRuleIds(spec: string): string[] {
  const seen = new Set<string>();
  for (const match of spec.matchAll(RULE_ID)) seen.add(match[0]);
  return [...seen];
}

/**
 * Namespace prefix for a child spec, derived from its directory.
 * `spec/cam-plus/behavior.md` -> `CAMPLUS`, so its rules read `CAMPLUS-R-101`.
 */
export function namespaceFor(specPath: string, specRoot: string): string {
  const rootSegments = specRoot.split('/').filter((s) => s !== '');
  const segments = specPath.split('/').slice(rootSegments.length);
  const dir = segments.length > 1 ? segments[0] : segments[0]?.replace(/\.md$/i, '');
  return (dir ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'SPEC';
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

  // A rule id must not match inside a longer id: asking for R-101 must never
  // land on CAMPLUS-R-101, or a parent citation would jump into a child spec.
  const notIdChar = '(?<![A-Za-z0-9-])';

  const definition = new RegExp(`^[ \\t]*(?:[-*+][ \\t]+)?(?:\\*\\*|__)?${notIdChar}${id}(?:\\*\\*|__)?\\b`, 'm');
  const citation = new RegExp(`${notIdChar}${id}\\b`);

  // Prefer the definition line; fall back to the first citation anywhere.
  const match = definition.exec(spec) ?? citation.exec(spec);
  if (match === null) return null;

  const start = match.index;

  let end = endOfRuleBlock(spec, start);

  // Don't drag trailing whitespace into the selection — at the end of the file
  // that would highlight the blank tail of the editor.
  while (end > start && /\s/.test(spec[end - 1] ?? '')) end -= 1;

  return { start, end, line: countLines(spec, start) };
}

/** A line that begins a new block, so the previous rule has ended. */
function startsNewBlock(line: string): boolean {
  return (
    line.trim() === '' ||
    /^[ \t]*[-*+][ \t]+/.test(line) || // next list item — rules are usually a tight list
    /^[ \t]*\d+[.)][ \t]+/.test(line) || // next ordered item
    /^#{1,6}[ \t]/.test(line) // next heading
  );
}

/**
 * Where a rule's own text stops.
 *
 * Ending at the next blank line is not enough: specs normally write rules as a
 * tight bullet list, so the following rule would be swept into the selection
 * and a chip for R-302 would also highlight R-303. Continuation lines (the
 * indented wrap of a long rule) must still be included, so only a line that
 * opens a new block terminates the range.
 */
function endOfRuleBlock(spec: string, start: number): number {
  let cursor = spec.indexOf('\n', start);

  while (cursor !== -1) {
    const lineStart = cursor + 1;
    const nextBreak = spec.indexOf('\n', lineStart);
    const line = spec.slice(lineStart, nextBreak === -1 ? spec.length : nextBreak);

    if (startsNewBlock(line)) return cursor;
    if (nextBreak === -1) return spec.length;
    cursor = nextBreak;
  }

  return spec.length;
}

/** Zero-based line index of `offset`. */
export function countLines(text: string, offset: number): number {
  let lines = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') lines += 1;
  }
  return lines;
}
