// Minimal test runner: node test/run.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lint = path.join(root, 'scripts', 'slop-lint.mjs');
const fx = f => path.join(root, 'test', 'fixtures', f);

function run(file, min = 'low') {
  const r = spawnSync(process.execPath, [lint, file, '--json', `--min=${min}`], { encoding: 'utf8' });
  return { code: r.status, findings: JSON.parse(r.stdout || '[]') };
}
const rules = fs => new Set(fs.map(f => f.rule));

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failed++;
}

{
  const { code, findings } = run(fx('clean.md'));
  check('clean.md: no findings, exit 0', code === 0 && findings.length === 0);
}
{
  const { findings } = run(fx('false-positives.md'), 'med');
  check(`false-positives.md: no med+ findings (got ${findings.map(f => f.rule).join(',') || 'none'})`, findings.length === 0);
}
{
  const r = rules(run(fx('sloppy.md')).findings);
  for (const id of ['chatbot-leakage', 'generation-artifact', 'puffery', 'participle-tail', 'negative-parallelism',
    'vague-attribution', 'formulaic-closer', 'hedging-disclaimer', 'ai-vocab-density', 'em-dash-density',
    'emoji-bullet', 'inline-header-list', 'title-case-headings']) check(`sloppy.md: ${id}`, r.has(id));
}
{
  const { findings } = run(fx('sloppy.tsx'));
  const r = rules(findings);
  for (const id of ['gradient-text', 'purple-gradient', 'glow-blob', 'eyebrow-label', 'serif-hero-font', 'neon-palette',
    'em-dash-label', 'emoji-ui', 'decorative-numbering', 'side-tab-accent', 'status-dot', 'unsourced-stats',
    'fake-testimonials', 'identical-cards']) check(`sloppy.tsx: ${id}`, r.has(id));
  check('sloppy.tsx: attribution dashes not flagged as em-dash-label',
    findings.filter(f => f.rule === 'em-dash-label').length === 1);
  check('sloppy.tsx: code identifiers not linted as prose ("steps"/"Unlock" array ignored)',
    !findings.some(f => f.rule === 'ai-vocab' && f.line === 2));
}
{
  const { findings } = run(fx('sloppy.css'));
  check('sloppy.css: one gradient-text per block', findings.filter(f => f.rule === 'gradient-text').length === 1);
  for (const id of ['purple-gradient', 'glow-blob', 'serif-hero-font', 'eyebrow-label', 'side-tab-accent'])
    check(`sloppy.css: ${id}`, rules(findings).has(id));
}
{
  // hook mode
  const out = execFileSync(process.execPath, [lint, '--hook'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: fx('sloppy.md') } }), encoding: 'utf8',
  });
  const j = JSON.parse(out);
  check('hook: emits PostToolUse additionalContext', j.hookSpecificOutput?.hookEventName === 'PostToolUse' && /ai-tells/.test(j.hookSpecificOutput.additionalContext));
  const quiet = execFileSync(process.execPath, [lint, '--hook'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: fx('clean.md') } }), encoding: 'utf8',
  });
  check('hook: silent on clean file', quiet === '');
  const junk = spawnSync(process.execPath, [lint, '--hook'], { input: 'not json', encoding: 'utf8' });
  check('hook: bad stdin exits 0 silently', junk.status === 0 && junk.stdout === '');
  const off = spawnSync(process.execPath, [lint, '--hook'], {
    input: JSON.stringify({ tool_input: { file_path: fx('sloppy.md') } }), encoding: 'utf8', env: { ...process.env, AI_TELLS_HOOK: '0' },
  });
  check('hook: AI_TELLS_HOOK=0 disables', off.stdout === '');
}
{
  const r = spawnSync(process.execPath, [lint], { encoding: 'utf8' });
  check('cli: no args -> exit 2', r.status === 2);
  const nf = spawnSync(process.execPath, [lint, 'does-not-exist.md'], { encoding: 'utf8' });
  check('cli: missing target -> exit 2', nf.status === 2);
  const sp = spawnSync(process.execPath, [lint, fx('sloppy.md'), '--min', 'high', '--json'], { encoding: 'utf8' });
  check('cli: "--min high" (space form) works', sp.status === 1 && JSON.parse(sp.stdout).every(f => f.sev === 'high'));
}
{
  // edge cases: fences, indented code, blockquotes, front matter, legit constants, non-emoji symbols, line numbers
  const { findings } = run(fx('edge-cases.md'));
  const bad = findings.filter(f => ['chatbot-leakage', 'chat-phrasing', 'generation-artifact', 'emoji-bullet'].includes(f.rule) || f.line <= 3);
  check(`edge-cases.md: no leakage/artifact/frontmatter hits (got ${bad.map(f => f.rule + '@' + f.line).join(',') || 'none'})`, bad.length === 0);
  const closer = findings.find(f => f.rule === 'formulaic-closer');
  check(`edge-cases.md: formulaic-closer on line 27 (got ${closer?.line})`, closer?.line === 27);
  const bold = findings.find(f => f.rule === 'bold-overuse');
  check(`edge-cases.md: bold-overuse on line 25 (got ${bold?.line})`, bold?.line === 25);
}
{
  // CRLF + BOM: same line numbers as LF
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slop-'));
  const lf = fs.readFileSync(fx('sloppy.md'), 'utf8').replace(/\r\n/g, '\n');
  const p = path.join(dir, 'crlf.md');
  fs.writeFileSync(p, '﻿' + lf.replace(/\n/g, '\r\n'));
  const a = run(fx('sloppy.md')).findings.map(f => `${f.rule}@${f.line}`).sort().join();
  const b = run(p).findings.map(f => `${f.rule}@${f.line}`).sort().join();
  check('crlf+bom: identical findings and lines to LF', a === b);

  // Edit hook: only edited lines reported
  const e = path.join(dir, 'edit.md');
  fs.writeFileSync(e, lf + '\nA new line that serves as a testament to edits.\n\nParking is free on weekends.\n');
  const hook = input => execFileSync(process.execPath, [lint, '--hook'], { input: JSON.stringify(input), encoding: 'utf8' });
  const out = hook({ tool_name: 'Edit', tool_input: { file_path: e, old_string: 'x', new_string: 'A new line that serves as a testament to edits.' } });
  const ctx = out ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
  check('hook Edit: reports only the edited line', /edited lines only/.test(ctx) && /puffery/.test(ctx) && !/chatbot-leakage/.test(ctx));
  const clean = hook({ tool_name: 'Edit', tool_input: { file_path: e, old_string: 'x', new_string: 'Parking is free on weekends.' } });
  check('hook Edit: silent when edited text is clean', clean === '');

  // Pathological inputs stay fast in hook mode
  const big = path.join(dir, 'big.html');
  fs.writeFileSync(big, '<script>' + 'a<b '.repeat(70_000));
  const css = path.join(dir, 'big.css');
  fs.writeFileSync(css, '.x {' + ' color: red;'.repeat(20_000));
  for (const f of [big, css]) {
    const t = Date.now();
    spawnSync(process.execPath, [lint, '--hook'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: f } }), encoding: 'utf8' });
    check(`hook: ${path.basename(f)} under 3s (${Date.now() - t}ms)`, Date.now() - t < 3000);
  }
  // .txt not linted by hook
  const txt = path.join(dir, 'requirements.txt');
  fs.writeFileSync(txt, '# I hope this helps\nrequests==2.0\n');
  check('hook: .txt ignored', hook({ tool_name: 'Write', tool_input: { file_path: txt } }) === '');
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  // app-style uppercase label (no heading after) is low, not med
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slop-'));
  const p = path.join(dir, 'Table.tsx');
  fs.writeFileSync(p, '<table><thead><tr><th className="text-xs uppercase tracking-wide text-gray-500">Name</th></tr></thead></table>\n<footer><p>© 2025 Acme™</p><p>▶ Play</p><p>✔ Saved</p></footer>\n');
  const { findings } = run(p);
  check('tsx: table-header eyebrow is low', findings.filter(f => f.rule === 'eyebrow-label').every(f => f.sev === 'low'));
  check('tsx: © ™ ▶ ✔ are not emoji', !findings.some(f => f.rule === 'emoji-ui'));
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const r = rules(run(fx('sloppy2.md')).findings);
  for (const id of ['stock-opener', 'staged-runup', 'straw-man', 'deep-saying', 'meta-writing', 'stacked-qualifier',
    'connective-filler', 'repeated-openings', 'theater-dismissal', 'dramatic-closer']) check(`sloppy2.md: ${id}`, r.has(id));
}
{
  // shape tells: counts, not phrases
  const { findings } = run(fx('sloppy-shape.md'));
  const r = rules(findings);
  for (const id of ['triplet-lists', 'uniform-paragraphs', 'restated-heading', 'closing-question', 'subject-first-monotony'])
    check(`sloppy-shape.md: ${id}`, r.has(id));
  check('sloppy-shape.md: triplet-lists is med when every list has three items',
    findings.some(f => f.rule === 'triplet-lists' && f.sev === 'med'));
  check('sloppy-shape.md: closing cliché question is med',
    findings.some(f => f.rule === 'closing-question' && f.sev === 'med'));
}
{
  const r = rules(run(fx('sloppy2.tsx')).findings);
  for (const id of ['overused-font', 'mixed-icon-sets', 'glassmorphism', 'badge-above-headline', 'icon-tile-cards', 'ghost-card',
    'centered-fullscreen-hero', 'monotonous-spacing', 'marquee', 'generic-alt', 'colored-headline-word', 'markdown-bleed',
    'step-comments', 'emoji-logs', 'closing-brace-label', 'stock-opener']) check(`sloppy2.tsx: ${id}`, r.has(id));
}
{
  const r = rules(run(fx('sloppy.py')).findings);
  for (const id of ['placeholder-stub', 'hype-comment', 'swallowed-error', 'emoji-logs']) check(`sloppy.py: ${id}`, r.has(id));
}
{
  const { findings } = run(fx('design-system.tsx'));
  const r = rules(findings);
  check('design-system.tsx: stacked-slogans (merges <br/>/<em>)', r.has('stacked-slogans'));
  check('design-system.tsx: typed-caps (text nodes + string literals)', r.has('typed-caps'));
  const caps = findings.find(f => f.rule === 'typed-caps');
  check('design-system.tsx: publisher names like "FOX NEWS" not counted as typed caps', caps && !/FOX NEWS/.test(caps.msg));
  const one = rules(run(fx('one-tagline.tsx')).findings);
  check('one-tagline.tsx: a single tagline and short brand caps are fine', !one.has('stacked-slogans') && !one.has('typed-caps'));
  const css = rules(run(fx('flat.css')).findings);
  check('flat.css: flat-type-scale', css.has('flat-type-scale'));
  check('flat.css: token-bypass', css.has('token-bypass'));
  const sloppyCss = rules(run(fx('sloppy.css')).findings);
  check('sloppy.css: small stylesheet not flagged for scale/tokens', !sloppyCss.has('flat-type-scale') && !sloppyCss.has('token-bypass'));
}
{
  // the new rules must stay quiet on the clean / false-positive fixtures
  for (const f of ['clean.md', 'false-positives.md']) {
    const got = run(fx(f), f === 'clean.md' ? 'low' : 'med').findings;
    check(`${f}: still no findings after new rules (got ${got.map(x => x.rule).join(',') || 'none'})`, got.length === 0);
  }
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
