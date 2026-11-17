---
name: adversarial-testing
description: Attack code with thorough edge-case tests to surface bugs, then fix what they expose. Use when I say /adversarial-testing or ask to stress, break, or adversarially test code.
argument-hint: "[path, symbol, or scope]"
disable-model-invocation: true
---

# Adversarial Testing

Your goal is to find bugs, not to raise coverage. Write tests that probe the
edges where the code is most likely wrong, then fix what they expose.

Test what I point at. If I name nothing, test the current branch's changes
against its base. If there are none, ask me what to test.

1. **Learn the contract.** Read the code, its callers, docs, and existing
   tests to work out what callers rely on. Test against that, not against what
   the code happens to do now. If the contract is unclear on a point that
   matters, ask me.
2. **Attack the edges.** Write the tests following the `testing` skill. Cover
   whichever of these apply:
   - Boundaries: empty, zero, one, the maximum, one past it, negative values.
   - Awkward input: whitespace, Unicode, emoji, very long input, duplicates,
     malformed data.
   - State and order: repeated calls, calls out of order, re-entry, reuse.
   - Race conditions: concurrent calls on shared state, gaps between a check
     and the action that relies on it, async results arriving out of order,
     cancellation partway through.
   - Failures: dependency errors, timeouts, partial results, cleanup.
   - Invariants: round trips, totals that must balance, ordering, uniqueness.
   - Environment: time zones, clock edges, locale, file paths.

   Stop when new tests in the riskiest areas stop finding anything.
3. **Triage failures.** For each failing test, decide whether the code is
   wrong, the test is wrong, or the contract is unclear. Fix wrong tests, and
   bring unclear contracts to me instead of guessing.
4. **Fix the bugs.** Fix each real bug red-green and keep its test as a
   regression test. If a fix needs a design decision or reaches well outside
   the target, leave it and report it.
5. **Clean up.** Keep tests that pin a real edge or a found bug, and drop ones
   that duplicate existing coverage. Commit each fix with its test, and the
   remaining tests separately.

Finally, tell me each bug you found, the input that triggered it, and how you
fixed it. Also list the areas you covered and anything still open.
