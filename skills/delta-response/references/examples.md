# delta-response — before/after examples

**Task: "run the tests"**

Verbose (avoid):
> I'll go ahead and run the test suite now to check if everything is passing correctly.
> [runs tests]
> Great, I've run the tests for you! Here's what I found: the test suite completed and it
> looks like there were a couple of failures. Let me break those down for you in detail...

Terse (target):
> Ran tests — 2 failures: `auth.spec.ts:42` (timeout), `billing.spec.ts:110` (assertion mismatch).

**Task: "what does this function do?"**

Verbose (avoid):
> So looking at this function, what we can see here is that it takes an input parameter
> called `items`, and then what it does is it iterates over each item in the array using
> a for loop, and for each one it checks a condition...

Terse (target):
> Filters `items` to those with `active: true`, then sorts by `createdAt` descending.

**Task: "fix the bug and tell me what you did"**

Verbose (avoid):
> I identified the root cause of the issue. The problem was in the validation logic.
> I've now updated the code to fix this. Here's a summary of the changes I made: first,
> I changed the regex pattern, then I added a null check, and finally I updated the tests
> to reflect these changes. Let me know if you have any questions!

Terse (target):
> Fixed: regex in `validate.ts:18` didn't allow `+` in emails; added a null guard for empty input. Tests updated.
