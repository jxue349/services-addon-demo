import { describe, expect, it } from 'vitest';
import { countLines, extractRuleIds, findRuleRange } from '@/lib/client/rules';
import { sanitizeLabel, toMermaidSource } from '@/lib/client/mermaid-source';
import { testsToCsv, testsToMarkdown } from '@/lib/client/export';
import type { TestCase } from '@/lib/schemas';

const SPEC = [
  '# Spec',
  '',
  'Overlap is resolved per R-102 elsewhere in this sentence.',
  '',
  '- **R-101** — An account-level entitlement covers all eligible devices',
  '  on the account.',
  '',
  '- **R-102** — Higher entitlement wins.',
  '',
].join('\n');

describe('findRuleRange', () => {
  it('prefers the definition line over an earlier passing citation', () => {
    const range = findRuleRange(SPEC, 'R-102');
    expect(range).not.toBeNull();
    expect(SPEC.slice(range!.start, range!.end)).toBe('- **R-102** — Higher entitlement wins.');
  });

  it('spans the whole paragraph of a wrapped rule', () => {
    const range = findRuleRange(SPEC, 'R-101');
    expect(SPEC.slice(range!.start, range!.end)).toContain('on the account.');
  });

  it('returns null for a rule the spec never mentions', () => {
    expect(findRuleRange(SPEC, 'R-999')).toBeNull();
  });

  it('reports the line the rule starts on', () => {
    expect(findRuleRange(SPEC, 'R-101')?.line).toBe(4);
  });
});

describe('extractRuleIds', () => {
  it('returns each rule once, in document order', () => {
    expect(extractRuleIds(SPEC)).toEqual(['R-102', 'R-101']);
  });
});

describe('countLines', () => {
  it('is zero-based', () => {
    expect(countLines('a\nb\nc', 0)).toBe(0);
    expect(countLines('a\nb\nc', 4)).toBe(2);
  });
});

describe('sanitizeLabel', () => {
  it('strips diagram syntax and markup out of the label position', () => {
    expect(sanitizeLabel('Active: <b>x</b> --> y')).toBe('Active b x /b - y');
  });

  it('falls back when nothing survives', () => {
    expect(sanitizeLabel('<<<>>>', 'event')).toBe('event');
  });
});

describe('toMermaidSource', () => {
  it('declares nodes for transition endpoints the model forgot to list', () => {
    const source = toMermaidSource({
      states: ['Active'],
      transitions: [{ from: 'Active', to: 'Refunded', event: 'refund issued', rules: ['R-303'], note: '' }],
    });

    expect(source.split('\n')[0]).toBe('stateDiagram-v2');
    expect(source).toContain('S0 : Active');
    expect(source).toContain('S1 : Refunded');
    expect(source).toContain('S0 --> S1 : refund issued');
  });

  it('never emits a raw colon or angle bracket from model text', () => {
    const source = toMermaidSource({
      states: ['A: <script>'],
      transitions: [{ from: 'A: <script>', to: 'A: <script>', event: 'e: <img>', rules: [], note: '' }],
    });

    expect(source).not.toContain('<');
    expect(source.match(/:/g)?.length).toBe(2); // one node label, one edge label
  });
});

describe('QA matrix export', () => {
  const tests: TestCase[] = [
    {
      id: 'T-01',
      scenario: 'Renewal fails on iOS | mid-term',
      expected: 'Grace period granted',
      priority: 'P1',
      rules: ['R-302'],
      inPrototype: false,
    },
  ];

  it('escapes pipes in Markdown cells', () => {
    const md = testsToMarkdown(tests);
    expect(md).toContain('Renewal fails on iOS \\| mid-term');
    expect(md).toContain('1 cover behavior the prototype never visualized');
  });

  it('quotes every CSV field and doubles internal quotes', () => {
    const csv = testsToCsv([{ ...tests[0]!, scenario: 'he said "no"' }]);
    expect(csv.split('\r\n')[1]).toContain('"he said ""no"""');
  });
});
