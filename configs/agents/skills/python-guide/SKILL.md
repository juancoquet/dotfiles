---
name: python-guide
description: Apply my opinionated Python rules for Pydantic data modelling, strict typing, code style, concurrency, pytest, tooling, and suppressions. Use whenever writing or reviewing Python code.
---

# Python Guide

Use Pydantic for data modelling and Pyright or basedpyright for static type
checking.

Apply all of this guide unless more specific repository instructions explicitly
override a rule. Existing code that uses weaker patterns is not itself an
override. Prefer these rules for new code and make nearby improvements when
that does not materially expand the task.

## Typing and Data Models

- Always use the most constrained, descriptive type available. Prefer
  `Literal`, `Enum`, `StrEnum`, `NewType`, constrained values, `Path`, and
  `PurePosixPath` over broad primitives when they communicate real constraints.
- Use concrete types for model fields and return values. Input parameters may
  accept an appropriate read-only abstraction such as `Sequence`.
- Avoid `Any`, `object`, and `dict[str, Any]` whenever the shape can be known.
  Even when it cannot be known completely, narrow it as far as possible.
- Model structured data with Pydantic. Model nested structures fully rather
  than stopping at a top-level model whose fields contain untyped dictionaries.
- Use Pydantic fields, validators, and reusable constrained aliases to encode
  owned constraints. Prefer Pydantic's `NonNegativeInt` or `PositiveInt` for
  count-like and positive values. Prefer a project alias such as `NonEmptyStr`
  or `NonEmptyList[T]` over repeating an equivalent inline constraint.
- Use a constrained optional type such as `NonEmptyStr | None` when a domain
  value may be absent. Do not let an empty string stand for absence; convert to
  an empty representation only at a rendering or serialization boundary that
  requires it.
- Prefer typed models over dictionaries at function boundaries. A caller
  should understand the contract from the signature without explanatory prose.
- Treat every use of `dict.get(...)` as a code smell: it often hides a
  missing-key bug or widens a precise type with `None`. Use it only when
  absence is part of the contract and handle that case explicitly; use indexed
  access for required keys.
- Construct Pydantic models from known typed values with explicit constructor
  keyword arguments. Do not assemble a dictionary with `model_dump()` and feed
  it into `model_validate()` when static checking can verify the constructor.
- Avoid `cast`: it asserts rather than proves a type and often hides a design
  problem. Prefer validation, `isinstance`, a `TypeGuard`, or a better
  interface. If no legitimate alternative exists, cast to the narrowest type.
  When a third-party typing hole remains after runtime narrowing, an approved,
  narrow inline suppression with a reason is preferable to a broader `cast`.

## Python Style

- Prefer exhaustive pattern matching for typed unions and enums over
  `if`/`elif` chains. Handle every variant explicitly; do not add a catch-all
  that hides newly introduced variants. With strict basedpyright, do not add
  `assert_never` merely to compensate for a non-exhaustive match.
- Avoid `*args` and `**kwargs` unless genuinely forwarding an interface whose
  parameters are not yours to define.
- Use at most two clauses in a comprehension. Use an ordinary loop for greater
  complexity.
- Prefer f-strings over percent formatting and `.format()`.
- Omit annotations when assignment inference is already precise. Add one when
  inference would otherwise be broad or ambiguous.
- Use `typing.Self` when a method returns an instance of its own class, not a
  quoted forward reference or the concrete class name.
- Prefer immutable Pydantic value models. Reuse a repository's shared frozen
  model base or configuration rather than repeating it per model.
- Never re-export symbols owned by another package, including from
  `__init__.py`. Import them directly from the package that defines them.

## Concurrency

- Understand concurrency semantics before changing worker code.
  `ThreadPoolExecutor.map` preserves input order and returns an iterator;
  `as_completed` changes ordering and materialisation behaviour.
- Python threads do not inherit `contextvars` from the submitting thread.
  Propagate context explicitly with `copy_context().run(...)` or a context-aware
  executor, and include a negative-control test showing that bare `submit` does
  not propagate it when that distinction matters.

## Python Dependency Construction

- Implement shared production instances with module-level
  `@functools.cache`-decorated factories next to their concrete implementations.
  Read environment and configuration on the first factory call, never at import
  time. A no-argument factory is process-wide; arguments define distinct cached
  instances.
- Use an explicit typed omitted-value sentinel when `None` is a meaningful
  injected value. Resolve the sentinel to the production factory in the
  constructor.
- Do not implement singleton state with classmethods, mutable class attributes,
  or `_instance` fields.

## Pytest

- Use pytest with plain test functions. Do not use test classes or inheritance
  hierarchies.
- Avoid fixtures and other implicit setup. Prefer ordinary Python setup that is
  visible in the test.
- Thoroughly test custom Pydantic validators and project-owned constraints.
- Do not test Pydantic's native required-field handling, defaults,
  discriminator dispatch, well-typed parsing, or round-trip serialization when
  no project code changes that behaviour.
- Use `pytest.raises` without `match=`. Assert the exception type, never its
  message text.
- Put exactly one `@pytest.mark.small`, `medium`, or `large` marker on each test,
  never a module-level `pytestmark`. Small tests are hermetic and in-process,
  with no network, database, filesystem, multiple threads, or sleeps. Localhost
  network, database, filesystem, multiple-thread, or sleep usage makes a test
  at least medium. Non-local network access and real external systems make it
  large. An in-memory database is still a database; an in-process fake such as
  `httpx.MockTransport` remains small.

## Python Tooling and Suppressions
- Never add `# noqa`, `# type: ignore`, Pyright suppressions, or new baseline
  entries without first obtaining explicit approval. Exhaust legitimate fixes
  before proposing suppression.
- An approved inline suppression must be narrow and include a concise reason,
  such as a specific defect in third-party stubs.
- Never run basedpyright with `--writebaseline` or manually add baseline entries
  without explicit approval. Keep reductions produced by resolved errors.
- In a uv-managed project, add dependencies through the `uv` CLI rather than
  editing dependency declarations or lock files by hand. Update every relevant
  workspace package through the CLI.
