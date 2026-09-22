import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  JsonExtractionError,
  SchemaValidationError,
  extractFirstJsonObject,
  formatIssues,
  parseAndValidate,
  parseModelJson,
  stripCodeFences,
} from '@/lib/json';

describe('stripCodeFences', () => {
  it('keeps the body of a labelled fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('keeps the body of an unlabelled fence', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('drops the opener of an unterminated fence', () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('leaves unfenced text alone', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractFirstJsonObject', () => {
  it('ignores prose before and after the object', () => {
    expect(extractFirstJsonObject('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it('balances nested objects', () => {
    expect(extractFirstJsonObject('{"a":{"b":{"c":2}},"d":3}')).toBe('{"a":{"b":{"c":2}},"d":3}');
  });

  it('does not count braces inside strings', () => {
    const raw = '{"note":"use {curly} braces","n":1}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  it('does not count an escaped quote as closing a string', () => {
    const raw = '{"note":"a \\" then }","n":1}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  it('throws when there is no object', () => {
    expect(() => extractFirstJsonObject('no json here')).toThrow(JsonExtractionError);
  });

  it('throws when the object never closes', () => {
    expect(() => extractFirstJsonObject('{"a":1')).toThrow(JsonExtractionError);
  });
});

describe('parseModelJson', () => {
  it('handles a fenced object with a preamble', () => {
    expect(parseModelJson('Here you go:\n```json\n{"answer":"yes"}\n```')).toEqual({ answer: 'yes' });
  });

  it('throws JsonExtractionError on malformed JSON', () => {
    expect(() => parseModelJson('{"a": }')).toThrow(JsonExtractionError);
  });
});

describe('formatIssues', () => {
  it('renders path and message, and caps the list at ten', () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({ path: ['tests', i], message: 'bad' }));
    const formatted = formatIssues(issues);
    expect(formatted.startsWith('tests.0: bad; tests.1: bad')).toBe(true);
    expect(formatted.split('; ')).toHaveLength(10);
  });

  it('labels a root-level issue', () => {
    expect(formatIssues([{ path: [], message: 'expected object' }])).toBe('(root): expected object');
  });
});

describe('parseAndValidate', () => {
  const schema = z.object({ answer: z.string(), rules: z.array(z.string()) });

  it('returns typed data on a match', () => {
    const result = parseAndValidate('{"answer":"ok","rules":["R-101"]}', schema);
    expect(result).toEqual({ answer: 'ok', rules: ['R-101'] });
  });

  it('throws SchemaValidationError carrying model-readable issues', () => {
    try {
      parseAndValidate('{"answer":"ok"}', schema);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      expect((err as SchemaValidationError).issues).toContain('rules');
    }
  });

  it('rejects a valid-JSON non-object payload', () => {
    expect(() => parseAndValidate('[1,2,3]', schema)).toThrow(JsonExtractionError);
  });
});
