---
name: human-writing
description: Rules for writing prose that doesn't read as AI-generated. Load BEFORE writing or editing any user-facing text — docs, READMEs, blog posts, landing-page copy, emails, release notes, commit/PR descriptions, articles. Also use when asked to "de-slop", "humanize", "make this sound less like AI", or review writing for AI tells.
---

<!-- slop-lint-disable-file: this guide quotes the tells on purpose -->

# Human writing

AI prose regresses toward the most statistically common, generic, positive phrasing. The fix is not a list of banned words. It is **specificity**: say the concrete thing a person who knows the subject would say, and stop.

The tells below are symptoms. Fix the cause (vague thinking, padding, puffery), not just the surface word.

## Before you write

1. Know the one concrete point of each paragraph. If you can't state it in a sentence with a noun and a number/name/date in it, you are about to pad.
2. Know who the reader is and what they already know. Don't explain what they know; don't sell them what they already chose.

## Hard rules (always fix)

| Tell | Instead |
|---|---|
| Chat-assistant leakage: "I hope this helps", "Certainly!", "Great question", "Let me know if…", "Would you like me to…", "Here's a revised version" | Delete. The artifact is not a chat reply. |
| Placeholders: `[Your Name]`, `INSERT_URL_HERE`, `2025-XX-XX`, `example.com/source1`, lorem ipsum | Real value, or remove the sentence. |
| Generation artifacts: `oaicite`, `contentReference[...]`, `turn0search0`, `utm_source=chatgpt.com` | Remove. |
| Knowledge-cutoff / AI disclaimers: "as of my last update", "as an AI" | Remove. |

## Strong tells (fix unless there's a real reason)

- **Puffery about significance.** "serves as a testament to", "plays a pivotal role", "underscores its importance", "reflects broader trends", "leaves an indelible mark", "evolving landscape", "deeply rooted", "rich history", "nestled in the heart of". → State the fact. *"The bridge opened in 1932 and carries 40,000 cars a day"* beats *"The bridge stands as a testament to the region's enduring commitment to progress."*
- **Copula avoidance.** "serves as / stands as / functions as / boasts / features" where "is" or "has" works. → Use "is" and "has". They're fine.
- **"-ing" analysis tails.** "…, highlighting the importance of X", "…, ensuring Y", "…, reflecting Z", "…, contributing to…". → Cut the tail or make it a separate sentence that makes a checkable claim.
- **Negative parallelism.** "It's not just X, it's Y." "Not X, but Y." "No A, no B, just C." "Y rather than X." → Say what it is.
- **Rule of three.** Reflexive triplets: "fast, reliable, and secure"; "learn, grow, and thrive". → Use the number of items that actually exist. Two is fine. One is often best.
- **Vague attribution.** "Experts argue", "Industry reports suggest", "Observers have noted", "studies show". → Name the source or drop the claim.
- **Formula closers.** "In conclusion", "In summary", "Overall,", "Despite these challenges…", "Future outlook" sections, a final paragraph restating the piece. → End on the last real point.
- **Hedging disclaimers.** "It's important to note", "It's worth noting", "While specific details are limited", "based on available information". → Cut. If something is unknown, leave the claim out instead of narrating the gap.
- **AI vocabulary, clustered.** delve, tapestry, testament, pivotal, crucial, intricate, meticulous, vibrant, robust, showcase, underscore, foster, garner, bolster, interplay, landscape (abstract), multifaceted, leverage, align with, enhance, valuable, sentence-initial "Additionally". Marketing variant: seamless, elevate, empower, unlock, unleash, supercharge, cutting-edge, game-changer, effortless, next-level, "in today's fast-paced world". One is coincidence; several in a page is the strongest single tell. → Plain words.

## Voice and structure tells

