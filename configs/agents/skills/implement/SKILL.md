---
name: implement
description: Implement a design or plan I have already agreed. Use when I say /implement or ask to implement an agreed design or plan.
disable-model-invocation: true
---

# Implement an Agreed Design

Build the design I already agreed; do not design.

1. **Confirm the design.** If there is no agreed design in this conversation
   or one I point at, stop and say so. If something material is still open,
   ask once before starting.
2. **Organise.** Before writing code, start a high-level todo list for the
   whole job, end to end, finishing with steps 4 to 6 below. Keep items
   coarse, not granular. Maintain it as you go: add, change, or drop items as
   the work changes.
3. **Build.** Work the list in order, writing the code and its regular tests
   together. Follow the agreed design, the repository's rules, and every
   existing guide that applies, such as `software-design`, `testing`, or a
   language guide like `python-guide`. Do not reopen settled decisions or
   expand scope; park extras as follow-ups.
4. **Test adversarially.** Once the build is done, perform a separate pass that
   attacks the implementation: follow
   [adversarial-testing](../adversarial-testing/SKILL.md) on the changes and
   fix the bugs it surfaces.
5. **Pass the checks.** Run all of the repository's checks and make sure every
   one passes.
6. **Review.** Run the code review skill or agent configured in this harness
   or repository on the branch changes, such as `/review-bugbot`. Fix clear
   bugs and clear guideline violations; skip noise, matters of taste, and
   anything lint already covers. After fixes, make sure the checks still pass,
   and re-run the review only after a substantial fix. If no review skill or
   agent is configured, say so.
7. **Report.** Tell me what shipped, what adversarial testing and the review
   found, what you fixed or skipped, and what is still open. Do not open a
   pull request unless I ask.
