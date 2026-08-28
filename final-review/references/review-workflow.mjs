export const meta = {
  name: 'example-final-review',
  description: 'Bug + security review of an ops toolkit and its command-allowlist patch, with adversarial verification',
  phases: [
    { title: 'Review', detail: 'read each file group through a bug/security lens' },
    { title: 'Verify', detail: 'adversarially refute each finding against the real code' },
  ],
}

const CONTEXT = [
  'THREAT MODEL - judge severity against these real stakes:',
  '1. The buzz-acp patch (crates/buzz-acp/src/acp.rs, functions approved_command_prefixes,',
  '   split_shell_stages, strip_command_wrappers, stage_is_approved, command_is_approved,',
  '   permission_approval_response, and the handle_permission_request wiring) is the ONLY',
  '   barrier stopping an autonomous agent - reachable by ANYONE in a shared relay channel -',
  '   from running arbitrary shell on the host. A command APPROVED but should not be = RCE.',
  '   A legit command wrongly DENIED = availability bug.',
  '2. Scripts handle secp256k1 PRIVATE KEYS (owner.key, oruga.key, agents/*.env) and sign',
  '   NIP-98 / NIP-OA. A key leaked to argv, logs, a world-readable file, or the public repo,',
  '   or a signing flaw, is identity compromise.',
  '3. <PUBLIC_REPO_ROOT> is a PUBLIC GitHub repo synced from <OPS_ROOT> via',
  '   sync-from-ops.sh; any secret that reaches it is public forever.',
  'Read the ACTUAL code with Read/Grep before claiming anything. Do not report from a grep',
  'pattern alone. Precision over volume: a false positive wastes more than a miss.',
].join('\n')

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    group: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' },
          description: { type: 'string' },
          failure_scenario: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'line', 'severity', 'category', 'description', 'failure_scenario', 'fix'],
      },
    },
  },
  required: ['group', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'FALSE_POSITIVE', 'NEEDS_CONTEXT'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    adjusted_severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'adjusted_severity', 'reasoning'],
}

const GROUPS = [
  {
    key: 'patch-bypass',
    lens: [
      'SECURITY, highest stakes. Only review the ALLOWLIST code added to this file.',
      'Your single job: find an input string that command_is_approved() returns true for, but that',
      'executes something outside the intended allowlist (a privilege-escalation / RCE bypass).',
      'Think hard about: pipeline/redirection splitting vs quoting; the timeout unwrapper',
      '(strip_command_wrappers) - can a crafted wrapper hide a forbidden command?; multi-word prefix',
      'matching; basename comparison (can /evil/buzz or a path trick match buzz?); command',
      'substitution with dollar-paren and backticks (are they treated as one stage?); newlines;',
      'env-var assignments prefixing a command; unusual whitespace. For each candidate, give the',
      'exact input string and why it slips through.',
    ].join(' '),
    files: ['<REPO_ROOT>/crates/buzz-acp/src/acp.rs'],
    hint: 'grep -n for the added fns (split_shell_stages, strip_command_wrappers, stage_is_approved, command_is_approved, approved_command_prefixes, permission_approval_response) then Read that region fully.',
  },
  {
    key: 'patch-correctness',
    lens: [
      'CORRECTNESS of the same allowlist code. Not bypass - plain bugs: panics or index-out-of-range',
      'in the char-scanning loop, wrong handling of empty input, unbalanced quotes, backslash escapes,',
      'the OnceLock env parse, and cases where a LEGITIMATE command the operator clearly intended to',
      'allow is wrongly DENIED (availability). Confirm the unit tests actually cover what they claim.',
    ].join(' '),
    files: ['<REPO_ROOT>/crates/buzz-acp/src/acp.rs'],
    hint: 'Read the added functions and the cfg(test) mod approve_tools_tests block.',
  },
  {
    key: 'keys-and-signing',
    lens: [
      'SECRET HANDLING plus crypto correctness. For every file: does a private key or full auth-tag',
      'ever reach argv (visible in ps), a log line, a world-readable path, or stdout that a guide tells',
      'the user to paste somewhere unsafe? Is BUZZ_PRIVATE_KEY passed via env (ok) vs argv (leak)? Are',
      'files chmod 600 before the secret is written (TOCTOU)? Is the NIP-98 / NIP-OA signing correct',
      '(payload hash, u-tag, created_at, nonce)? Does any user/agent-controlled value flow into a shell',
      'without quoting (command injection)?',
    ].join(' '),
    files: [
      '<OPS_ROOT>/mint-invite.mjs',
      '<OPS_ROOT>/new-agent.mjs',
      '<OPS_ROOT>/attest.mjs',
      '<OPS_ROOT>/rename-agent.mjs',
      '<OPS_ROOT>/bz',
      '<OPS_ROOT>/attest.sh',
      '<OPS_ROOT>/handoff.sh',
      '<OPS_ROOT>/bootstrap-agent.sh',
    ],
  },
  {
    key: 'shell-infra',
    lens: [
      'SHELL SAFETY of infra scripts. Look for: unquoted expansions, word-splitting, sed with',
      'user data, the tunnel hostname rewrite into .env (can a malicious tunnel hostname inject?), the',
      'Postgres UPDATE in setup-named-tunnel.sh (SQL or shell injection via hostname), missing',
      'set -euo pipefail, race conditions, and any eval. Also plain bugs that break the operator flow.',
    ].join(' '),
    files: [
      '<OPS_ROOT>/buzz-tunnel.sh',
      '<OPS_ROOT>/setup-named-tunnel.sh',
      '<OPS_ROOT>/agent-harness.sh',
      '<OPS_ROOT>/build-desktop.sh',
      '<OPS_ROOT>/status.sh',
      '<OPS_ROOT>/invite.sh',
      '<OPS_ROOT>/launch-buzz.sh',
      '<OPS_ROOT>/gen-laptop-guide.mjs',
    ],
  },
  {
    key: 'repo-hygiene',
    lens: [
      'Does the PUBLIC-repo pipeline actually stop secrets from leaking? Read scan-secrets.sh',
      '(detection gaps - does it only check known vault values and miss a newly added secret file',
      'type?), sync-from-ops.sh (does it copy anything secret; is the PUBLIC=1 guide regeneration',
      'airtight; order of scan vs commit), gen-laptop-guide.mjs PUBLIC branch (is the redaction',
      'complete or can a real key survive), wikilinks-to-md.mjs, wiki-lint.mjs, and the .gitignore.',
      'A miss here is a permanently public private key.',
    ].join(' '),
    files: [
      '<PUBLIC_REPO_ROOT>/scripts/scan-secrets.sh',
      '<PUBLIC_REPO_ROOT>/scripts/sync-from-ops.sh',
      '<OPS_ROOT>/gen-laptop-guide.mjs',
      '<PUBLIC_REPO_ROOT>/scripts/wikilinks-to-md.mjs',
      '<OPS_ROOT>/wiki-lint.mjs',
      '<PUBLIC_REPO_ROOT>/.gitignore',
    ],
  },
]

