import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

// Runs after every `npx playwright test` (see playwright.config.ts) and collects the run's evidence
// into qa-evidence/<run-id>/:
//   report.md     — overall summary, per-suite breakdown, every test with status + reason failed
//   bugs.md       — one bug entry per failed test (steps, expected vs actual, screenshot, trace)
//   results.csv   — same rows as report.md, for Excel / test-management import
//   screenshots/  — final screenshot of every test (passed ones too, as proof)
//   traces/       — Playwright trace of every test (`npx playwright show-trace <zip>`)
//   error-context/— Playwright's page snapshot + source excerpt for each failure
// Everything is copied out of test-results/, which Playwright wipes at the start of the next run.

// Spec file -> generated test case doc, so bug entries can quote the documented steps/expected result.
const TESTCASE_DIR = path.join(__dirname, '../../gen-ai/testcases/lc');
const SPEC_TO_TESTCASES: Record<string, string> = {
  'create-order.spec.ts': 'lc-create-order-testcases.md',
  'create-product-sf-search.spec.ts': 'lc-pim-product-creation-sf-search-testcases.md',
  'create-wishlist.spec.ts': 'lc-storefront-create-wishlist-testcases.md',
  'purchase-flow.spec.ts': 'lc-storefront-purchase-flow-testcases.md',
  'registration.spec.ts': 'lc-storefront-registration-testcases.md',
  'filter-plp.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'plp-pdp-journey.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'price.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'search-plp.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'sort-plp.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'stock.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'suggested-products.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'view-pdp.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
  'view-plp.spec.ts': 'lc-storefront-plp-pdp-testcases.md',
};

type Status = 'Passed' | 'Failed' | 'Flaky' | 'Skipped' | 'Not run';
const STATUS_ICON: Record<Status, string> = {
  Passed: '✅ Passed',
  Failed: '❌ Failed',
  Flaky: '⚠️ Flaky',
  Skipped: '⏭️ Skipped',
  'Not run': '⛔ Not run',
};

interface DocCase {
  scenario: string;
  steps: string;
  expected: string;
}

interface Failure {
  category: string;
  reason: string;
  suspected: string;
  expected?: string;
  actual?: string;
  errorText: string;
}

