---
name: software-design
description: Apply Juan's language-agnostic design principles, including hexagonal architecture, explicit dependencies, controlled state, boundaries, and failures. Use whenever writing or reviewing non-frontend code, and for frontend work with meaningful application or service boundaries.
---

# Software Design

Apply all of this guide unless more specific repository instructions explicitly
override a rule. Existing code that uses weaker patterns is not itself an
override. Prefer these rules for new code and improve nearby code when that does
not materially expand the task.

Value data correctness above convenience. Understand and model the complete
shape of data flowing through the system at every layer.

## Interfaces and State

- Make invalid states unrepresentable. Prefer constrained values and explicit
  variants over broad structures plus scattered checks. Prevent invalid
  construction instead of adding a test that merely proves runtime rejection.
- Make dependencies explicit through function parameters or constructors.
  Depend on the narrowest interface consumers actually need.
- Prefer stateless, pure transformations. When state is necessary, contain it
  and keep ownership clear; helpers should return values rather than mutate
  accumulators owned by callers.
- Group parameters that must appear together into one input object so invalid
  call shapes cannot be constructed.
- Avoid inheritance as a mechanism for sharing behaviour. Use it sparingly for
  genuine subtype relationships.
- Do not use classes merely as state wrappers. Use them to own a coherent
  abstraction or manage explicitly injected collaborators.

## Boundaries and Failures

- Adapt external data into project-owned models at the boundary. Do not let
  provider-specific or loosely typed representations spread into domain code.
- Keep failure data structured until the boundary that renders it. Do not use
  success-shaped values such as ordinary strings to smuggle errors through an
  interface.
- Catch broad failures only at deliberate resilience boundaries. Preserve
  full diagnostic context, log enough operational context, and keep failure
  distinguishable from success. Unexpected malformed external responses should
  normally propagate unless the boundary is explicitly resilient.
- Avoid import-time or module-load side effects. Initialise connections,
  configuration, and external clients explicitly. Keep module scope to
  definitions; perform initialisation in functions called by an entrypoint or
  composition root.
- Represent expected failures with a structured result or error variant the
  caller can inspect. Raise specific exceptions for programmer errors and
  failures no caller in the current chain is expected to recover from.
- Catch and raise the most specific failure type available.

## Hexagonal Architecture

Keep the domain independent of transport, storage, framework, and provider
details.

- The core contains domain models and logic and performs no external I/O.
- Ports describe only the capabilities the domain or application service needs.
  Their signatures use domain and language-level values, never provider SDK
  types.
- Adapters own I/O, provider imports, representation conversion, and translation
  from provider failures into project-owned errors.
- Dependencies point inward: adapters depend on ports and domain code; domain
  code does not depend on adapters.
- A composition root constructs concrete adapters and wires them to application
  services. Domain, port, and adapter modules must not reach upward into it.
- Application services orchestrate use cases involving multiple ports.
  Entrypoints translate transport input, call a service, and render its result;
  they do not contain business logic worth testing.

Place a shared port where its abstraction belongs rather than in the first
consumer that needed it. Keep it narrow; do not add operations speculatively.

## Construction and Dependencies

- Use dependency injection for services, clients, stores, and other
  collaborators. Production and test implementations must satisfy the same
  narrow contract.
- Keep object construction in a composition root or explicit production
  factory. Do not reach upward into that composition layer from domain, port,
  or adapter modules, and do not hide dependency cycles with lazy imports.
- A collaborator may default through a production factory when that keeps the
  ordinary construction path simple without hiding the dependency. Use an
  explicit omitted-value sentinel when `None` is meaningful.
- Reuse a deliberate cached production factory when instances should be shared.
  Do not hand-roll mutable class-level or `_instance` singletons.
- If a default collaborator would invert dependencies or create an import
  cycle, make it required and inject it from the composition root.

## Operational Boundaries

- Bind stable identifiers as soon as they are known. Prefer IDs, counts, and
  durations over payload snippets, and never log sensitive content when stable
  metadata is sufficient. Pass typed identifiers directly to structured loggers
  that support them rather than creating string-only variables for logging.
- Modules that call external systems, subprocesses, databases, or heavy package
  entrypoints own their operational logging. Log completion and failure, and
  log the attempt when the call is not trivial and fast.
- Use the severity that matches the outcome: informational logging for success,
  warning for expected handled failures, and exception logging immediately
  before re-raising unexpected failures.
- A new external integration without enough logging to diagnose its outcomes is
  incomplete, just as one without tests is incomplete.

## Code Shape

- Organise files from their primary public subject down to supporting and
  private details.
- Use guard clauses to reduce nesting.
- Comments explain intent, constraints, and non-obvious decisions rather than
  narrating the code. Do not use comment headings to divide an oversized file.
- Keep helpers private until another module has a legitimate dependency on
  them. Public surface area should be intentional.
- Avoid wrappers, classmethods, or functions for static mappings when a private
  function or constant expresses the behaviour more honestly.
