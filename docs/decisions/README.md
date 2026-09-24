# Architecture Decision Records

Decision records preserve durable choices and their rationale so future contributors do not have to rediscover or accidentally contradict them. Before changing architecture, ownership, compatibility, or established product behavior, scan this directory by filename and title and search the records for the relevant subject.

## Scope and Authority

Record decisions specific to this repository here. Decisions that establish architecture, interfaces, ownership, or behavior across multiple repositories belong in the authoritative project-context repository identified by the repository-owned `Project Context` section of `AGENTS.md`, when one is configured. Consult that authority when work crosses repository boundaries or depends on project-wide decisions. If none is configured, continue the repository work without inventing one.

## What to Record

Use these questions as a heuristic:

1. Would reversing the choice be meaningfully costly?
2. Would the choice or constraint be surprising without its rationale?
3. Were there meaningful alternatives or trade-offs?

A decision generally deserves a record when at least two apply, or when preserving its rationale would materially help future contributors avoid reopening or rediscovering an important settled question. Routine implementation details, ordinary refactors, bug fixes, release notes, and easily rediscovered choices do not need records.

## Format

Name records with a four-digit sequential number and a short kebab-case slug, for example `0001-example-decision.md`. Never renumber accepted records.

Bootstrapr manages this README and [0000-template.md](0000-template.md). Actual decision records (`0001-*` and later) are repository-owned: Bootstrapr does not create, inventory, rewrite, delete, or renumber them.

Copy `0000-template.md` to the next available four-digit number and a short kebab-case slug. Use lightweight front matter with `status` and an ISO date; do not add path-based `affects` metadata. One to three paragraphs explaining the context, decision, and rationale are normally enough. Add `Considered Options` or `Consequences` sections only when they preserve information that would otherwise be lost.

## Lifecycle

- `proposed`: the decision is still being evaluated and may be edited freely.
- `accepted`: the decision is established and remains active.
- `superseded`: a later record replaces the decision.
- `deprecated`: the decision no longer applies and has no direct replacement.

Correct typos, links, and non-semantic clarifications in an accepted record in place. When an accepted outcome or rationale changes materially, create a new record instead of rewriting history. Add `supersedes` to the new record and `superseded_by` to the old record, using filenames in both directions:

```yaml
# New record
supersedes:
  - 0004-old-decision.md

# Old record
superseded_by: 0007-new-decision.md
```
