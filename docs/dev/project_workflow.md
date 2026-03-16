# Project Workflow

## Default Way Of Working

TacticsCanvas should be developed as a small, stable labeling product with explicit operational docs, not as an open-ended prototype.

## Work Sequence For Most Changes

1. Inspect the relevant code path first.
2. Check whether the change affects:
   - persisted sidecars
   - normalized metadata
   - reviewer workflow
   - deployment or ingestion docs
3. Make the smallest coherent implementation change.
4. Verify with the lightest trustworthy method available:
   - syntax check
   - test
   - manual smoke test
5. Update docs when behavior or workflow changes.

## Decision Rules

- If a change touches metadata shape, update docs and tests in the same effort.
- If a change adds workflow steps for operators, update the relevant runbook.
- If a change only adds UI polish but the core app is unstable, stabilize first.
- If a request would expand the schema, sanity-check it against the development plan phases.

## Preferred Priorities

1. Operability
2. Data safety
3. Test coverage
4. Reviewer ergonomics
5. New metadata features

## Verification Expectations

Minimum verification should be recorded in each session:

- what was changed
- how it was verified
- what remains unverified

Examples of acceptable checks:

- `node --check`
- route-level tests
- fixture-based serialization tests
- manual save/load smoke test

## Documentation Expectations

Update `/docs/dev` when any of these change:

- current app behavior
- architecture direction
- development phase ordering
- deployment steps
- ingestion steps

## Anti-Patterns To Avoid

- adding new layers before schema cleanup
- mutating metadata in multiple shapes without a canonical adapter
- landing UX features without any verification path
- silently changing persisted sidecar structure
- treating README as the only source of truth for active work
