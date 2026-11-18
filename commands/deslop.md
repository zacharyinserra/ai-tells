---
description: Find and fix AI tells in prose, UI or code files
argument-hint: <file-or-dir> [--review-only]
allowed-tools: Read, Edit, Grep, Glob, Bash(node:*)
---

Target: $ARGUMENTS

1. Run the linter:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/slop-lint.mjs" <target> --min=low`
2. Load the `human-writing` skill for prose files, the `human-ui` skill for UI files (HTML/CSS/JSX/TSX/Vue/Svelte/Astro), and the `human-code` skill for code (JS/TS/Python).
3. Read each flagged file in full. Linter hits are leads, not verdicts: skip false positives, and also catch tells the linter can't see (padding, vague claims, identical section layouts, missing real images, fabricated stats or testimonials).
4. If `--review-only` is in the arguments, stop here and report findings as `file:line — tell — proposed fix`.
5. Otherwise fix the real tells with minimal edits. Rewrite sentences; don't swap synonyms. Don't strip every em dash. Never invent facts, names, numbers, quotes or images; where real content is missing, leave a clearly marked TODO for the human and list it.
6. Re-run the linter with `--min=med` and report: what changed, what remains and why, and the TODOs that need a human.
