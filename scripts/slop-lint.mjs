#!/usr/bin/env node
// slop-lint: flags common tells of AI-generated prose and UI code.
// Zero dependencies. Heuristic: every finding is a prompt to look, not a verdict.
//
// Usage:
//   node slop-lint.mjs <file-or-dir>... [--json] [--min=low|med|high]
//   node slop-lint.mjs --hook          (Claude Code PostToolUse hook; reads JSON on stdin)
//
// Exit codes (CLI mode): 0 = no findings at/above --min, 1 = findings, 2 = usage error.
//
// slop-lint-disable-file (this file quotes every tell in its rule tables)

import fs from 'node:fs';
import path from 'node:path';

const SEV = { low: 1, med: 2, high: 3 };
const MD_EXT = new Set(['.md', '.mdx', '.markdown']);
const PLAIN_EXT = new Set(['.txt', '.rst']); // prose rules only; not linted by the hook
const MARKUP_EXT = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const SCRIPT_EXT = new Set(['.js', '.ts', '.mjs', '.cjs', '.py']);
const CODE_EXT = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.py']);
const SUPPORTED = new Set([...MD_EXT, ...PLAIN_EXT, ...MARKUP_EXT, ...STYLE_EXT, ...SCRIPT_EXT]);
const HOOK_SUPPORTED = new Set([...MD_EXT, ...MARKUP_EXT, ...STYLE_EXT, ...SCRIPT_EXT]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'vendor', '.omc',
  '.cloudflare', '.wrangler', '.vinext', '.vercel', '.netlify', '.svelte-kit', '.astro', '.nuxt', '.output', '.turbo', '.cache']);
const MAX_BYTES = 2_000_000;
const HOOK_MAX_BYTES = 300_000;

