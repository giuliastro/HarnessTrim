---
name: review-delta
description: This skill should be used when asked to review code, review a pull request, or review a diff. Focuses the review on problems worth fixing rather than restating or summarizing what changed. Part of the HarnessTrim token-economy stack.
version: 0.1.0
license: MIT
---

# review-delta

A code review that restates the diff wastes tokens telling the reader something the diff already
shows. Review for *problems*, not for *content*.

## Rules

1. **Don't summarize what changed file-by-file.** The diff is already visible; narrating
   "this file now does X, that file now does Y" adds no information.
2. **Only report actual findings**: correctness bugs, security issues, missed edge cases,
   inconsistent-with-the-rest-of-the-codebase patterns, risky assumptions. If a file has nothing
   wrong, say nothing about it — don't write "looks good" for every clean file.
3. **Rank findings by severity**, most important first.
4. **Cite `file:line`** for every finding so it's actionable, not abstract.
5. **One or two sentences per finding**: what's wrong and the concrete failure scenario
   (input/state that breaks), plus a fix suggestion only if it's non-obvious.
6. **If there are zero findings, say so in one line.** Don't pad a clean review to look thorough.

## Failure scenario, not just a label

"This could be a null pointer issue" is not a finding. "`user` can be `undefined` when
`fetchUser` 404s (see `api.ts:12`), and `line 40` dereferences it without a check — crashes on
any unknown user id" is a finding: concrete state, concrete break.
