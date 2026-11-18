---
description: Review a repo, folder or file for AI tells without changing anything
argument-hint: "[path] (default: current directory)"
allowed-tools: Bash(node:*), Read, Grep, Glob, Agent
---

Target: $ARGUMENTS (if empty, use the current directory `.`)

This is a read-only review. Do not create, edit, move or delete any file. Do not use Edit, Write or NotebookEdit, and do not run shell commands that write files. If you spot something worth fixing, report it; the user can run `/ai-tells:deslop` afterwards.

1. Run the linter for an overview:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/slop-lint.mjs" <target> --min=med --json`
   Summarize from the JSON in your head: total findings, the top rules by count, and the 10 files with the most findings. Exit code 1 just means findings exist.
2. Hand the judgment pass to the read-only `ai-tells:slop-reviewer` agent (it has no Edit or Write tools). Give it:
   - the target path,
   - the 10 worst files from step 1 (or every file, if there are 10 or fewer),
   - the instruction to also look for tells the linter can't see (padding, vague claims, sections that all look the same, missing real images, made-up stats or testimonials, narrating comments, needless abstractions).
   For a large repo, you may run up to three reviewer agents in parallel on separate folders.
3. Report to the user:
   - a one-line verdict for the whole target: `clean`, `minor tells` or `reads as AI`;
   - the linter summary (counts by severity, top rules, worst files);
   - the reviewer's findings, most important first, as `file:line — tell — suggested fix`;
   - the decisions only a human can make (real photos, real testimonials, choosing an accent color);
   - one line saying `/ai-tells:deslop <path>` will apply fixes if they want them.
