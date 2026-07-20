---
name: testing
description: Design or review tests around observable behaviour, owned invariants, and explicit dependencies. Use when adding tests, evaluating coverage, or improving test architecture in any language.
---

# Testing Guide

Apply all of this guide unless more specific repository instructions explicitly
override a rule. Existing tests are not themselves an override.

- Test observable project behaviour and invariants the project owns.
- Ensure new behaviour is appropriately tested, including custom validators and
  constraints owned by the project.
- Prefer regression tests for real failures, boundary conversion, retry and
  failure propagation, side effects, and rendered or parsed output.
- Do not test behaviour supplied entirely by a framework, validation library,
  serializer, or static type checker unless the project changes that behaviour.
- Do not add runtime tests for contracts static analysis already proves. Test
  behavioural differences, edge values, and side effects instead; narrow an
  interface type instead of asserting the same fact dynamically in a fake.
- Prefer explicit dependency injection and small typed fakes over patching by
  string path or broad mocks that accept any call. Dynamic mocks hide interface
  errors from static analysis and couple tests to import structure.
- Refactor code that constructs database sessions or external clients internally
  to accept a narrow injected collaborator before testing it with patches.
- Keep setup small enough that the behaviour under test remains obvious.
- Place local helpers below the tests that use them, extract repeated magic
  values into named constants, and avoid large fake class hierarchies.
- Assert outcomes rather than intermediate implementation steps unless that
  sequence is itself part of the contract.
- Avoid tests that merely check constants contain duplicated text or that two
  copies of the same lookup table agree.
- For agentic flows, assert resulting behaviour rather than brittle intermediate
  details such as exact tool calls or query operators, unless those details are
  themselves the product contract.
- Use the lightest test boundary that exercises the behaviour honestly. Add
  integration coverage where process, storage, network, or concurrency
  boundaries are material.
