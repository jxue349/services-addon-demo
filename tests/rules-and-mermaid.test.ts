import { describe, expect, it } from 'vitest';
import { countLines, extractRuleIds, findRuleRange, namespaceFor } from '@/lib/client/rules';
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

  // Specs write rules as a tight bullet list, so "up to the next blank line"
  // used to sweep the following rule into the selection.
  describe('tight lists', () => {
    const TIGHT = [
      '### Lifecycle',
      '',
      '- **R-301** — Cancellation is not immediate. The entitlement remains active',
      '  until the end of the paid period, then expires.',
      '- **R-302** — When a renewal payment fails, the subscription enters a 16-day',
      '  grace period during which the entitlement remains active.',
      '- **R-303** — A refund revokes the entitlement immediately.',
      '',
      '## 4. Lifecycle states',
    ].join('\n');

    it('stops at the next list item', () => {
      const range = findRuleRange(TIGHT, 'R-302')!;
      const selected = TIGHT.slice(range.start, range.end);
      expect(selected).toContain('R-302');
      expect(selected).not.toContain('R-303');
    });

    it('still includes the indented continuation of a wrapped rule', () => {
      const range = findRuleRange(TIGHT, 'R-302')!;
      expect(TIGHT.slice(range.start, range.end)).toContain('grace period during which');
    });

    it('stops at the next heading for the last rule in a list', () => {
      const range = findRuleRange(TIGHT, 'R-303')!;
      const selected = TIGHT.slice(range.start, range.end);
      expect(selected).toBe('- **R-303** — A refund revokes the entitlement immediately.');
    });

    it('does not bleed into a following ordered list', () => {
      const ordered = '- **R-401** — Manage in the purchase channel.\n1. First step\n';
      const range = findRuleRange(ordered, 'R-401')!;
      expect(ordered.slice(range.start, range.end)).toBe('- **R-401** — Manage in the purchase channel.');
    });
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

describe('namespaced rule IDs', () => {
  const CHILD = [
    '# CAMPLUS spec',
    '',
    '- **CAMPLUS-R-101** — First rule for CAMPLUS.',
    '- **CAMPLUS-R-102** — Second rule, wrapping onto',
    '  a continuation line.',
  ].join('\n');

  it('extracts namespaced ids', () => {
    expect(extractRuleIds(CHILD)).toEqual(['CAMPLUS-R-101', 'CAMPLUS-R-102']);
  });

  it('still extracts bare ids from the parent spec', () => {
    expect(extractRuleIds('- **R-101** — x\n- **R-302** — y')).toEqual(['R-101', 'R-302']);
  });

  it('reveals a namespaced rule without catching its neighbour', () => {
    const range = findRuleRange(CHILD, 'CAMPLUS-R-101')!;
    const selected = CHILD.slice(range.start, range.end);
    expect(selected).toBe('- **CAMPLUS-R-101** — First rule for CAMPLUS.');
  });

  it('does not match a bare id against a namespaced one', () => {
    // Asking for R-101 must not land on CAMPLUS-R-101: the word boundary in
    // the pattern would otherwise make a parent citation jump to a child rule.
    expect(findRuleRange(CHILD, 'R-101')).toBeNull();
  });

  it('derives a namespace from the spec directory', () => {
    expect(namespaceFor('spec/cam-plus/behavior.md', 'spec')).toBe('CAMPLUS');
    expect(namespaceFor('spec/upsell/behavior.md', 'spec')).toBe('UPSELL');
    expect(namespaceFor('spec/parent.md', 'spec')).toBe('PARENT');
  });
});
