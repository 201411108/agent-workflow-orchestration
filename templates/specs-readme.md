# Project Specs (Single Source of Truth)

This folder is the project-level Single Source of Truth for product intent, UX decisions, implementation specs, and implementation history.
It was generated for `{{TARGET_LABEL}}` at `{{SPECS_PATH}}`.

## Folder Layout

```text
{{SPECS_PATH}}/
├── README.md
├── features/
│   └── {feature-name}/
│       ├── articulate.md
│       ├── designs.md
│       └── specs.md
├── changes/
└── decisions/
```

## Feature Documents

Each feature is managed as a three-document loop.

- `articulate.md`: product intent. The planner/driver writes this with the user. It explains why the feature is needed, who it serves, goals, non-goals, constraints, and open questions.
- `designs.md`: UI/UX detail. The designer writes this from `articulate.md`, covering flows, information architecture, states, accessibility, and design decisions.
- `specs.md`: implementation reference. The developer writes this from `articulate.md` and `designs.md`, with enough detail for an AI agent to plan and produce code.

Create a feature scaffold with:

```bash
agent-workflow-orchestration feature --target {{TARGET_NAME}} --name user-onboarding
```

## Supporting Documents

- `changes/`: implementation records after code changes. These should summarize actual changes, verification, and follow-up work.
- `decisions/`: cross-feature architecture, product, design, or technical decisions using an ADR-style format.

## Operating Rules

1. Start a new feature by creating `features/{feature-name}/articulate.md`.
2. Do not write `designs.md` until the core intent in `articulate.md` is clear enough to design.
3. Do not write implementation-ready `specs.md` until `designs.md` captures the required UI/UX behavior.
4. During development, update the relevant feature documents when user discussion changes intent, design, or implementation requirements.
5. Keep `changes/` for actual implementation records and `decisions/` for broader ADRs.
6. Mark deprecated documents with `Deprecated` in the status line instead of deleting them.

## Example Documents

- `features/_example-feature/articulate.md`
- `features/_example-feature/designs.md`
- `features/_example-feature/specs.md`
- `changes/_example-change.md`
- `decisions/000-example-decision.md`
