import { describe, expect, it } from 'vitest';
import { appendAdditions } from '@/lib/merge-additions';
import { followersPathFor, parseFollowers } from '@/lib/followers';

/**
 * These two decide what lands in the parent knowledge base and who is asked
 * to review it, so they are deterministic and tested rather than delegated.
 */

const PARENT = [
  '# Parent spec',
  '',
  '## 3. Rules',
  '',
  '- **R-101** — Account entitlement covers all devices.',
  '- **R-302** — 16-day grace period, IAP only.',
  '',
  '## 5. Prototype coverage',
  '',
  '- Website annual purchase',
].join('\n');

describe('appendAdditions', () => {
  it('appends a section for the child spec', () => {
    const result = appendAdditions(
      PARENT,
      [{ ruleId: 'CAMPLUS-R-101', markdown: '- **CAMPLUS-R-101** — New rule.' }],
      'cam-plus',
    );

    expect(result.applied).toEqual(['CAMPLUS-R-101']);
    expect(result.content).toContain('## Merged from cam-plus');
    expect(result.content).toContain('- **CAMPLUS-R-101** — New rule.');
    // Existing content is untouched.
    expect(result.content).toContain('- **R-302** — 16-day grace period, IAP only.');
    expect(result.content).toContain('## 5. Prototype coverage');
  });

  it('is idempotent: a rule the parent already has is skipped, not duplicated', () => {
    const once = appendAdditions(
      PARENT,
      [{ ruleId: 'CAMPLUS-R-101', markdown: '- **CAMPLUS-R-101** — New rule.' }],
      'cam-plus',
    );
    const twice = appendAdditions(
      once.content,
      [{ ruleId: 'CAMPLUS-R-101', markdown: '- **CAMPLUS-R-101** — New rule.' }],
      'cam-plus',
    );

    expect(twice.applied).toEqual([]);
    expect(twice.skipped).toEqual(['CAMPLUS-R-101']);
    expect(twice.content).toBe(once.content);
    expect(twice.content.match(/CAMPLUS-R-101/g)).toHaveLength(1);
  });

  it('extends an existing section for the same child instead of stacking headings', () => {
    const first = appendAdditions(
      PARENT,
      [{ ruleId: 'CAMPLUS-R-101', markdown: '- **CAMPLUS-R-101** — One.' }],
      'cam-plus',
    );
    const second = appendAdditions(
      first.content,
      [{ ruleId: 'CAMPLUS-R-105', markdown: '- **CAMPLUS-R-105** — Two.' }],
      'cam-plus',
    );

    expect(second.content.match(/## Merged from cam-plus/g)).toHaveLength(1);
    expect(second.content).toContain('- **CAMPLUS-R-101** — One.');
    expect(second.content).toContain('- **CAMPLUS-R-105** — Two.');
  });

  it('keeps separate sections for different child specs', () => {
    const a = appendAdditions(PARENT, [{ ruleId: 'A-R-101', markdown: '- **A-R-101** — a.' }], 'cam-plus');
    const b = appendAdditions(a.content, [{ ruleId: 'B-R-101', markdown: '- **B-R-101** — b.' }], 'upsell');

    expect(b.content).toContain('## Merged from cam-plus');
    expect(b.content).toContain('## Merged from upsell');
  });

  it('does not match a rule id inside a longer one', () => {
    // R-10 must not be considered present just because R-101 exists.
    const result = appendAdditions(PARENT, [{ ruleId: 'R-10', markdown: '- **R-10** — distinct rule.' }], 'x');
    expect(result.applied).toEqual(['R-10']);
  });

  it('returns the parent unchanged when there is nothing to add', () => {
    const result = appendAdditions(PARENT, [], 'cam-plus');
    expect(result.content).toBe(PARENT);
    expect(result.applied).toEqual([]);
  });

  it('ignores blank entries', () => {
    const result = appendAdditions(PARENT, [{ ruleId: '  ', markdown: '' }], 'cam-plus');
    expect(result.content).toBe(PARENT);
  });
});

describe('parseFollowers', () => {
  it('reads one username per line, tolerating @ and comments', () => {
    const content = ['# owners of the parent spec', '@jxue349', 'some-pm', '', '  another-pm  # services PM', ''].join(
      '\n',
    );
    expect(parseFollowers(content)).toEqual(['jxue349', 'some-pm', 'another-pm']);
  });

  it('deduplicates', () => {
    expect(parseFollowers('a\na\n@a')).toEqual(['a']);
  });

  it('drops anything that is not a valid GitHub username', () => {
    const content = ['good-name', 'bad name', 'bad_name', '-leading', 'trailing-', 'a'.repeat(40), 'x@y.com'].join('\n');
    expect(parseFollowers(content)).toEqual(['good-name']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 80 }, (_, i) => `user${i}`).join('\n');
    expect(parseFollowers(many)).toHaveLength(50);
  });

  it('returns nothing for an empty or comment-only file', () => {
    expect(parseFollowers('')).toEqual([]);
    expect(parseFollowers('# nobody yet\n')).toEqual([]);
  });
});

describe('followersPathFor', () => {
  it('sits beside the parent spec', () => {
    expect(followersPathFor('spec/parent.md')).toBe('spec/followers.txt');
    expect(followersPathFor('docs/specs/kb.md')).toBe('docs/specs/followers.txt');
  });

  it('handles a parent at the repo root', () => {
    expect(followersPathFor('parent.md')).toBe('followers.txt');
  });
});
