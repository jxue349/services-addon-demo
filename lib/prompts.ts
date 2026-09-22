import type { Scenario, TestCase } from './schemas';

/**
 * Compiler prompts.
 *
 * Every prompt carries the *full current spec as edited in the UI* — not the
 * committed version — because the demo loop is "edit a rule, recompile, watch
 * the outputs change". Every prompt also repeats the two hard rules: cite
 * R-xxx IDs, and never invent behavior the spec does not define.
 */

const SHARED_RULES = [
  'Hard requirements:',
  '- Cite the specific rule IDs (e.g. "R-102") that justify each conclusion.',
  '- Do not invent rules or behavior. If the spec is silent on something, name it as a',
  '  spec gap in the appropriate field instead of filling it in from general knowledge',
  '  of how subscriptions usually work.',
  '- Quote rule IDs exactly as they appear in the spec.',
].join('\n');

function withSpec(spec: string, task: string): string {
  return [
    'Here is the complete current Product Behavior Specification. It is the single',
    'source of truth; nothing outside it is authoritative.',
    '',
    '<spec>',
    spec,
    '</spec>',
    '',
    SHARED_RULES,
    '',
    task,
  ].join('\n');
}

export function explorerScenarioPrompt(spec: string, scenario: Scenario): string {
  const devices = scenario.devices
    .map((d, i) => `  ${i + 1}. device "${d.name}" with device-level subscription: ${d.subscription}`)
    .join('\n');

  return withSpec(
    spec,
    [
      'Task: resolve the effective entitlement for this account scenario.',
      '',
      `Account-level subscription: ${scenario.account}`,
      scenario.devices.length > 0 ? `Devices:\n${devices}` : 'Devices: (none)',
      '',
      'For each device, decide which entitlement is actually in effect after applying',
      'account-level coverage, overlap precedence, and channel rules. Explain the',
      'resolution in "why", and list the rule IDs you applied.',
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "accountSummary": "one or two sentences on what the account itself entitles",',
      '  "devices": [',
      '    { "name": "...", "effectiveEntitlement": "...", "why": "...", "rules": ["R-101"] }',
      '  ],',
      '  "notes": "billing consequences, warnings, and any spec gaps this scenario exposes"',
      '}',
    ].join('\n'),
  );
}

export function explorerWhatIfPrompt(spec: string, question: string): string {
  return withSpec(
    spec,
    [
      'Task: answer a what-if question about the specified behavior.',
      '',
      '<question>',
      question,
      '</question>',
      '',
      'Answer only from the spec. If the spec does not determine the answer, say so in',
      '"answer" and describe the missing rule in "specGap".',
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "answer": "the answer, grounded in the spec",',
      '  "rules": ["R-201"],',
      '  "specGap": "what the spec fails to define, or null if it fully determines the answer"',
      '}',
    ].join('\n'),
  );
}

export function testMatrixPrompt(spec: string): string {
  return withSpec(
    spec,
    [
      'Task: compile a QA test matrix from the spec.',
      '',
      'Produce 15 to 25 test cases. Prioritise behavior that the spec\'s "Prototype',
      'coverage" section does NOT list — those are the behaviors nobody has seen',
      'demonstrated, so they carry the most QA risk. Set "inPrototype" to true only when',
      'a flow listed under "Prototype coverage" would actually exercise the test.',
      '',
      'Priorities: P1 = entitlement or billing correctness, or money movement.',
      'P2 = lifecycle and cross-channel edges. P3 = navigation, copy, and deep links.',
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "tests": [',
      '    {',
      '      "id": "T-01",',
      '      "scenario": "the setup and action under test",',
      '      "expected": "the observable expected result",',
      '      "priority": "P1",',
      '      "rules": ["R-302"],',
      '      "inPrototype": false',
      '    }',
      '  ]',
      '}',
    ].join('\n'),
  );
}

export function stateMachinePrompt(spec: string): string {
  return withSpec(
    spec,
    [
      'Task: compile the subscription lifecycle state machine defined by the spec.',
      '',
      'Use the lifecycle states the spec names. Add a transition only where a rule or an',
      'explicitly described behavior supports it. Where the spec leaves a transition',
      'undefined (for example an exit from a state with no described path out), keep the',
      'transition out and record the gap in the "note" of a related transition.',
      '',
      'Keep state names short (1-3 words) and use them consistently between "states" and',
      'the "from"/"to" fields.',
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "states": ["Active", "Expired"],',
      '  "transitions": [',
      '    { "from": "Active", "to": "Cancelled pending expiry", "event": "user cancels",',
      '      "rules": ["R-301"], "note": "entitlement persists to period end" }',
      '  ]',
      '}',
    ].join('\n'),
  );
}

export function consistencyPrompt(spec: string, testMatrix?: TestCase[]): string {
  const qaSection =
    testMatrix && testMatrix.length > 0
      ? [
          'A QA test matrix has been compiled this session. Use it to judge QA coverage:',
          'a rule is QA-covered if at least one test asserts the behavior that rule defines.',
          '',
          '<test-matrix>',
          JSON.stringify(
            testMatrix.map((t) => ({ id: t.id, scenario: t.scenario, expected: t.expected, rules: t.rules })),
          ),
          '</test-matrix>',
        ].join('\n')
      : [
          'No QA test matrix was provided. Set "qa" to "unknown" for every rule — do not',
          'guess at QA coverage.',
        ].join('\n');

  return withSpec(
    spec,
    [
      'Task: check the spec against the prototype and against QA coverage.',
      '',
      'Emit one finding for EVERY rule ID (R-xxx) that appears in the spec. Do not skip',
      'rules and do not merge rules into a single finding.',
      '',
      'Prototype coverage judgement — be strict:',
      '- "covered": a flow listed under "Prototype coverage" would actually exercise this',
      '  rule end to end.',
      '- "partial": a listed flow touches the rule\'s surface but would not demonstrate the',
      '  behavior the rule specifies.',
      '- "missing": no listed flow exercises the rule at all.',
      'A rule about a state nobody can reach in the prototype is "missing", not "covered",',
      'even if the screen it would appear on exists.',
      '',
      qaSection,
      '',
      'Return exactly this JSON shape:',
      '{',
      '  "findings": [',
      '    { "rule": "R-302", "summary": "what the rule requires", "prototype": "missing",',
      '      "qa": "unknown", "note": "why, and what it would take to cover it" }',
      '  ],',
      '  "headline": "the single most important thing this check surfaced"',
      '}',
    ].join('\n'),
  );
}
