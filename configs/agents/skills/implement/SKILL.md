---
name: implement
description: Implement a plan or design I have already agreed. Use when I say /implement or ask to implement an agreed design or plan.
disable-model-invocation: true
---

# Implement an Agreed Design

Build the plan I already agreed. Do not design. If there is no agreed plan in
the conversation, or one I point at, stop and say so. If something material is
still open, ask once.

Before writing code, make a todo list for the whole job. End it with running
Bugbot (`/review-bugbot`) and addressing the valid findings. Do not start until
that list exists.

Work the list in order. Follow the agreed plan and the repository's ordinary
rules, and load project skills that apply. Do not reopen settled decisions or
expand scope; park extras as follow-ups.

Run the repository's checks and fix diagnostics from this work before Bugbot.
Then run `/review-bugbot` on the branch changes. Fix clear bugs and clear guide
violations. Skip noise, taste, and anything lint already owns. Re-run Bugbot
only when a fix was substantial.

Tell me what shipped, what Bugbot found, what you fixed or skipped, and what is
still open. Do not open a pull request unless I ask.