interface Row {
  no: number;
  suite: string;
  spec: string;
  location: string;
  describe: string;
  title: string;
  tcIds: string[];
  status: Status;
  durationMs: number;
  retries: number;
  failure?: Failure;
  skipReason?: string;
  steps: { title: string; failed: boolean }[];
  screenshot?: string;
  trace?: string;
  errorContext?: string;
  bugId?: string;
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const secs = (ms: number) => (ms / 1000).toFixed(1);

function runId(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

class QaEvidenceReporter implements Reporter {
  private rootSuite!: Suite;
  private config!: FullConfig;
  private startTime = new Date();
  private outDir: string;
  private runName = '';
  private sourceCache = new Map<string, string[]>();
  private docCache = new Map<string, Map<string, DocCase>>();

  constructor(options: { outputDir?: string } = {}) {
    this.outDir = options.outputDir ?? 'qa-evidence';
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.rootSuite = suite;
    this.startTime = new Date();
  }

  async onEnd(result: FullResult): Promise<void> {
    const baseDir = path.resolve(path.dirname(this.config.configFile ?? process.cwd()), this.outDir);
    this.runName = runId(this.startTime);
    const runDir = path.join(baseDir, this.runName);
    for (const sub of ['screenshots', 'traces', 'error-context']) fs.mkdirSync(path.join(runDir, sub), { recursive: true });

    const rows = this.rootSuite.allTests().map((test, i) => this.buildRow(test, i + 1, runDir));
    let bugNo = 0;
    for (const row of rows) if (row.status === 'Failed') row.bugId = `BUG-${pad(++bugNo)}`;

    fs.writeFileSync(path.join(runDir, 'report.md'), this.renderReport(rows, result));
    fs.writeFileSync(path.join(runDir, 'bugs.md'), this.renderBugs(rows));
    fs.writeFileSync(path.join(runDir, 'results.csv'), this.renderCsv(rows));

    console.log(`\nQA evidence: ${runDir}`);
  }

  // ---------- data collection ----------

  private buildRow(test: TestCase, no: number, runDir: string): Row {
    const file = test.location.file;
    const spec = path.basename(file);
    const project = test.parent.project()?.name ?? '';
    const describe = test
      .titlePath()
      .slice(3, -1) // ['', project, file, ...describes, title]
      .join(' › ');
    const results = test.results;
    const last: TestResult | undefined = results[results.length - 1];

    const row: Row = {
      no,
      suite: project === 'setup' ? 'Setup (auth)' : spec.replace(/\.(spec|setup)\.ts$/, ''),
      spec,
      location: `${path.relative(path.dirname(this.config.configFile ?? ''), file).replace(/\\/g, '/')}:${test.location.line}`,
      describe,
      title: test.title,
      tcIds: this.findTcIds(file, test.location.line),
      status: this.statusOf(test),
      durationMs: results.reduce((sum, r) => sum + r.duration, 0),
      retries: Math.max(0, results.length - 1),
      steps: last ? this.collectSteps(last.steps) : [],
    };

    if (row.status === 'Skipped') {
      row.skipReason = test.annotations.find((a) => a.type === 'skip' || a.type === 'fixme')?.description ?? 'Marked as skipped';
    } else if (row.status === 'Not run') {
      row.skipReason = 'Not executed — a dependency (e.g. the auth setup) failed or the run was interrupted';
    }

    if (!last) return row;

    const base = `${pad(no)}-${slug(`${row.suite}-${row.title}`)}`;
    const copy = (name: string, sub: string, ext: string): string | undefined => {
      const att = [...last.attachments].reverse().find((a) => a.name === name && a.path && fs.existsSync(a.path));
      if (!att?.path) return undefined;
      const rel = `${sub}/${base}${ext}`;
      fs.copyFileSync(att.path, path.join(runDir, rel));
      return rel;
    };
    row.screenshot = copy('screenshot', 'screenshots', '.png');
    row.trace = copy('trace', 'traces', '.zip');
    row.errorContext = copy('error-context', 'error-context', '.md');

    if (row.status === 'Failed' || row.status === 'Flaky') {
      const failed = row.status === 'Failed' ? last : results.find((r) => r.status !== 'passed');
      if (failed) row.failure = this.analyzeFailure(failed, row.errorContext ? path.join(runDir, row.errorContext) : undefined);
    }
    return row;
  }

  private statusOf(test: TestCase): Status {
    switch (test.outcome()) {
      case 'expected':
        return 'Passed';
      case 'flaky':
        return 'Flaky';
      case 'unexpected':
        return 'Failed';
      default:
        return test.results.length === 0 || test.results.every((r) => r.status === 'skipped') ?
            test.annotations.some((a) => a.type === 'skip' || a.type === 'fixme') ? 'Skipped' : 'Not run'
          : 'Skipped';
    }
  }

  // Test case IDs live in the comment block directly above each test(...) call, e.g. `// TC-HAPPY-048`.
  private findTcIds(file: string, line: number): string[] {
    let lines = this.sourceCache.get(file);
    if (!lines) {
      lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
      this.sourceCache.set(file, lines);
    }
    const ids: string[] = [];
    for (let i = line - 2; i >= 0 && lines[i].trim().startsWith('//'); i--) {
      ids.unshift(...(lines[i].match(/TC-[A-Z]+-\d+/g) ?? []));
    }
    return [...new Set(ids)];
  }

  private docCasesFor(spec: string): Map<string, DocCase> {
    const docFile = SPEC_TO_TESTCASES[spec];
    if (!docFile) return new Map();
    let cases = this.docCache.get(docFile);
    if (cases) return cases;
    cases = new Map();
    const docPath = path.join(TESTCASE_DIR, docFile);
    if (fs.existsSync(docPath)) {
      for (const line of fs.readFileSync(docPath, 'utf8').split(/\r?\n/)) {
        if (!line.startsWith('| TC-')) continue;
        // | ID | Scenario | Precondition(s) | Test Steps | Expected Result | ...
        const cols = line.split('|').map((c) => c.trim());
        cases.set(cols[1], { scenario: cols[2], steps: cols[4], expected: cols[5] });
      }
    }
    this.docCache.set(docFile, cases);
    return cases;
  }

  // Top-level actions/assertions/test.step()s, i.e. what the test actually did, in order.
  private collectSteps(steps: TestStep[]): { title: string; failed: boolean }[] {
    return steps
      .filter((s) => s.category === 'test.step' || s.category === 'pw:api' || s.category === 'expect')
      .map((s) => ({ title: s.title, failed: !!s.error }));
  }

  private analyzeFailure(result: TestResult, errorContextPath?: string): Failure {
    const errorText = stripAnsi(result.errors.map((e) => e.message ?? e.value ?? '').join('\n\n')).trim();
    const context = errorContextPath && fs.existsSync(errorContextPath) ? fs.readFileSync(errorContextPath, 'utf8') : '';
    const firstLine = errorText.split('\n').find((l) => l.trim()) ?? `Test ${result.status}`;
    const expected = errorText.match(/^\s*Expected(?: \w+)?:\s*(.+)$/m)?.[1]?.trim();
    const received = errorText.match(/^\s*Received(?: \w+)?:\s*(.+)$/m)?.[1]?.trim();
    const waitingFor = errorText.match(/waiting for (.+)$/m)?.[1]?.trim();
    const locator = errorText.match(/^Locator:\s*(.+)$/m)?.[1]?.trim() ?? waitingFor;

    if (/cloudflareaccess|Log in to Internal Development Environment/i.test(context) || /storage state/i.test(errorText)) {
      return {
        category: 'Environment',
        reason: 'Cloudflare Access session missing/expired — run `npm run save-cf-auth`',
        suspected: 'Environment / auth — not a product bug',
        errorText,
      };
    }
    if (/net::ERR_|NS_ERROR|ECONNRESET|ERR_ABORTED/.test(errorText)) {
      return {
        category: 'Navigation / network',
        reason: `Navigation failed: ${errorText.match(/net::\S+|NS_ERROR\S*|ECONNRESET/)?.[0] ?? firstLine}`,
        suspected: 'Environment instability or app crash on load — re-run to confirm',
        errorText,
      };
    }
    // An assertion whose target never appeared is a missing element, not a wrong value.
    if (/element\(s\) not found/.test(errorText)) {
      return {
        category: 'Timeout / element not found',
        reason: `Element not found: ${locator ?? '?'}${expected ? ` (expected ${expected})` : ''}`,
        suspected: 'UI changed (locator outdated), test data missing, or feature broken — check the screenshot',
        expected,
        errorText,
      };
    }
    if (/expect\(/.test(errorText) || expected !== undefined) {
      const matcher = errorText.match(/\.(to\w+)\(/)?.[1] ?? 'assertion';
      return {
        category: 'Assertion mismatch',
        reason:
          expected !== undefined || received !== undefined ?
            `${matcher} failed — expected ${expected ?? '?'}, got ${received ?? '?'}`
          : `${matcher} failed${waitingFor ? ` on ${waitingFor}` : ''}`,
        suspected: 'Possible product bug — verify against the requirement',
        expected,
        actual: received,
        errorText,
      };
    }
    if (/timeout/i.test(errorText)) {
      return {
        category: 'Timeout / element not found',
        reason: waitingFor ? `Timed out waiting for ${waitingFor}` : firstLine,
        suspected: 'UI changed (locator outdated) or feature broken — check the screenshot',
        errorText,
      };
    }
    return { category: 'Other', reason: firstLine, suspected: 'Needs investigation', errorText };
  }

  // ---------- rendering ----------

  private renderReport(rows: Row[], result: FullResult): string {
    const count = (s: Status) => rows.filter((r) => r.status === s).length;
    const executed = rows.length - count('Skipped') - count('Not run');
    const passRate = executed ? ((100 * (count('Passed') + count('Flaky'))) / executed).toFixed(1) : '0.0';
    let commit = 'n/a';
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {}

    const out: string[] = [];
    out.push('# Test Execution Report', '');
    out.push(`**Run**: ${this.startTime.toLocaleString()}  `);
    out.push(`**Duration**: ${secs(result.duration)}s  `);
    out.push(`**Overall result**: ${result.status === 'passed' ? '✅ PASSED' : `❌ ${result.status.toUpperCase()}`}  `);
    out.push(`**Environment**: https://lc-uat.digicommerce.cloud  `);
    out.push(`**Projects**: ${this.config.projects.map((p) => p.name).join(', ')}  `);
    out.push(`**Commit**: ${commit}`, '');

    out.push('## 1. Summary', '');
    out.push('| Total | ✅ Passed | ❌ Failed | ⚠️ Flaky | ⏭️ Skipped | ⛔ Not run | Pass rate |', '|---|---|---|---|---|---|---|');
    out.push(`| ${rows.length} | ${count('Passed')} | ${count('Failed')} | ${count('Flaky')} | ${count('Skipped')} | ${count('Not run')} | ${passRate}% |`, '');
    out.push('_Pass rate = (passed + flaky) / executed tests (skipped / not run excluded)._', '');

    out.push('## 2. By suite', '');
    out.push('| Suite | Total | Passed | Failed | Flaky | Skipped | Not run |', '|---|---|---|---|---|---|---|');
    for (const suite of [...new Set(rows.map((r) => r.suite))]) {
      const s = rows.filter((r) => r.suite === suite);
      const c = (st: Status) => s.filter((r) => r.status === st).length;
      out.push(`| ${suite} | ${s.length} | ${c('Passed')} | ${c('Failed')} | ${c('Flaky')} | ${c('Skipped')} | ${c('Not run')} |`);
    }
    out.push('');

    const failed = rows.filter((r) => r.status === 'Failed' || r.status === 'Flaky');
    out.push('## 3. Failures', '');
    if (!failed.length) out.push('No failures. 🎉', '');
    else {
      const byCat = new Map<string, number>();
      for (const r of failed) byCat.set(r.failure?.category ?? 'Other', (byCat.get(r.failure?.category ?? 'Other') ?? 0) + 1);
      out.push('| Category | Count |', '|---|---|');
      for (const [cat, n] of byCat) out.push(`| ${cat} | ${n} |`);
      out.push('');
      out.push('| Bug | Suite | TC ID | Test | Reason failed |', '|---|---|---|---|---|');
      for (const r of failed) {
        const bug = r.bugId ? `[${r.bugId}](bugs.md#${r.bugId.toLowerCase()})` : 'Flaky';
        out.push(`| ${bug} | ${r.suite} | ${r.tcIds.join(', ') || '—'} | ${cell(r.title)} | ${cell(r.failure?.reason ?? '')} |`);
      }
      out.push('');
    }

    out.push('## 4. All results', '');
    out.push('| # | Suite | TC ID | Test | Status | Duration | Reason failed / skipped | Evidence |', '|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const reason = r.failure?.reason ?? r.skipReason ?? '';
      const evidence = [r.screenshot && `[screenshot](${r.screenshot})`, r.trace && `[trace](${r.trace})`, r.bugId && `[${r.bugId}](bugs.md#${r.bugId.toLowerCase()})`]
        .filter(Boolean)
        .join(' · ');
      out.push(
        `| ${r.no} | ${r.suite} | ${r.tcIds.join(', ') || '—'} | ${cell(r.title)} | ${STATUS_ICON[r.status]}${r.retries ? ` (${r.retries} retr${r.retries > 1 ? 'ies' : 'y'})` : ''} | ${secs(r.durationMs)}s | ${cell(reason)} | ${evidence} |`,
      );
    }
    out.push('');
    out.push('---', '');
    out.push('Open a trace: `npx playwright show-trace <path-to-zip>` or drag the zip onto https://trace.playwright.dev.', '');
    return out.join('\n');
  }

  private renderBugs(rows: Row[]): string {
    const bugs = rows.filter((r) => r.bugId);
    const out: string[] = ['# Bug Reports', '', `**Run**: ${this.startTime.toLocaleString()} · **Failed tests**: ${bugs.length}`, ''];
    out.push('> Auto-generated from failed automated tests. "Suspected cause" is a heuristic — QA must confirm whether each entry is a product bug, a test-script issue, or an environment problem before logging it.', '');
    if (!bugs.length) out.push('No failed tests in this run.');

    for (const r of bugs) {
      const f = r.failure!;
      const docCases = this.docCasesFor(r.spec);
      const docs = r.tcIds.map((id) => [id, docCases.get(id)] as const).filter((d): d is [string, DocCase] => !!d[1]);

      out.push(`## ${r.bugId}`, '');
      out.push(`**${r.title}**`, '');
      out.push('| Field | Value |', '|---|---|');
      out.push(`| Suite | ${r.suite}${r.describe ? ` › ${cell(r.describe)}` : ''} |`);
      out.push(`| Spec | \`${r.location}\` |`);
      out.push(`| Test case(s) | ${r.tcIds.join(', ') || '—'} |`);
      if (docs.length) out.push(`| Scenario | ${docs.map(([id, d]) => `**${id}**: ${cell(d.scenario)}`).join('<br>')} |`);
      out.push(`| Status | ❌ Failed${r.retries ? ` (after ${r.retries} retr${r.retries > 1 ? 'ies' : 'y'})` : ''} |`);
      out.push(`| Failure category | ${f.category} |`);
      out.push(`| Suspected cause | ${f.suspected} |`);
      out.push(`| Reason failed | ${cell(f.reason)} |`);
      out.push('');

      out.push('### Steps to reproduce', '');
      if (docs.length) {
        for (const [id, d] of docs) out.push(`**${id}** (from test case doc):`, '', d.steps.replace(/<br>/g, '\n'), '');
      }
      if (r.steps.length) {
        const shown = r.steps.slice(-30);
        out.push('<details><summary>Actions executed by the automated test</summary>', '');
        if (r.steps.length > shown.length) out.push(`_…${r.steps.length - shown.length} earlier steps omitted_`, '');
        shown.forEach((s, i) => out.push(`${i + 1}. ${s.failed ? '❌ ' : ''}${s.title.replace(/\r?\n/g, ' ')}`));
        out.push('', '</details>', '');
      }

      out.push('### Expected result', '');
      if (docs.length) for (const [id, d] of docs) out.push(`- **${id}**: ${d.expected.replace(/<br>/g, ' ')}`);
      if (f.expected) out.push(`- Assertion expected: \`${f.expected}\``);
      if (!docs.length && !f.expected) out.push('- See test title / spec.');
      out.push('');

      out.push('### Actual result', '');
      if (f.actual) out.push(`- Received: \`${f.actual}\``);
      out.push(`- ${f.reason}`, '');
      out.push('<details><summary>Error details</summary>', '', '```', f.errorText.slice(0, 3000), '```', '', '</details>', '');

      out.push('### Evidence', '');
      if (r.screenshot) out.push(`![${r.bugId} screenshot](${r.screenshot})`, '');
      if (r.trace) out.push(`- Trace: [${r.trace}](${r.trace}) — \`npx playwright show-trace ${this.outDir}/${this.runName}/${r.trace}\``);
      if (r.errorContext) out.push(`- Page snapshot at failure: [${r.errorContext}](${r.errorContext})`);
      out.push('', '---', '');
    }
    return out.join('\n');
  }

  private renderCsv(rows: Row[]): string {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['No', 'Suite', 'Spec', 'TC ID', 'Test', 'Status', 'Duration (s)', 'Retries', 'Reason failed / skipped', 'Failure category', 'Suspected cause', 'Bug ID', 'Screenshot', 'Trace'];
    const lines = rows.map((r) =>
      [
        r.no,
        r.suite,
        r.location,
        r.tcIds.join(', '),
        r.title,
        r.status,
        secs(r.durationMs),
        r.retries,
        r.failure?.reason ?? r.skipReason ?? '',
        r.failure?.category ?? '',
        r.failure?.suspected ?? '',
        r.bugId ?? '',
        r.screenshot ?? '',
        r.trace ?? '',
      ]
        .map(esc)
        .join(','),
    );
    // BOM so Excel opens it as UTF-8.
    return '﻿' + [header.map(esc).join(','), ...lines].join('\r\n') + '\r\n';
  }
}

export default QaEvidenceReporter;
