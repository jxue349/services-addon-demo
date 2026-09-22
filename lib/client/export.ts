import type { TestCase } from '../schemas';

/** Markdown and CSV renderers for the QA matrix, plus a browser download. */

export function testsToMarkdown(tests: readonly TestCase[]): string {
  const header = '| ID | Priority | Scenario | Expected | Rules | In prototype |';
  const divider = '| --- | --- | --- | --- | --- | --- |';
  const escapePipes = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

  const rows = tests.map((t) =>
    [
      t.id,
      t.priority,
      escapePipes(t.scenario),
      escapePipes(t.expected),
      t.rules.join(', '),
      t.inPrototype ? 'yes' : 'no',
    ].join(' | '),
  );

  const uncovered = tests.filter((t) => !t.inPrototype).length;

  return [
    '# QA test matrix',
    '',
    `Compiled from the Product Behavior Specification. ${tests.length} tests; ${uncovered} cover behavior the prototype never visualized.`,
    '',
    header,
    divider,
    ...rows.map((r) => `| ${r} |`),
    '',
  ].join('\n');
}

export function testsToCsv(tests: readonly TestCase[]): string {
  // Quote every field and double internal quotes — the safe CSV subset.
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ['id', 'priority', 'scenario', 'expected', 'rules', 'in_prototype'].map(cell).join(',');
  const rows = tests.map((t) =>
    [t.id, t.priority, t.scenario, t.expected, t.rules.join(' '), t.inPrototype ? 'yes' : 'no'].map(cell).join(','),
  );
  return [header, ...rows].join('\r\n');
}

/** Triggers a client-side file download for generated text. */
export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
