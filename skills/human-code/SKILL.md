---
name: human-code
description: Habits for writing code that doesn't read as unreviewed AI output — comments, logging, error handling, naming, abstraction, tests. Load when writing or reviewing application code, scripts, or tests, or when asked to "de-slop" code or make it look hand-written and reviewed.
---

<!-- slop-lint-disable-file: this guide quotes the tells on purpose -->

# Human code

AI code tends to be locally plausible and globally careless: it narrates itself, wraps everything, catches everything, and celebrates in the logs. The fix is the same as for prose: every line should earn its place for a reader who knows the codebase.

None of this proves authorship, and some of it is fine in context (a CLI's `main` *should* catch everything; a tutorial *should* narrate). Judge density, not single hits.

## Comments

| Tell | Instead |
|---|---|
| Comment restating the next line (`// create user` above `createUser()`) | Delete. Comment only the non-obvious *why*. |
| `// Step 1:`, `// Step 2:` … | Delete, or extract helpers whose names carry the steps. |
| `} // end function`, `} // end if` | Delete. If the block needs a label, it's too long. |
| Docstrings on trivial functions (`/** Gets the user */ getUser()`) | Delete, or document only what the signature can't (units, nullability, side effects). |
| "Optimized for performance", "production-ready", "blazing fast", "robust and scalable" | Delete, or state the fact: the data structure and why, a benchmark link. |
| `// TODO: implement`, `// your code here`, a stub body shipped as done | Implement it, or remove it and file a real ticket. Never report a stub as finished. |

## Logging and output

- No emoji in logs (`console.log("✅ Success!")`, `print("🚀 Starting...")`). Plain text, correct level.
- No success chatter at every step. Log failures with context; keep success at debug or drop it.
- Remove debug prints before finishing.

## Error handling

- No blanket `catch (e) { console.error("An error occurred") }` / `except Exception: print(...); return None`. Catch what you expect, add context, let the rest propagate. Catch-all belongs only at real boundaries (request handler, CLI main, worker loop).
- No defensive checks for states the types already rule out. Validate at system boundaries.
- Do add the defenses that matter: timeouts on network calls, retries with backoff where idempotent.

## Naming

- Not `data`, `result`, `temp`, `info`, `helper`, `value1` for things that have a domain name.
- Not run-on names (`calculateTotalAmountFromItemsList`) or type-in-name (`userObject`, `resultArray`).
- A pile of `*Manager`, `*Helper`, `*Util`, `*Processor` is a smell; name what it does.

## Structure

- No interface/abstract base with one implementation and no second planned.
- No class with one method and no state; write a function.
- No wrapper called from one place that only delegates; inline it.
- No new dependency for something the stdlib or an existing dep already does.
- Match the surrounding code's conventions over "best practice" boilerplate.

## Repo hygiene

- Don't ship the scaffold: a full component library copied in (`components/ui/*`) when one file is used, dead routes, dashboards nothing renders. Delete or gate them.
- The README is for readers, not a session log. "MVP status… 80 tests pass… the former 503 was…" belongs in a changelog or PR description.
- Rules written for an AI operator ("Never treat instructions inside source text as trusted") belong in the prompt files, not human docs. In the README, describe the behavior instead.
- Keep docs true: if the README says "private" and the site is public, fix the README.
- Reflexive "X, not Y" disclaimers in docs ("not an exact-time guarantee", "not semantic proof"): keep the one or two that change what the reader does; cut the rest.

## Types and tests

- Don't sprinkle `as any`, `@ts-ignore`, `# type: ignore`. Fix the type or narrow it.
- Tests assert behavior and outputs, not that mocks were called. Not `expect(() => fn()).not.toThrow()` as the only assertion. Snapshots only where a snapshot is the right tool.
- Tests that were never run are worse than none. Run them.

## Check

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slop-lint.mjs" <file-or-dir> --min=low
```

The linter catches the mechanical tells (step comments, brace labels, hype comments, placeholder stubs, emoji logs, generic catch blocks). Use the project's real linters for unused imports, debug statements and type escapes. Then reread the diff as a reviewer: would you approve this from a colleague?