function reviewPrompt(g) {
  return CONTEXT +
    '\n\nYou are reviewing file group "' + g.key + '".\nLens: ' + g.lens +
    '\n\nFiles to Read fully:\n' + g.files.map(function (f) { return '  ' + f }).join('\n') +
    (g.hint ? '\n\nHint: ' + g.hint : '') +
    '\n\nReturn every distinct finding. An empty findings array is a valid, honest answer if the code is clean. ' +
    'For each finding give a CONCRETE failure_scenario (exact input/state -> wrong or unsafe outcome), not a generality. ' +
    'Set group to "' + g.key + '".'
}

function verifyPrompt(f) {
  return CONTEXT +
    '\n\nADVERSARIAL VERIFICATION. A reviewer filed this finding:\n' +
    '  title: ' + f.title + '\n' +
    '  file: ' + f.file + ':' + f.line + '\n' +
    '  severity: ' + f.severity + '\n' +
    '  category: ' + f.category + '\n' +
    '  description: ' + f.description + '\n' +
    '  claimed failure: ' + f.failure_scenario + '\n\n' +
    'Open ' + f.file + ', Read the real code around line ' + f.line + ' and its callers/callees. Try to REFUTE the finding. ' +
    'For a security claim, either produce the concrete exploit input that works, or show what blocks it. ' +
    'For a bug claim, either produce the concrete failing input, or show why it cannot occur. ' +
    'Default to FALSE_POSITIVE if you cannot demonstrate the defect is real and reachable. ' +
    'Set adjusted_severity to what the evidence supports (or "none" if false positive).'
}

const results = await pipeline(
  GROUPS,
  function (g) {
    return agent(reviewPrompt(g), { label: 'review:' + g.key, phase: 'Review', schema: FINDINGS_SCHEMA, effort: 'high' })
  },
  function (review, g) {
    if (!review || !review.findings || review.findings.length === 0) {
      return { group: g.key, confirmed: [] }
    }
    return parallel(review.findings.map(function (f) {
      return function () {
        return agent(verifyPrompt(f), { label: 'verify:' + g.key, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' })
          .then(function (v) { return Object.assign({}, f, { group: g.key, verdict: v }) })
      }
    })).then(function (arr) {
      return { group: g.key, confirmed: arr.filter(Boolean) }
    })
  },
)

const all = results.filter(Boolean).flatMap(function (r) { return r.confirmed || [] })
const confirmed = all.filter(function (f) { return f.verdict && f.verdict.verdict === 'CONFIRMED' })
const disputed = all.filter(function (f) { return !f.verdict || f.verdict.verdict !== 'CONFIRMED' })

const rank = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
confirmed.sort(function (a, b) { return rank[a.verdict.adjusted_severity] - rank[b.verdict.adjusted_severity] })

log('review complete: ' + confirmed.length + ' confirmed, ' + disputed.length + ' disputed/false-positive')

return {
  confirmed: confirmed.map(function (f) {
    return {
      group: f.group, title: f.title, file: f.file, line: f.line,
      severity: f.verdict.adjusted_severity, original_severity: f.severity,
      category: f.category, description: f.description,
      failure_scenario: f.failure_scenario, fix: f.fix,
      confidence: f.verdict.confidence, verifier_reasoning: f.verdict.reasoning,
    }
  }),
  disputed: disputed.map(function (f) {
    return {
      group: f.group, title: f.title, file: f.file, line: f.line,
      claimed_severity: f.severity,
      verdict: f.verdict ? f.verdict.verdict : 'NO_VERDICT',
      reasoning: f.verdict ? f.verdict.reasoning : 'verifier did not return',
    }
  }),
}
