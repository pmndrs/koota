---
name: data-model-first-engineering
description: Enforces a data-model-first, spec-driven workflow using model/ docs as the source of truth. Use when work involves data models, schemas, types, loaders, or model/view scope decisions.
---

# Data-Model-First Engineering

## Purpose

- `model/` is the canonical data model contract.
- Type definitions must conform to `model/`.

## Activation (per-package)

This skill only applies to packages that have a `model/` directory at their root.

1. Identify which package(s) the task touches.
2. Check if each package has a `model/` directory.
3. If a package has no `model/`, this skill does not apply to that package.

In a monorepo, apply this skill **per-package**: a package with `model/` follows this workflow; a package without `model/` does not.

## MANDATORY: Required response header

The first assistant message for any task using this skill must start with:

- `Scope: VIEW|MODEL|BOTH`
- `Model change approved: YES|NO|N/A`

## MANDATORY: Scope + approval gate

| Scope   | Meaning                | Requires                                                    |
| ------- | ---------------------- | ----------------------------------------------------------- |
| `VIEW`  | Presentation/UI only   | No model changes                                            |
| `MODEL` | Schema/contract change | Update model docs → types → producers/loaders → sample data |
| `BOTH`  | Spans both layers      | All of the above                                            |

Decision checklist:

- Add/remove/rename a field? → `MODEL`
- Change types/optionality/semantics? → `MODEL`
- Add shared defaults/validation rules? → `MODEL`
- Pure display/styling/animation? → `VIEW`

If unclear, ask: "Should this be VIEW-only behavior, or a MODEL-defined semantic shared across systems?"

**If `MODEL` or `BOTH`: STOP and get user approval before any edits.**

- Until approval is granted, you may only: read files, search, and propose a plan.
- Until approval is granted, you must not: edit files, apply patches, run commands that modify the workspace, or introduce new dependencies.

## Workflow (after approval)

1. `model/` docs
2. type definitions
3. loaders/transforms
4. sample data (if applicable)
5. view/features

Rules:

- If `VIEW`, do not change model artifacts.
- Validate no runtime shape changes or ad-hoc parsing.
- After discovery/exploration, re-check scope. If scope becomes `MODEL` or `BOTH`, re-enter the approval gate before any edits.
- **Completion gate:** A MODEL change is not complete until the implementation matches the updated model.

## What counts as "model artifacts"

- `model/**`
- Any “canonical contract” type definitions that must conform to `model/` (e.g. a central `data-model.ts` or a `types/` package that defines the shared schema)
- Any producers/loaders/transforms that define or enforce the data shape (e.g. loader/serializer/validator code that parses or emits model-shaped data)
- Sample data/fixtures used as model examples (e.g. `data/**` or `fixtures/**`)

## MANDATORY: STOP-AND-ASK rule

If you are about to introduce any field/type/trait/state that is **not present in `model/`** and it will be named after (or attached to) a **model concept**:

1. **STOP** — do not write any code or edit any files.
2. Ask the user to choose one:
   - **MODEL**: Update `model/` to include the field(s), then update types, loaders/transforms, and sample data.
   - **NON-MODEL**: Keep the model unchanged and implement the extra data as explicitly non-model, domain-local state under a different name (e.g. view-only/UI state).
3. **Wait for the user's explicit choice** before proceeding.
4. Do not silently diverge from the model contract.

If implementing state that is intentionally **not** part of the model contract:

- Prefer names that stay close to the model for clarity.
- Domain-specific naming conventions (frontend, backend, view, etc.) may override model naming when appropriate for that domain.

## Conflict resolution

If `model/` docs and type definitions disagree:

- Treat `model/` as canonical.
- Stop and ask which action to take:
  - Update code/types/loaders to match `model/` (no model change), or
  - Proceed with a MODEL change to update `model/` (requires explicit approval).

## Change rules

DO:

- Prefer additive, optional fields over breaking changes.
- Update all artifacts together (see workflow above).
- For breaking changes: label explicitly and include migration notes.

DO NOT:

- Diverge from the model (no ad-hoc parsing, no runtime shape changes).
- Loosen types to accept non-conforming data.
- Implement features that require model changes without flagging them.

## Standards

- **Variant roots**: model variants as explicit root types with versioned schemas.
- **Computed runs**: model derived outputs with run schema + output schema.
- Details: see [`reference.md`](./reference.md).

## HARD STOP: When a model change is required

If a feature/bugfix appears to require changing the data model:

1. **STOP IMMEDIATELY** — do not proceed, do not make any edits.
2. Alert what is missing (field/type/semantic).
3. Propose the minimal model change and list impacted files.
4. Offer an alternative VIEW-only approach if one exists.
5. **Ask the user explicitly**: "Do you want to proceed with this MODEL change, or should I implement a VIEW-only solution?"
6. **Wait for the user's response** before making any changes.