// ---------- helpers ----------

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function lineOf(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}
// Replace every non-newline char in [a,b) with a space, preserving offsets.
function blank(chars, a, b) {
  for (let i = a; i < b && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
}
function wordCount(s) {
  const m = s.match(/[A-Za-z][A-Za-z'’-]*/g);
  return m ? m.length : 0;
}
// Real emoji only: excludes © ® ™ ▶ ✔ etc. unless forced to emoji presentation with U+FE0F.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;

// Blank <script>/<style> bodies with indexOf scanning (linear; an unclosed tag blanks to EOF).
function stripScriptStyle(text) {
  const lower = text.toLowerCase();
  const chars = text.split('');
  const open = /<(script|style)\b/g;
  let m;
  while ((m = open.exec(lower))) {
    const close = lower.indexOf(`</${m[1]}`, m.index + m[0].length);
    const end = close === -1 ? text.length : close;
    blank(chars, m.index, end);
    if (close === -1) break;
    open.lastIndex = close + 2;
  }
  return chars.join('');
}

// Blank Markdown code: fenced (CommonMark-ish: same char, closing run >= opening), indented,
// inline spans, HTML comments, front matter, blockquotes, and bare URLs.
function blankMarkdownCode(text, chars) {
  const fm = text.match(/^\uFEFF?---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/);
  if (fm) blank(chars, 0, fm[0].length);
  let pos = fm ? fm[0].length : 0;
  let fence = null; // { ch, len }
  let prevBlank = true, prevIndentedCode = false;
  while (pos < text.length) {
    let eol = text.indexOf('\n', pos);
    if (eol === -1) eol = text.length;
    const line = text.slice(pos, eol);
    if (fence) {
      const c = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (c && c[1][0] === fence.ch && c[1].length >= fence.len) fence = null;
      blank(chars, pos, eol);
    } else {
      const o = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (o && !(o[1][0] === '`' && line.slice(o.index + o[1].length).includes('`'))) {
        fence = { ch: o[1][0], len: o[1].length };
        blank(chars, pos, eol);
        prevIndentedCode = false;
      } else if (/^( {4}|\t)/.test(line) && line.trim() && (prevBlank || prevIndentedCode)) {
        blank(chars, pos, eol);
        prevIndentedCode = true;
      } else if (/^ {0,3}>/.test(line)) {
        blank(chars, pos, eol); // quoted material isn't the author's prose
        prevIndentedCode = false;
      } else if (line.trim()) {
        prevIndentedCode = false;
      }
      prevBlank = !line.trim();
    }
    pos = eol + 1;
  }
  for (const re of [/`[^`\n]*`/g, /<!--[\s\S]*?-->/g, /\bhttps?:\/\/\S+/g]) {
    let m; while ((m = re.exec(text))) blank(chars, m.index, m.index + m[0].length);
  }
}

// Prose view of a file: same length as source, non-prose regions blanked.
function proseView(text, ext) {
  if (MD_EXT.has(ext) || PLAIN_EXT.has(ext)) {
    const chars = text.split(''); // UTF-16 units, so indices match regex offsets
    if (MD_EXT.has(ext)) blankMarkdownCode(text, chars);
    else { const re = /\bhttps?:\/\/\S+/g; let m; while ((m = re.exec(text))) blank(chars, m.index, m.index + m[0].length); }
    return chars.join('');
  }
  if (MARKUP_EXT.has(ext)) {
    // Keep only text nodes: content between '>' and '<' with no braces.
    const chars = text.split('').map(c => (c === '\n' ? '\n' : ' '));
    for (const { raw, index } of textNodes(text)) for (let i = 0; i < raw.length; i++) chars[index + i] = raw[i];
    return chars.join('');
  }
  return null;
}

// Text nodes of markup, with offsets. Cached per source text.
let tnCache = { text: null, nodes: null };
function textNodes(text) {
  if (tnCache.text === text) return tnCache.nodes;
  const out = [];
  const cleaned = stripScriptStyle(text);
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(cleaned))) {
    const raw = m[1];
    if (raw.trim()) out.push({ raw, text: raw.trim(), index: m.index + 1 });
    re.lastIndex = m.index + m[0].length - 1;
  }
  tnCache = { text, nodes: out };
  return out;
}

// class="..." / className="..." / className={`...`} / class={'...'}
function classStrings(text) {
  const out = [];
  const re = /\bclass(?:Name)?\s*=\s*(?:\{\s*)?(["'`])([^"'`]*)\1/g;
  let m;
  while ((m = re.exec(text))) out.push({ cls: m[2], index: m.index, end: m.index + m[0].length });
  // cn()/clsx()/cva() string args
  const re2 = /\b(?:cn|clsx|cva|twMerge|classNames)\(([^)]*)\)/g;
  while ((m = re2.exec(text))) {
    const strs = m[1].match(/(["'`])([^"'`]*)\1/g) || [];
    out.push({ cls: strs.map(s => s.slice(1, -1)).join(' '), index: m.index, end: m.index + m[0].length });
  }
  return out;
}

// CSS-ish blocks { ... } found linearly.
function cssBlocks(text) {
  const out = [];
  const re = /\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) out.push({ body: m[1], index: m.index });
  return out;
}

// ---------- word / phrase lists ----------
// Sources: Wikipedia:Signs of AI writing (vocab, puffery, chatbot leakage, artifacts),
// tenex.studio "AI slop: 8 signs", Fountain Institute "7 tells a UI is AI-generated",
// blader/humanizer SKILL.md, aismells.pages.dev, impeccable.style/slop, Nutlope/hallmark,
// utsubo.com "12 signals", adriankrebs.ch "design slop", asyrafhussin code-slop skill.
// Items marked [extra] are common marketing filler not named in those sources.

const AI_VOCAB = [
  'additionally', 'align with', 'aligns with', 'boasts', 'bolstered', 'crucial', 'deep dive', 'delve', 'delves', 'delved', 'delving',
  'emphasizing', 'enduring', 'enhance', 'enhances', 'enhancing', 'fostering', 'foster', 'fosters', 'garner', 'garnered',
  'highlighting', 'interplay', 'intricate', 'intricacies', 'landscape', 'meticulous', 'meticulously', 'pivotal', 'robust',
  'showcase', 'showcases', 'showcasing', 'tapestry', 'testament', 'underscore', 'underscores', 'underscoring', 'underscored',
  'valuable', 'vibrant', 'multifaceted', 'leverage', 'leveraging', 'nestled', 'renowned', 'groundbreaking', 'exemplifies',
  'profound', 'resonate', 'resonates',
  // humanizer / aismells / impeccable / utsubo
  'comprehensive', 'nuanced', 'transformative', 'paradigm', 'underpinnings', 'camaraderie', 'facilitate', 'facilitates',
  'load-bearing', 'quietly', 'breathtaking', 'must-visit', 'stunning', 'world-class', 'enterprise-grade',
  'next-generation', 'best-in-class', 'future-ready', 'future-proof',
  // [extra]
  'seamless', 'seamlessly', 'elevate', 'elevates', 'empower', 'empowers', 'unlock', 'unlocks', 'unleash', 'supercharge',
  'game-changer', 'game-changing', 'cutting-edge', 'revolutionize', 'revolutionizes', 'effortless', 'effortlessly', 'next-level',
  'harness', 'navigate the', 'ever-evolving', 'realm',
];
const VOCAB_RE = new RegExp(`\\b(${AI_VOCAB.map(w => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/'/g, "['’]")).join('|')})\\b`, 'gi');

const RULES_PROSE = [
  {
    // Unambiguous assistant/model self-reference.
    id: 'chatbot-leakage', sev: 'high',
    re: /\b(I hope this helps|As an AI\b|as a large language model|as of my last (knowledge|training) (update|cutoff)|up to my last training|my knowledge cutoff|Here['’]s (a|an|the) (revised|updated|polished|improved|rewritten) (version|draft))/gi,
    msg: 'Chat-assistant phrasing leaked into the artifact.',
    fix: 'Delete it. The document is not talking to the reader as an assistant.',
  },
  {
    // Conversational phrases humans also use; a tell mainly as a sign-off at the end of a document.
    id: 'chat-phrasing', sev: 'low', endSev: 'med',
    re: /\b(Certainly!|Of course!|Great question|You['’]re absolutely right|Would you like me to|Let me know if you|Is there anything else|Feel free to (reach out|ask|let me know))/gi,
    msg: 'Conversational assistant phrasing.',
    fix: 'If this is a chat sign-off pasted into a document, delete it.',
  },
  {
    id: 'generation-artifact', sev: 'high',
    re: /(contentReference\[oaicite:\d+\]|\boaicite\b|\bturn\d+(search|news|view)\d+\b|utm_source=(chatgpt\.com|openai|copilot\.com)|referrer=grok\.com|\bINSERT_[A-Z_]*(URL|HERE|NAME|LINK|SOURCE)[A-Z_#\d]*\b|\bPASTE_[A-Z_]+_HERE\b|\b20\d\d-[xX]{2}-[xX]{2}\b|\[(Your|Insert|Company|Product|Founder|Article) [A-Z][^\]\n]{0,40}\]|\blorem ipsum\b)/g,
    msg: 'Leftover generation artifact or placeholder.',
    fix: 'Replace with the real value or remove. Never ship placeholders.',
  },
  {
    id: 'puffery', sev: 'med',
    re: /\b(serves as (a|an|the)|stands as (a|an|the)|(is|as) a testament to|a testament to|plays? a (crucial|pivotal|vital|key|significant) role|underscor(es|ing) (the|its) (importance|significance)|highlight(s|ing) (the|its) (importance|significance)|reflects? (the )?broader|setting the stage for|marking a (shift|turning point)|represents a shift|key turning point|evolving landscape|indelible mark|deeply rooted|focal point|rich (history|heritage|tradition|tapestry)|in the heart of|diverse array|commitment to (excellence|quality|innovation))\b/gi,
    msg: 'Inflated significance / puffery.',
    fix: 'State the plain fact ("is", "has", a number, a date). Cut claims about legacy or importance unless sourced.',
  },
  {
    id: 'participle-tail', sev: 'med',
    re: /,\s+(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|contributing to|cultivating|fostering|encompassing|enhancing|showcasing|solidifying|cementing)\b/gi,
    msg: 'Sentence ends in a vague "-ing" analysis tail.',
    fix: 'Cut the tail, or make it its own sentence with a concrete claim.',
  },
  {
    id: 'negative-parallelism', sev: 'med',
    re: /(\bnot (just|only|merely)\b[^.!?\n]{1,80}?\b(but|it['’]s|it is)\b|\bit['’]?s not\b[^.!?\n]{1,60}?[,;:—–-]\s*it['’]?s\b|\bisn['’]t (just )?about\b[^.!?\n]{1,60}?[,;:—–-]\s*it['’]?s\b|\bno [^,.\n]{1,30}, no [^,.\n]{1,30}, just\b)/gi,
    msg: '"Not X, but Y" / "It\'s not X, it\'s Y" construction.',
    fix: 'Say what it is. Drop the straw-man half.',
  },
  {
    id: 'vague-attribution', sev: 'med',
    re: /\b(experts|observers|critics|analysts|industry reports|some (critics|experts|observers|people))\s+(argue|say|have (cited|noted|said)|suggest|believe|note)\b|\b(many (believe|argue)|studies (show|suggest)|it is widely (believed|recognized|acknowledged))\b/gi,
    msg: 'Vague attribution ("experts say").',
    fix: 'Name the source or cut the claim.',
  },
  {
    id: 'formulaic-closer', sev: 'med',
    re: /^[ \t]*(#+[ \t]*)?(In conclusion|In summary|To sum up|Overall,|Ultimately,|Conclusion[ \t]*$|Despite these challenges|Future (Outlook|Prospects)|Challenges and (Legacy|Future))/gim,
    msg: 'Formulaic summary / "challenges and outlook" closer.',
    fix: 'End on the last real point. Don\'t restate.',
  },
  {
    id: 'hedging-disclaimer', sev: 'med',
    re: /\b(while specific details are (limited|scarce)|not widely (available|documented|disclosed)|based on (the )?available information|in the (provided|available) (sources|search results)|it['’]s important to (note|remember)|it is important to (note|remember)|it['’]s worth noting|it is worth noting|maintains a low profile)\b/gi,
    msg: 'Hedging / didactic disclaimer.',
    fix: 'Cut it. If a fact is unknown, omit the claim instead of narrating the gap.',
  },
  {
    id: 'stock-opener', sev: 'med',
    re: /\b(in today['’]s (fast-paced|digital|ever-changing|rapidly evolving|modern|competitive) (world|landscape|age|era|environment)|in an (era|age) (of|where)|in the (ever-)?(evolving|changing) (world|landscape|realm) of)\b/gi,
    msg: 'Stock opener ("In today\'s fast-paced world").',
    fix: 'Start with the actual subject.',
  },
  {
    id: 'staged-runup', sev: 'med',
    re: /(\blet['’]s (dive in|dive into|dive deeper|unpack|break (this|it) down|explore|walk through|take a (closer )?look)\b|\bhere['’]s the thing\b|\bwithout further ado\b|\breal talk\b|^[ \t]*(Honestly\?|Look,)(?=\s))/gim,
    msg: 'Staged run-up / tour-guide opener ("Let\'s dive in", "Here\'s the thing").',
    fix: 'Delete the run-up and state the point.',
  },
  {
    id: 'dramatic-closer', sev: 'med',
    re: /\b(let that sink in|read that again|that['’]s the (real )?(win|magic|point|secret)|and that changes everything|(?<=[.!?]\s)full stop\.)/gi,
    msg: 'Dramatic one-line closer.',
    fix: 'Cut it. Keep a closer only if it adds a new fact or consequence.',
  },
  {
    id: 'straw-man', sev: 'low',
    re: /\b(don['’]t get me wrong|I['’]m not saying|this is not to say|to be clear(?=,)|one might be tempted to|some (might|may|would) (say|argue)|a tempting approach would be)\b/gi,
    msg: 'Arguing with an objection nobody raised.',
    fix: 'Delete the defense and state the claim.',
  },
  {
    id: 'deep-saying', sev: 'low',
    re: /\b(the real question is|at its core(?=,)|what really matters (is|here)|the heart of the matter|the (simple|uncomfortable|hard) truth is)/gi,
    msg: 'Saying that sounds deep but carries no claim.',
    fix: 'Replace it with the specific claim.',
  },
  {
    id: 'stacked-qualifier', sev: 'low',
    re: /\b(could potentially|can potentially|may potentially|might possibly|could possibly|might arguably|may help (you )?(to )?(potentially )?)\b/gi,
    msg: 'Stacked or hedging qualifier.',
    fix: 'Take a position. Keep one qualifier only where the evidence needs it.',
  },
  {
    id: 'meta-writing', sev: 'low',
    re: /\b(this (section|article|guide|post|document) (is organized|will (explore|cover|walk|look at|examine))|in this (article|post|guide|section),? (we|I)['’]?(ll| will)|the table below (compares|shows|summarizes))\b/gi,
    msg: 'Writing about the document instead of the subject.',
    fix: 'Describe the subject. Readers can see the structure.',
  },
  {
    id: 'theater-dismissal', sev: 'low',
    re: /\b(is|just|pure|mere|it['’]s|becomes) (\w+ )?theater\b/gi,
    msg: 'Dismissing something as "theater".',
    fix: 'Say what is wrong with it concretely.',
  },
  {
    id: 'placeholder-name', sev: 'low',
    re: /\b(Jane Doe|John Doe|John Smith|Acme (Inc|Corp|Co)\.?)\b/g,
    msg: 'Stock placeholder name.',
    fix: 'Use a real name, or leave a clearly marked TODO.',
  },
];

// ---------- prose checks ----------

function lintProse(text, ext, starts, add) {
  const view = proseView(text, ext);
  if (view == null) return;
  const words = wordCount(view);
  // last few non-empty lines of prose, for end-of-document sign-off detection
  const viewLines = view.split('\n');
  let tailFrom = viewLines.length;
  for (let i = viewLines.length - 1, seen = 0; i >= 0 && seen < 3; i--) if (viewLines[i].trim()) { tailFrom = i + 1; seen++; }

  for (const r of RULES_PROSE) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(view))) {
      if (m[0].length === 0) { r.re.lastIndex++; continue; }
      const idx = m.index + Math.max(0, m[0].search(/\S/));
      const line = lineOf(starts, idx);
      const sev = r.endSev && line >= tailFrom ? r.endSev : r.sev;
      add(r.id, sev, line, `${r.msg} → "${m[0].trim().slice(0, 60)}"`, r.fix);
    }
  }

  // AI vocabulary: per-hit low, file-level med when dense.
  VOCAB_RE.lastIndex = 0;
  let m, hits = 0; const seen = new Map();
  while ((m = VOCAB_RE.exec(view))) {
    const w = m[0].toLowerCase();
    if (w === 'additionally') {
      // only sentence-initial counts
      const before = view.slice(Math.max(0, m.index - 3), m.index);
      if (!/(^|[.!?\n]\s*|\n)$/.test(before) && m.index !== 0) continue;
    }
    hits++;
    seen.set(w, (seen.get(w) || 0) + 1);
    add('ai-vocab', 'low', lineOf(starts, m.index), `AI-associated word "${m[0]}".`, 'Use the plain word, or a specific claim.');
  }
  const per1k = words ? (hits / words) * 1000 : 0;
  if (hits >= 4 && per1k >= 6) {
    const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w, n]) => `${w}×${n}`).join(', ');
    add('ai-vocab-density', 'med', 1, `High density of AI-associated vocabulary (${hits} hits, ${per1k.toFixed(1)}/1000 words: ${top}).`, 'Clustered, these are one of the strongest tells. Rewrite in plain words.');
  }

  // Em dashes: density, with spaced dashes lowering the bar slightly.
  const dashes = [...view.matchAll(/—/g)];
  const spaced = [...view.matchAll(/ — /g)].length;
  const dPer1k = words ? (dashes.length / words) * 1000 : 0;
  if (dashes.length >= 3 && (dPer1k >= 4 || (spaced >= 3 && dPer1k >= 2))) {
    add('em-dash-density', 'med', lineOf(starts, dashes[0].index), `${dashes.length} em dashes (${dPer1k.toFixed(1)}/1000 words${spaced ? `, ${spaced} spaced` : ''}).`, 'Replace most with periods, commas, colons or parentheses. Don\'t strip every one: zero-dash, comma-only prose is its own tell.');
  }

  // Connective filler: sentence-initial Furthermore/Moreover/Notably/Consequently.
  const filler = [...view.matchAll(/(?:^|[.!?]\s+|\n\s*)(Furthermore|Moreover|Notably|Consequently|Additionally|Importantly),/g)];
  if (filler.length >= 3) add('connective-filler', 'low', lineOf(starts, filler[0].index + filler[0][0].indexOf(filler[0][1])), `${filler.length} sentences open with connective filler (${[...new Set(filler.map(f => f[1]))].join(', ')}).`, 'Cut the connector; let the logic carry the sentence.');

  // Repeated sentence openings: 3+ consecutive sentences starting with the same word.
  const sentTexts = view.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(s => s.trim()).filter(s => wordCount(s) >= 3);
  for (let i = 0, run = 1; i < sentTexts.length; i++) {
    const w = (sentTexts[i].match(/^[\p{L}'’]+/u) || [''])[0].toLowerCase();
    const prev = i ? (sentTexts[i - 1].match(/^[\p{L}'’]+/u) || [''])[0].toLowerCase() : null;
    run = w && w === prev && !['the', 'a', 'an'].includes(w) ? run + 1 : 1;
    if (run === 3) {
      const at = view.indexOf(sentTexts[i - 2].slice(0, 30));
      add('repeated-openings', 'low', at >= 0 ? lineOf(starts, at) : 1, `3+ consecutive sentences start with "${w}".`, 'Merge sentences, change the subject, or lead with the action.');
    }
  }

  // Sentence-length uniformity.
  const sentences = view.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(s => wordCount(s)).filter(n => n >= 3);
  if (sentences.length >= 12) {
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const sd = Math.sqrt(sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / sentences.length);
    const cv = sd / mean;
    if (cv < 0.3) add('uniform-rhythm', 'low', 1, `Sentence lengths are very uniform (mean ${mean.toFixed(1)} words, CV ${cv.toFixed(2)}).`, 'Vary rhythm: some short sentences, some long ones.');
  }

  if (MD_EXT.has(ext)) {
    lintMarkdownStyle(view, starts, add);
    lintShape(view, starts, add);
  }
  lintSentenceShape(view, starts, add);
}

// ---------- shape checks ----------
// Tells that are counts, not phrases: list sizes, paragraph lengths, how
// sentences open, how the piece starts and ends.

const SUBJECT_OPENERS = new Set(['i', 'we', 'it', "it's", 'its', 'this', 'that', 'these', 'those', 'they', 'he', 'she', 'you',
  'the', 'a', 'an', 'my', 'our', 'their', 'your', 'his', 'her', 'there']);
// (SMALL is declared further down, so the shared words are repeated here rather than spread from it.)
const STOP = new Set(['the', 'and', 'for', 'nor', 'but', 'with', 'from', 'into', 'via', 'you', 'your', 'what', 'why', 'how', 'when',
  'where', 'which', 'who', 'does', 'can', 'should', 'are', 'was', 'were', 'its', 'this', 'that', 'our', 'not', 'about', 'use', 'using']);
const stem = w => w.toLowerCase().replace(/(?:ing|ed|es|s)$/, '');
const contentWords = s => (s.match(/[A-Za-z][A-Za-z'-]+/g) || []).map(w => w.toLowerCase()).filter(w => w.length >= 3 && !STOP.has(w)).map(stem);
const splitSentences = s => s.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map(x => x.trim()).filter(x => wordCount(x) >= 3);

// Blocks of a Markdown prose view: headings, lists (top-level items), and paragraphs, with offsets.
function mdBlocks(view) {
  const blocks = [];
  const lines = view.split('\n');
  let off = 0, cur = null;
  const close = () => { if (cur) blocks.push(cur); cur = null; };
  for (const ln of lines) {
    const at = off; off += ln.length + 1;
    if (!ln.trim()) { if (cur && cur.kind === 'para') close(); if (cur && cur.kind === 'list') cur.gap = true; continue; }
    const h = ln.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h) { close(); blocks.push({ kind: 'heading', text: h[1], index: at }); continue; }
    if (/^\s*\|/.test(ln) || /^\s*>/.test(ln)) { close(); continue; }
    const li = ln.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const top = li[1].length < 2;
      if (cur && cur.kind === 'list') { if (top) cur.items++; cur.gap = false; continue; }
      close(); cur = { kind: 'list', items: 1, index: at }; continue;
    }
    if (cur && cur.kind === 'list') { if (!cur.gap || /^\s{2,}/.test(ln)) continue; close(); }
    if (!cur) cur = { kind: 'para', text: '', index: at };
    cur.text += ln + ' ';
  }
  close();
  return blocks;
}

function lintShape(view, starts, add) {
  const blocks = mdBlocks(view);
  const L = i => lineOf(starts, i);

  // Three-item lists everywhere (rule of three, as structure).
  const lists = blocks.filter(b => b.kind === 'list' && b.items >= 2);
  const threes = lists.filter(b => b.items === 3);
  if ((threes.length >= 4 && threes.length / lists.length >= 0.6) || (threes.length >= 3 && threes.length === lists.length)) {
    let sections = 0, withThree = 0, inThree = false, any = false;
    for (const b of blocks) {
      if (b.kind === 'heading') { if (any) { sections++; if (inThree) withThree++; } inThree = false; any = true; continue; }
      any = true;
      if (b.kind === 'list' && b.items === 3) inThree = true;
    }
    if (any) { sections++; if (inThree) withThree++; }
    const sev = threes.length >= 4 && threes.length / lists.length >= 0.8 ? 'med' : 'low';
    add('triplet-lists', sev, L(threes[0].index), `${threes.length} of ${lists.length} lists have exactly three items${sections > 1 ? ` (${withThree} of ${sections} sections)` : ''}.`,
      'Use the number of items that actually exist. Fold some lists into prose, and let others run to two, four or seven.');
  }

  // Paragraphs all about the same length.
  const paras = blocks.filter(b => b.kind === 'para').map(b => ({ ...b, n: wordCount(b.text) })).filter(b => b.n >= 12);
  if (paras.length >= 6 && paras.reduce((a, p) => a + p.n, 0) / paras.length >= 20) {
    const ns = paras.map(p => p.n);
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
    const cv = Math.sqrt(ns.reduce((a, b) => a + (b - mean) ** 2, 0) / ns.length) / mean;
    if (cv < 0.2) add('uniform-paragraphs', 'low', L(paras[0].index), `${paras.length} paragraphs of near-identical length (mean ${mean.toFixed(0)} words, CV ${cv.toFixed(2)}).`,
      'Let the content set the length: a long paragraph where the substance is, a two-sentence one where it isn\'t.');
  }

  // First sentence under a heading restates the heading (or the question in it).
  for (let i = 0; i < blocks.length - 1; i++) {
    const h = blocks[i], p = blocks[i + 1];
    if (h.kind !== 'heading' || p.kind !== 'para') continue;
    const hw = [...new Set(contentWords(h.text))];
    const first = splitSentences(p.text)[0] || p.text.trim();
    if (hw.length < 2 || wordCount(first) > 25) continue;
    const fw = new Set(contentWords(first));
    const hit = hw.filter(w => fw.has(w)).length;
    const restatey = /^(?:(?:so,?\s+)?(?:why|what|how|when|is|are|can|should|do|does)\b.*\?$)/i.test(h.text.trim())
      || /^(?:there are (?:several|many|a few|three|two)|here(?:'s| is| are)|this (?:section|is)|when it comes to|(?:great|good) question)/i.test(first);
    if (restatey && hit / hw.length >= 0.75) {
      add('restated-heading', 'low', L(p.index + Math.max(0, p.text.search(/\S/))), `First sentence restates the heading ("${h.text.trim().slice(0, 40)}").`,
        'Start with the answer or the first new fact. The heading already said what the section is about.');
    }
  }

  // Closing question to the reader.
  const lastPara = [...blocks].reverse().find(b => b.kind === 'para');
  if (lastPara && blocks.filter(b => b.kind === 'para').length >= 2) {
    const sents = splitSentences(lastPara.text);
    const last = (sents[sents.length - 1] || '').trim();
    if (/\?["”)]*$/.test(last) && /\b(you|your|anyone|anybody|everyone|y'all|thoughts|folks)\b/i.test(last)) {
      const cliche = /\b(what do you think|thoughts\?|what are your thoughts|have you (?:ever|tried)|what(?:'s| is) your|how do you|would you|anyone else|let me know)\b/i.test(last);
      const at = lastPara.index + lastPara.text.lastIndexOf(last.slice(0, 20));
      add('closing-question', cliche ? 'med' : 'low', L(Math.max(lastPara.index, at)), `Ends on a question to the reader ("${last.slice(0, 50)}").`,
        'End on the last real point. Ask only if you need the answer, and then ask something specific.');
    }
  }
}

// Most sentences open subject-first: the clipped "It does X. It does Y." beat.
function lintSentenceShape(view, starts, add) {
  const sents = splitSentences(view.split('\n').filter(l => !/^\s*#/.test(l)).join('\n'));
  if (sents.length < 10) return;
  const first = s => (s.match(/^[("“]*([A-Za-z][A-Za-z'’]*)/) || [, ''])[1].toLowerCase().replace('’', "'");
  const subj = sents.filter(s => SUBJECT_OPENERS.has(first(s)));
  const clipped = subj.filter(s => wordCount(s) <= 14 && !/[,;:(—]/.test(s.slice(0, -1)));
  const share = subj.length / sents.length;
  if (share >= 0.7 && clipped.length / sents.length >= 0.2) {
    add('subject-first-monotony', 'low', 1, `${subj.length} of ${sents.length} sentences open with the subject (${Math.round(share * 100)}%), ${clipped.length} of them short and unbroken.`,
      'Open some sentences with a clause ("When…", "Because…"), start one with But or So, and combine short facts that belong together.');
  }
}

const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'of', 'on', 'in', 'to', 'at', 'by', 'up', 'as', 'is', 'vs', 'via', 'with', 'from', 'into']);

function lintMarkdownStyle(view, starts, add) {
  const lines = view.split('\n');
  let inlineHeaders = 0, listItems = 0, firstInlineHeader = 0, titleCase = 0, firstTitle = 0;
  lines.forEach((ln, i) => {
    const h = ln.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const ws = h[2].replace(/[^\p{L}\p{N}\s'-]/gu, '').split(/\s+/).filter(Boolean);
      // significant (non-small) words after the first; all capitalized => Title Case
      const sig = ws.slice(1).filter(w => !SMALL.has(w.toLowerCase()) && /^\p{L}/u.test(w));
      if (ws.length >= 3 && sig.length >= 1 && sig.every(w => /^\p{Lu}/u.test(w)) && !sig.every(w => w === w.toUpperCase())) {
        titleCase++; if (!firstTitle) firstTitle = i + 1;
      }
      if (EMOJI.test(h[2].trim().slice(0, 2))) add('emoji-bullet', 'med', i + 1, 'Emoji at the start of a heading.', 'Remove it.');
    }
    const li = ln.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      listItems++;
      if (/^\*\*[^*]+\*\*\s*[:—–-]/.test(li[1]) || /^\*\*[^*]+:\*\*/.test(li[1])) { inlineHeaders++; if (!firstInlineHeader) firstInlineHeader = i + 1; }
      if (EMOJI.test(li[1].trim().slice(0, 2))) add('emoji-bullet', 'med', i + 1, 'Emoji at the start of a list item.', 'Remove it.');
    }
  });
  const rules = lines.filter(l => /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l)).length;
  const headings = lines.filter(l => /^#{1,6}\s/.test(l)).length;
  if (rules >= 3 && rules >= headings - 2) add('section-dividers', 'low', 1, `${rules} horizontal rules, roughly one per section.`, 'Drop the dividers; headings already separate sections.');
  if (titleCase >= 2) add('title-case-headings', 'low', firstTitle, `${titleCase} headings in Title Case.`, 'Use sentence case unless the house style says otherwise.');
  if (inlineHeaders >= 3) {
    const sev = inlineHeaders >= 6 && inlineHeaders / listItems >= 0.6 ? 'med' : 'low';
    add('inline-header-list', sev, firstInlineHeader, `${inlineHeaders} of ${listItems} list items are "**Label:** text".`, 'Write it as prose, or as a plain list without the bold lead-ins.');
  }

  // Bold overuse per paragraph, with real offsets.
  const seps = [...view.matchAll(/\n[ \t]*\n\s*/g)];
  let start = 0;
  const checkPara = (a, b) => {
    const p = view.slice(a, b);
    const bolds = (p.match(/\*\*[^*\n]+\*\*/g) || []).length;
    if (bolds >= 3 && wordCount(p) < 150 && !/^\s*[-*+]\s/m.test(p)) {
      const off = a + Math.max(0, p.search(/\S/));
      add('bold-overuse', 'low', lineOf(starts, off), `${bolds} bold phrases in one paragraph.`, 'Bold at most one thing, or none.');
    }
  };
  for (const s of seps) { checkPara(start, s.index); start = s.index + s[0].length; }
  checkPara(start, view.length);

  const curly = view.match(/[“”‘’]/g);
  if (curly && curly.length >= 4 && !/["']/.test(view)) {
    add('curly-quotes', 'low', 1, 'Curly quotes throughout a plain-text/Markdown source.', 'Fine for typeset copy; in Markdown/wikitext/code, use straight quotes.');
  }
}

// ---------- UI checks ----------

const ACCENTS = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

function lintUI(text, ext, starts, add) {
  const isMarkup = MARKUP_EXT.has(ext);
  const isStyle = STYLE_EXT.has(ext);
  const isScript = SCRIPT_EXT.has(ext);
  if (!isMarkup && !isStyle && !isScript) return;

  const L = idx => lineOf(starts, idx);
  const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) fn(m); };

  // CSS block checks (one finding per block)
  if (isStyle || isMarkup) {
    for (const { body, index } of cssBlocks(text)) {
      if (/background-clip\s*:\s*text/i.test(body)) add('gradient-text', 'high', L(index), 'Gradient-filled text (background-clip: text).', 'Set the headline in one flat color. Reserve contrast for interactive elements.');
      if (/text-transform\s*:\s*uppercase/i.test(body) && /letter-spacing/i.test(body))
        add('eyebrow-label', 'low', L(index), 'Uppercase + letter-spaced label style (eyebrow above headlines?).', 'Fine for table headers/nav groups. Above a headline, drop it or fold the word into the headline.');
    }
    each(/border-left\s*:\s*[3-8]px\s+solid/gi, m => add('side-tab-accent', 'low', L(m.index), 'Thick colored left border accent.', 'One restrained accent at most; never a different color per card.'));
  }

  // Purple/indigo gradients in CSS
  each(/(linear|radial|conic)-gradient\([^;{}()]*(?:\([^()]*\)[^;{}()]*)*?(#(8b5cf6|7c3aed|6d28d9|a855f7|9333ea|6366f1|4f46e5|a78bfa|c084fc|d946ef|818cf8)\b|\b(purple|violet|indigo|magenta)\b)/gi,
    m => add('purple-gradient', 'med', L(m.index), 'Purple/indigo gradient: the default "AI startup" color move.', 'Pick one brand accent and use it flat. Gradients only with a reason.'));

  // Big blur blobs / glow
  each(/filter\s*:\s*blur\(\s*(\d+)px/gi, m => { if (+m[1] >= 40) add('glow-blob', 'med', L(m.index), `Large blur (${m[1]}px): background glow / aurora blob.`, 'Remove decorative glow. Dark mode is fine; glowing fog is the tell.'); });
  each(/box-shadow\s*:\s*0\s+0\s+(\d+)px[^;\n]*?(#|rgba?\(|hsla?\()/gi, m => { if (+m[1] >= 15) add('neon-glow', 'low', L(m.index), 'Neon glow box-shadow.', 'Use a subtle elevation shadow or none.'); });

  // Fonts
  each(/(Playfair Display|Instrument Serif|DM Serif Display)/g, m => add('serif-hero-font', 'low', L(m.index), `"${m[1]}": the stock AI-landing-page hero serif.`, 'Fine if chosen on purpose. Otherwise use one or two typefaces, often a good sans.'));

  // Tailwind / class-string checks
  const classes = classStrings(text);
  const seenCls = new Map();
  const accentFamilies = new Set();
  let sideTabs = 0, sideTabColors = new Set(), firstSideTab = 0;
  for (const { cls, index, end } of classes) {
    const has = re => re.test(cls);
    if (has(/\bbg-clip-text\b/) && has(/\btext-transparent\b/)) add('gradient-text', 'high', L(index), 'Gradient-filled text (bg-clip-text text-transparent).', 'Set the headline in one flat color.');
    if (has(/\b(bg-gradient-to-|bg-linear-|bg-radial|bg-conic)/) && has(/\b(from|via|to)-(purple|violet|indigo|fuchsia)-\d{2,3}\b/))
      add('purple-gradient', 'med', L(index), 'Purple/indigo/violet Tailwind gradient.', 'Pick one brand accent and use it flat.');
    if (has(/\bblur-(2xl|3xl|\[\d{2,3}px\])/) && has(/\brounded-full\b/)) add('glow-blob', 'med', L(index), 'Blurred rounded blob: background aurora glow.', 'Remove decorative glow.');
    if (has(/\b(shadow|drop-shadow)-\[0_0_\d+px/)) add('neon-glow', 'low', L(index), 'Neon glow shadow.', 'Use a subtle elevation shadow or none.');
    if (has(/\buppercase\b/) && has(/\btracking-(wide|wider|widest|\[)/) && has(/\btext-(xs|sm|\[1[0-3]px\])\b/)) {
      // Only an "eyebrow" when a big heading follows right after; otherwise it's a normal app label.
      const aboveHeading = isMarkup && /<h[12]\b/i.test(text.slice(end, end + 400));
      add('eyebrow-label', aboveHeading ? 'med' : 'low', L(index),
        aboveHeading ? 'Eyebrow label (tiny, uppercase, letter-spaced) directly above a headline.' : 'Tiny uppercase letter-spaced label.',
        aboveHeading ? 'Drop it; fold the word into the headline if it matters.' : 'Fine for table headers/nav groups; avoid as decoration above headlines.');
    }
    if (has(/\bfont-serif\b/) && has(/\bitalic\b/) && has(/\btext-(5xl|6xl|7xl|8xl|9xl)\b/))
      add('serif-hero-font', 'med', L(index), 'Oversized italic serif hero headline.', 'Use one or two typefaces; usually a sans for the hero.');
    if (has(/\brounded-full\b/) && has(/\b(h|w|size)-(1\.5|2|2\.5|3)\b/) && has(new RegExp(`\\bbg-(${ACCENTS})-\\d{3}\\b`)))
      add('status-dot', has(/\banimate-(pulse|ping)\b/) ? 'med' : 'low', L(index), 'Decorative colored status dot.', 'Only show a dot for real, live status. Otherwise use a text label or nothing.');
    if (has(/\bborder-l-(2|4|8|\[\d+px\])(?=\s|$)/)) {
      sideTabs++; if (!firstSideTab) firstSideTab = index;
      const c = cls.match(new RegExp(`\\bborder-(?:l-)?(${ACCENTS})-\\d{3}\\b`)); if (c) sideTabColors.add(c[1]);
    }
    for (const fm of cls.matchAll(new RegExp(`\\b(?:text|bg|border|from|via|to|ring|shadow)-(${ACCENTS})-(300|400|500)\\b`, 'g'))) accentFamilies.add(fm[1]);
    // identical card detection
    if (has(/\brounded-(lg|xl|2xl|3xl)\b/) && has(/\b(border|shadow|shadow-\w+)\b/) && has(/\bp-\d/)) {
      const key = cls.trim().split(/\s+/).sort().join(' ');
      const e = seenCls.get(key) || { n: 0, index }; e.n++; seenCls.set(key, e);
    }
  }
  if (sideTabs >= 2) add('side-tab-accent', sideTabColors.size >= 2 ? 'med' : 'low', L(firstSideTab), `${sideTabs} cards with a colored left-edge tab${sideTabColors.size >= 2 ? ` in ${sideTabColors.size} different colors` : ''}.`, 'Drop the tabs or use one neutral accent across the system.');
  const darkBg = /\bbg-(black|(slate|zinc|neutral|gray|stone)-9[05]0|\[#0)/.test(text) || /background(-color)?\s*:\s*#(0[0-9a-f]{5}|000|111)\b/i.test(text);
  if (darkBg && accentFamilies.size >= 4) add('neon-palette', 'med', 1, `Dark background with ${accentFamilies.size} bright accent hues (${[...accentFamilies].join(', ')}).`, 'Pick one accent. Use it with restraint.');
  for (const [, e] of seenCls) if (e.n >= 3) add('identical-cards', 'low', L(e.index), `${e.n} card elements with identical styling (literal repeats; mapped lists count once).`, 'Vary section layouts. Not every group needs a card, and never cards inside cards.');

  lintUIExtra(text, isMarkup, isStyle, classes, L, add);
  if (!isMarkup) return;

  // Copy-in-markup checks
  let numbered = 0, firstNum = 0, stats = 0, firstStat = 0, initials = 0, firstInit = 0, emojis = 0, firstEmoji = 0;
  for (const { text: t, index } of textNodes(text)) {
    // a leading dash is a normal attribution ("— Jane Doe"), so only flag mid-label dashes
    if (/\S\s*—/.test(t) && wordCount(t) <= 6) add('em-dash-label', 'med', L(index), `Em dash in a short UI label: "${t.slice(0, 40)}".`, 'Use a plain hyphen, colon, or rewrite.');
    if (/^0[1-9]\.?$/.test(t)) { numbered++; if (!firstNum) firstNum = index; }
    if (/^[~≈]?\$?\d[\d,.]*\s*(\+|%|x|×|[kKMB]\+?)$/.test(t)) { stats++; if (!firstStat) firstStat = index; }
    if (/^[—–-]?\s*[A-Z][a-z]+ [A-Z]\.$/.test(t)) { initials++; if (!firstInit) firstInit = index; }
    if (EMOJI.test(t)) { emojis++; if (!firstEmoji) firstEmoji = index; }
    if (/\*\*[^*]+\*\*|^#{1,3}\s|^\s*[-*]\s+\*\*/.test(t)) add('markdown-bleed', 'med', L(index), `Markdown syntax in rendered UI text: "${t.slice(0, 40)}".`, 'Use real markup (<strong>, headings) or plain text.');
  }
  if (numbered >= 2) add('decorative-numbering', 'med', L(firstNum), `"01 / 02 / 03" labels (${numbered}).`, 'Let the content carry the order. Use verb-led step labels instead.');
  if (stats >= 3) add('unsourced-stats', 'low', L(firstStat), `Stats bar: ${stats} bare figures ("10k+", "99%").`, 'Keep only numbers you can source, and say where they come from.');
  if (initials >= 2) add('fake-testimonials', 'med', L(firstInit), `${initials} testimonial names in "First L." form.`, 'Real testimonials need a full name, role and photo, or cut them.');
  if (emojis >= 3) add('emoji-ui', 'med', L(firstEmoji), `${emojis} text nodes containing emoji (emoji used as icons/decoration).`, 'Use real icons, or nothing.');
}

// Patterns from impeccable.style/slop, Nutlope/hallmark, utsubo, adriankrebs.ch design-slop.
function lintUIExtra(text, isMarkup, isStyle, classes, L, add) {
  const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) fn(m); };
  const once = (re, rule, sev, msg, fix) => { const m = re.exec(text); re.lastIndex = 0; if (m) add(rule, sev, L(m.index), msg, fix); };

  // Default fonts
  once(/font-family\s*:\s*["']?(Inter|Geist)\b|\bfrom\s+["']next\/font\/google["'][^;\n]*|\b(Inter|Geist)\s*\(\s*\{/g,
    'overused-font', 'low', 'Inter/Geist as the typeface: the default AI-generated look.', 'Fine if chosen on purpose. Otherwise pair a distinct display face with a body face.');
  // Glassmorphism
  const glass = (text.match(/\bbackdrop-blur(-\w+)?\b|backdrop-filter\s*:\s*blur/g) || []).length;
  if (glass >= 3) once(/\bbackdrop-blur(-\w+)?\b|backdrop-filter\s*:\s*blur/g, 'glassmorphism', 'med', `Frosted-glass blur used ${glass} times.`, 'Keep blur only where it conveys depth over real content.');
  // Hard offset (neobrutalist) shadow
  each(/box-shadow\s*:\s*(-?\d+)px\s+(-?\d+)px\s+0(px)?\s/gi, m => { if (Math.abs(+m[1]) >= 4 || Math.abs(+m[2]) >= 4) add('hard-offset-shadow', 'low', L(m.index), 'Hard offset shadow (no blur): the neobrutalist default.', 'Use it only as a deliberate brand choice.'); });
  // Repeating stripes / decorative grid
  each(/repeating-(linear|radial)-gradient/gi, m => add('decorative-texture', 'low', L(m.index), 'Repeating-gradient stripes as filler texture.', 'Remove decorative texture unless it is part of the brand.'));
  once(/background-size\s*:\s*\d+px\s+\d+px[^}]*linear-gradient|linear-gradient[^}]*background-size\s*:\s*\d+px\s+\d+px|\bbg-grid(-\w+)?\b|bg-\[linear-gradient\(to_right/g,
    'decorative-grid', 'low', 'Decorative grid-line background.', 'Remove it, or use a real image or texture with a reason.');
  // Extreme radius
  each(/border-radius\s*:\s*(3[2-9]|[4-9]\d)px|\brounded-\[(3[2-9]|[4-9]\d)px\]/gi, m => add('extreme-radius', 'low', L(m.index), 'Very large corner radius on a container.', 'Use the system radius; large radii squeeze content.'));
  // Bounce / elastic easing
  each(/cubic-bezier\(\s*[-\d.]+\s*,\s*(-?[\d.]+)\s*,\s*[-\d.]+\s*,\s*(-?[\d.]+)\s*\)/gi, m => { if (+m[1] > 1 || +m[2] > 1 || +m[1] < 0 || +m[2] < 0) add('bounce-easing', 'low', L(m.index), 'Overshooting (bounce/elastic) easing curve.', 'Use an ease-out curve for routine UI motion.'); });
  // Marquee / blinking cursor
  once(/\banimate-marquee\b|@keyframes\s+marquee|<marquee\b/gi, 'marquee', 'low', 'Auto-scrolling marquee.', 'Show logos/text statically, or add a pause control.');
  once(/\banimate-(blink|caret)\b|@keyframes\s+(blink|caret)/gi, 'blinking-cursor', 'low', 'Decorative blinking cursor.', 'Remove it from static text.');
  // Animate-on-scroll everywhere
  const scrollAnims = (text.match(/\bwhileInView\b|\bdata-aos=|\buseInView\(|\banimate-fade-(in|up)\b/g) || []).length;
  if (scrollAnims >= 4) once(/\bwhileInView\b|\bdata-aos=|\buseInView\(|\banimate-fade-(in|up)\b/g, 'scroll-reveal-everywhere', 'low', `${scrollAnims} scroll-reveal animations.`, 'One orchestrated entrance; let the rest just be there.');
  // z-index 9999, 100vw
  each(/z-index\s*:\s*9{3,}|\bz-\[9{3,}\]/g, m => add('magic-z-index', 'low', L(m.index), 'z-index: 9999.', 'Use a named z-index scale.'));
  each(/\bwidth\s*:\s*100vw/g, m => add('width-100vw', 'low', L(m.index), 'width: 100vw (overflows when a scrollbar is present).', 'Use width: 100% with container padding.'));
  // Mixed icon sets
  const sets = new Set();
  for (const m of text.matchAll(/from\s+["'](lucide-react|@heroicons\/react[^"']*|react-icons[^"']*|@mui\/icons-material[^"']*|@phosphor-icons\/react|@tabler\/icons-react|@radix-ui\/react-icons)["']/g)) sets.add(m[1].split('/')[0]);
  if (sets.size >= 2) add('mixed-icon-sets', 'med', 1, `Icons from ${sets.size} different sets (${[...sets].join(', ')}).`, 'Pick one icon set.');

  if (!isMarkup) return;
  // Class-based layout tells
  let iconTiles = 0, firstTile = 0;
  const sectionPy = [];
  for (const { cls, index, end } of classes) {
    const has = re => re.test(cls);
    const next = text.slice(end, end + 400);
    if (has(/\brounded-full\b/) && has(/\bpx-[2-4]\b/) && has(/\btext-(xs|sm)\b/) && (has(/\bborder\b/) || has(/\bbg-/)) && /<h1\b/i.test(next))
      add('badge-above-headline', 'med', L(index), 'Pill badge directly above the main headline.', 'Drop it; put the news in the headline or below it.');
    if (has(/\b(h|w|size)-(8|10|12|14)\b/) && has(/\brounded-(md|lg|xl|2xl)\b/) && has(/\bjustify-center\b/) && has(/\bbg-/) && /<h[2-4]\b/i.test(next.slice(0, 250))) {
      iconTiles++; if (!firstTile) firstTile = index;
    }
    if (has(/\bborder\b/) && has(/\bshadow-(xl|2xl)\b/) && has(/\brounded-/)) add('ghost-card', 'low', L(index), 'Hairline border plus wide soft shadow on the same card.', 'Pick one: a border or an elevation.');
    if (has(/\bmin-h-screen\b/) && has(/\btext-center\b/) && has(/\bjustify-center\b/)) add('centered-fullscreen-hero', 'low', L(index), 'Full-viewport, fully centered hero.', 'Size the hero to its content; consider a left-aligned layout with real copy.');
    if (/<section\b[^>]*$/.test(text.slice(Math.max(0, index - 60), index))) {
      const py = cls.match(/\bpy-(\d+)\b/); if (py) sectionPy.push({ v: py[1], index });
    }
  }
  if (iconTiles >= 3) add('icon-tile-cards', 'med', L(firstTile), `${iconTiles} feature cards with an icon tile stacked above the heading.`, 'Vary icon placement or drop the icons; lead with the most important item.');
  if (sectionPy.length >= 4 && sectionPy.every(s => s.v === sectionPy[0].v)) add('monotonous-spacing', 'low', L(sectionPy[0].index), `All ${sectionPy.length} sections use py-${sectionPy[0].v}.`, 'Vary vertical rhythm to reflect content weight.');
  // Fake browser chrome: three traffic-light dots
  once(/bg-red-\d00[^>]*>[\s\S]{0,200}?bg-yellow-\d00[^>]*>[\s\S]{0,200}?bg-green-\d00/g, 'fake-browser-chrome', 'low', 'Hand-drawn browser window chrome (traffic-light dots).', 'Show a real screenshot with minimal framing.');
  // Generic alt text
  each(/\balt\s*=\s*["'](image|img|photo|picture|screenshot|logo|icon|banner)["']/gi, m => add('generic-alt', 'low', L(m.index), `Generic alt text "${m[1]}".`, 'Describe what the image shows, or use alt="" if decorative.'));
  // One colored word in the headline
  once(new RegExp(`<h1\\b[^>]*>[^<]*<span\\b[^>]*class(Name)?=["'{\`][^"'\`]*\\b(text-(${ACCENTS})-\\d{3}|text-primary|bg-clip-text)`, 'g'),
    'colored-headline-word', 'low', 'One accent-colored word inside the hero headline.', 'Set the headline in one color; use weight or size for emphasis.');
}

// Text nodes with inline tags (<br>, <em>, <span> …) merged, so "A wider lens.<br/>A clearer picture." reads as one line.
function flatTextNodes(text) {
  const flat = stripScriptStyle(text).replace(/<\/?(br|em|strong|b|i|span|small|mark|u|sup|sub)\b[^<>]*?\/?>/gi, s => ' '.repeat(s.length));
  const out = [];
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(flat))) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t) out.push({ text: t, index: m.index + 1 });
    re.lastIndex = m.index + m[0].length - 1;
  }
  return out;
}

// Tells found testing on a real app: stacked slogans, typed capitals, one font size, ignored tokens.
function lintDesignSystem(text, ext, starts, add) {
  const L = idx => lineOf(starts, idx);
  if (MARKUP_EXT.has(ext)) {
    // Two-beat slogans: "Facts stay. Framing changes." Every sentence 1-5 words.
    const slogans = [];
    for (const { text: t, index } of flatTextNodes(text)) {
      const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4 && wordCount(t) <= 10
        && parts.every(p => /^[A-Z]/.test(p) && /[.!?]$/.test(p) && wordCount(p) >= 1 && wordCount(p) <= 4)) slogans.push({ t, index });
    }
    if (slogans.length >= 3) add('stacked-slogans', 'med', L(slogans[0].index), `${slogans.length} two-beat slogans ("${slogans.slice(0, 3).map(s => s.t).join('", "')}").`, 'Keep one tagline. Replace the rest with plain description of what the product does, or delete them.');

    // Capitals typed into copy instead of text-transform.
    const caps = new Map();
    const isCaps = s => {
      const words = s.trim().split(/\s+/);
      const letters = s.replace(/[^A-Za-z]/g, '');
      return words.length >= 2 && letters.length >= 8 && letters === letters.toUpperCase() && words.some(w => w.replace(/[^A-Z]/g, '').length >= 5);
    };
    for (const { text: t, index } of textNodes(text)) if (isCaps(t) && !caps.has(t)) caps.set(t, index);
    for (const m of text.matchAll(/(["'`])([A-Z][A-Z0-9 &'’,·:-]{7,60})\1/g)) if (isCaps(m[2]) && !caps.has(m[2])) caps.set(m[2], m.index);
    if (caps.size >= 3) {
      const [first] = caps.values();
      add('typed-caps', 'med', L(first), `${caps.size} labels typed in ALL CAPS (${[...caps.keys()].slice(0, 3).map(s => `"${s}"`).join(', ')}).`, 'Write labels in sentence case and apply text-transform: uppercase in CSS, so screen readers and copy-paste get normal text. Then ask whether each label is needed at all.');
    }
  }
  if (STYLE_EXT.has(ext)) {
    // One font size for almost everything.
    const sizes = [...text.matchAll(/font-size\s*:\s*([^;}\n]+)/gi)].map(m => ({ v: m[1].trim().replace(/\s*!important$/, ''), index: m.index }));
    if (sizes.length >= 20) {
      const counts = new Map(); for (const s of sizes) counts.set(s.v, (counts.get(s.v) || 0) + 1);
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n / sizes.length >= 0.5) add('flat-type-scale', 'med', L(sizes.find(s => s.v === top).index), `font-size ${top} is used in ${n} of ${sizes.length} declarations.`, 'Define a small type scale (meta, UI, body, lede) as tokens and use body size for reading text.');
    }
    // Color tokens declared, then bypassed with raw values.
    const tokenDecl = /--[\w-]+\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\()/gi;
    const tokens = (text.match(tokenDecl) || []).length;
    const noDecls = text.replace(/--[\w-]+\s*:[^;}]+/g, '');
    const raw = noDecls.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [];
    const distinct = new Set(raw.map(h => h.toLowerCase())).size;
    const varUses = (noDecls.match(/var\(--/g) || []).length;
    if (tokens >= 3 && distinct >= 25 && raw.length > varUses) {
      const first = text.search(/#[0-9a-f]{3,6}\b/i);
      add('token-bypass', 'med', L(Math.max(0, first)), `${tokens} color tokens declared, but ${distinct} distinct raw hex colors used (${raw.length} raw vs ${varUses} var() uses).`, 'Collapse near-duplicate colors into a handful of tokens and use var(--token) everywhere.');
    }
  }
}

// AI code tells: comments, logs, placeholders (sources: code-slop skill, dev.to, coops essay).
function lintCode(text, ext, starts, add) {
  if (!CODE_EXT.has(ext)) return;
  const L = idx => lineOf(starts, idx);
  const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) fn(m); };
  each(/^[ \t]*[})\]]+;?[ \t]*(\/\/|#)[ \t]*end\b/gim, m => add('closing-brace-label', 'low', L(m.index), 'Closing-brace label ("} // end ...").', 'Delete it; if the block needs one, split the function.'));
  const steps = [...text.matchAll(/(\/\/|#|\/\*)[ \t]*Step[ \t]*\d+[ \t]*[:.)-]/gi)];
  if (steps.length >= 3) add('step-comments', 'low', L(steps[0].index), `${steps.length} "// Step N:" comments.`, 'Delete them, or extract named helpers so the names carry the steps.');
  each(/(\/\/|#|\/\*|^\s*\*)[^\n]*\b(optimi[sz]ed for (performance|speed)|blazing[- ]fast|production[- ]ready|highly scalable|enterprise[- ]grade|robust and scalable|best practices?)\b/gim,
    m => add('hype-comment', 'low', L(m.index), `Unbacked claim in a comment: "${m[2]}".`, 'Delete it, or state the concrete fact (data structure, benchmark).'));
  each(/(\/\/|#)[ \t]*(TODO:?[ \t]*)?(implement (this|me|here|the logic)|your code here|add (your )?(logic|code|implementation) here|rest of (the )?code)\b/gi,
    m => add('placeholder-stub', 'med', L(m.index), 'Placeholder comment: unfinished stub.', 'Implement it, or remove it and file a real ticket.'));
  let emojiLogs = 0, firstEmojiLog = -1;
  for (const m of text.matchAll(/\b(console\.(log|info|warn|error|debug)|print|logger\.\w+|logging\.\w+|log\.\w+)\s*\(([^)\n]*)/g)) {
    if (EMOJI.test(m[3])) { emojiLogs++; if (firstEmojiLog < 0) firstEmojiLog = m.index; }
  }
  if (emojiLogs >= 2) add('emoji-logs', emojiLogs >= 4 ? 'med' : 'low', L(firstEmojiLog), `${emojiLogs} log/print calls with emoji ("✅ Success!").`, 'Plain log text at the right level.');
  each(/catch\s*\(\s*\w*\s*\)\s*\{\s*console\.(log|error)\(\s*["'`](An )?(error|something went wrong)[^"'`]*["'`]\s*(,\s*\w+\s*)?\)\s*;?\s*\}/gi,
    m => add('swallowed-error', 'low', L(m.index), 'Catch block that only logs a generic message.', 'Catch specific errors, add context, or let it propagate.'));
  each(/except\s+Exception(\s+as\s+\w+)?\s*:\s*\n\s*print\(\s*f?["'](An )?(error|something went wrong)/gi,
    m => add('swallowed-error', 'low', L(m.index), 'except Exception that only prints a generic message.', 'Catch specific errors, add context, or let it propagate.'));
}

// ---------- driver ----------

function readSource(file, maxBytes) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > maxBytes) return null;
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  } catch { return null; }
}

function lintText(file, text) {
  const ext = path.extname(file).toLowerCase();
  // Opt-outs: "slop-lint-disable-file" anywhere; "slop-lint-disable-line" on the line;
  // "slop-lint-disable-next-line" on the line above.
  if (text.includes('slop-lint-disable-file')) return [];
  const starts = lineStarts(text);
  const findings = [];
  const add = (rule, sev, line, msg, fix) => findings.push({ file, line, rule, sev, msg, fix });
  try { lintProse(text, ext, starts, add); } catch (e) { add('internal', 'low', 1, `prose check failed: ${e.message}`, ''); }
  try { lintUI(text, ext, starts, add); } catch (e) { add('internal', 'low', 1, `ui check failed: ${e.message}`, ''); }
  try { lintCode(text, ext, starts, add); } catch (e) { add('internal', 'low', 1, `code check failed: ${e.message}`, ''); }
  try { lintDesignSystem(text, ext, starts, add); } catch (e) { add('internal', 'low', 1, `design-system check failed: ${e.message}`, ''); }
  if (!text.includes('slop-lint-disable-')) return findings;
  const lines = text.split('\n');
  return findings.filter(f => !(lines[f.line - 1] || '').includes('slop-lint-disable-line')
    && !(lines[f.line - 2] || '').includes('slop-lint-disable-next-line'));
}

function lintFile(file, maxBytes = MAX_BYTES) {
  const text = readSource(file, maxBytes);
  return text == null ? [] : lintText(file, text);
}

// Explicit roots are always walked; SKIP_DIRS applies only to children.
function walk(p, out, isRoot = false) {
  let st; try { st = fs.statSync(p); } catch { return false; }
  if (st.isDirectory()) {
    if (!isRoot && SKIP_DIRS.has(path.basename(p))) return true;
    for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  } else if (SUPPORTED.has(path.extname(p).toLowerCase())) out.push(p);
  else if (isRoot) process.stderr.write(`slop-lint: skipping unsupported file type: ${p}\n`);
  return true;
}

function summarize(findings, maxLow = 8) {
  // Collapse per-hit ai-vocab noise.
  const byFile = new Map();
  for (const f of findings) { if (!byFile.has(f.file)) byFile.set(f.file, []); byFile.get(f.file).push(f); }
  const lines = [];
  for (const [file, fs_] of byFile) {
    lines.push(file);
    fs_.sort((a, b) => SEV[b.sev] - SEV[a.sev] || a.line - b.line);
    let vocab = 0;
    for (const f of fs_) {
      if (f.rule === 'ai-vocab') { vocab++; if (vocab > maxLow) continue; }
      lines.push(`  ${String(f.line).padStart(4)}  ${f.sev.padEnd(4)}  ${f.rule}: ${f.msg}`);
      if (f.fix) lines.push(`              fix: ${f.fix}`);
    }
    if (vocab > maxLow) lines.push(`              (+${vocab - maxLow} more ai-vocab hits)`);
  }
  return lines.join('\n');
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// Line ranges touched by an Edit/MultiEdit, located by searching for each new_string.
function editedRanges(text, ti) {
  const news = Array.isArray(ti.edits) ? ti.edits.map(e => e && e.new_string) : [ti.new_string];
  const starts = lineStarts(text);
  const ranges = [];
  for (const raw of news) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const s = raw.replace(/\r\n?/g, '\n');
    let from = 0, i;
    while ((i = text.indexOf(s, from)) !== -1) {
      ranges.push([lineOf(starts, i), lineOf(starts, i + s.length - 1)]);
      from = i + s.length;
    }
  }
  return ranges;
}

async function hookMode() {
  if (process.env.AI_TELLS_HOOK === '0') return;
  let input;
  try { input = JSON.parse(await readStdin()); } catch { return; }
  const ti = (input && input.tool_input) || {};
  const file = ti.file_path || ti.path;
  if (typeof file !== 'string' || !HOOK_SUPPORTED.has(path.extname(file).toLowerCase())) return;
  const text = readSource(file, HOOK_MAX_BYTES);
  if (text == null) return;
  const min = SEV[process.env.AI_TELLS_HOOK_MIN || 'med'] || SEV.med;
  let findings = lintText(file, text).filter(f => SEV[f.sev] >= min);
  // For edits, only report what's in the changed lines, so pre-existing findings aren't re-sent on every edit.
  const isEdit = input.tool_name === 'Edit' || input.tool_name === 'MultiEdit' || 'new_string' in ti || Array.isArray(ti.edits);
  if (isEdit) {
    const ranges = editedRanges(text, ti);
    findings = findings.filter(f => ranges.some(([a, b]) => f.line >= a && f.line <= b));
  }
  if (!findings.length) return;
  const shown = findings.sort((a, b) => SEV[b.sev] - SEV[a.sev]).slice(0, 15);
  const ctx = `[ai-tells] ${findings.length} AI-tell finding(s) in ${path.basename(file)}${isEdit ? ' (edited lines only)' : ''}. These are heuristics; fix the ones that are real, ignore false positives, and don't overcorrect (see the human-writing / human-ui skills).\n` + summarize(shown, 0);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ctx.slice(0, 9000) } }));
}

function cliMode(args) {
  const usage = () => { process.stderr.write('usage: slop-lint <file-or-dir>... [--json] [--min=low|med|high]\n'); process.exitCode = 2; };
  let json = false, minArg = 'low';
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a.startsWith('--min=')) minArg = a.slice(6);
    else if (a === '--min') minArg = args[++i];
    else if (a.startsWith('--')) { process.stderr.write(`slop-lint: unknown option ${a}\n`); return usage(); }
    else targets.push(a);
  }
  const min = SEV[minArg];
  if (!targets.length || !min) return usage();
  const files = [];
  for (const t of targets) if (!walk(t, files, true)) { process.stderr.write(`slop-lint: no such file or directory: ${t}\n`); process.exitCode = 2; return; }
  const findings = files.flatMap(f => lintFile(f)).filter(f => SEV[f.sev] >= min);
  if (json) process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  else if (findings.length) {
    const counts = { high: 0, med: 0, low: 0 }; for (const f of findings) counts[f.sev]++;
    process.stdout.write(summarize(findings) + `\n\n${findings.length} finding(s) in ${files.length} file(s): ${counts.high} high, ${counts.med} med, ${counts.low} low\n`);
  } else process.stdout.write(`No AI tells at/above "${minArg}" in ${files.length} file(s).\n`);
  process.exitCode = findings.length ? 1 : 0;
}

const argv = process.argv.slice(2);
if (argv.includes('--hook')) hookMode().catch(() => {}).finally(() => { process.exitCode = 0; });
else cliMode(argv);