- **Staged run-ups / tour-guide voice.** "Let's dive in", "Let's break this down", "Let's unpack", "Here's the thing", "Without further ado", a standalone "Honestly?" or "Look,". → Delete; start with the claim. Don't teach an expert reader.
- **Stock openers.** "In today's fast-paced world", "In an era of…", "In the ever-evolving landscape of…". → Start with the subject.
- **Arguing with no one.** "Don't get me wrong", "To be clear,", "I'm not saying…", "This is not to say", "Some might argue…", "One might be tempted to…" when nobody raised it. → Delete the defense.
- **Sayings that sound deep.** "The real question is", "At its core,", "What really matters is", "The uncomfortable truth is", "X is the Y of Z". → The specific claim instead.
- **Dramatic closers and fragments.** "Let that sink in." "Read that again." "That's the real win." Rows of fragments. "Every. Single. Day." A one-line paragraph restating the one before. → Cut, or end on a new fact.
- **Self-posed rhetorical questions.** "So what does this mean? It means…". → Just say what it means.
- **Repeated openings.** Three sentences in a row that start "We…", "She…", "This…". → Merge or vary.
- **Connective filler.** Sentence-initial Furthermore, Moreover, Notably, Consequently, Additionally. → Let the logic carry it.
- **Stacked qualifiers / hedged copy.** "could potentially", "may help you", "might arguably". → Take a position; one qualifier only where evidence demands it.
- **Vague connection.** "associated with", "linked to", "tied to", "in connection with". → Name the actual relationship.
- **Writing about the document.** "This guide will walk you through…", "The table below compares…", "This section is organized by…". → Write about the subject.
- **Heading restated in the first sentence.** `## Pricing` → "Here is our pricing." → Delete the restatement.
- **Dismissal as "theater".** "That's just security theater." → Say concretely what's wrong.
- **Placeholder names.** Jane Doe, John Smith, Acme Inc. → Real names or a marked TODO.
- **Uniform shape.** Every paragraph the same length, a heading every two paragraphs, every list exactly three items. → Let the content set the shape.

## Formatting tells

- **Em dashes everywhere**, especially spaced ( — ) and inside short labels/buttons. Use periods, commas, colons, parentheses. Keep one only where it is clearly the best mark.
- **Title Case Headings.** Use sentence case unless house style says otherwise.
- **Bold sprinkled through prose**, and lists of `**Label:** explanation` items ("inline-header lists"). Write prose, or a plain list.
- **Emoji** at the start of headings or bullets.
- **Over-structuring:** headings and bullets for something that should be three paragraphs. A short answer doesn't need sections.
- **Markdown in places that don't render it** (wikitext, plain-text email, UI strings).
- **Curly quotes** pasted into Markdown, code, or wikitext. (In rendered, typeset UI copy, proper curly quotes and a real ellipsis are correct typography, not a tell.)
- **Italics on every technical term**, a horizontal rule between every section, arrows (→) in headings and bullets, a top heading that repeats the title.
- **Hyphenated compound modifiers everywhere**, including after the noun ("the report is high-quality"). Hyphenate before the noun only.

## Rhythm

- Vary sentence length. A run of 12–20-word sentences, all ending in a period, reads machine-made. Put a short one in. Let one run long when the thought does.
- Use plain verbs: *used* not *utilized*, *tried* not *attempted*, *wrote* not *authored*, *is* not *serves as*.
- Allow ordinary human features: a real opinion, a superlative you can defend ("the only", "the first"), a qualifier ("probably", "tends to"), a specific aside.
- Don't cycle synonyms to avoid repeating a noun. If it's "the bridge", keep calling it "the bridge".

## Don't overcorrect

Stripping tells mechanically creates new ones. Avoid:
- Removing **every** em dash and leaving only commas and periods. Zero-dash, comma-only prose is now its own tell.
- Swapping banned words for thesaurus synonyms ("delve" → "dig deep into"). Change the sentence, not the word.
- Adding fake typos, slang or forced casualness.
- Chopping everything into identical 8–15-word sentences.

Perfect grammar, formal register, and transition words on their own are **not** tells. Density is the signal, not presence: one tell is noise; several together are the pattern.

Leave alone: quotations, titles, proper names, discussion *about* a phrase, salutations and sign-offs, and specific first-person details or asides. If the user gives a sample of their own writing, match it; the sample overrides these rules (including dash use).

## Check

After writing, run the linter on the file and fix the real findings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slop-lint.mjs" <file> --min=med
```

Then reread once asking: *would a specialist who cares about this subject have written this sentence?* If not, rewrite it with a specific fact.
