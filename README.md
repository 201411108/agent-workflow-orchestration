# Agent Workflow Orchestration

[![npm version](https://img.shields.io/npm/v/%40hankim.dev%2Fagent-workflow-orchestration.svg)](https://www.npmjs.com/package/@hankim.dev/agent-workflow-orchestration)

English | [한국어](./docs/README.ko.md)

Agent Workflow Orchestration installs a consistent role-based AI workflow for Cursor, Codex, and Claude. It does not provide an agent runtime. Instead, it lays down role contracts, target-specific skill files, and a document-based Single Source of Truth for AI-assisted planning, design, and implementation.

## What It Provides

- Platform-neutral role contracts in [`agent-workflow.manifest.json`](./agent-workflow.manifest.json)
- Target adapters for Cursor, Codex, and Claude
- Role files for orchestrator, planner, designer, and developer workflows
- ADS feature documents: `articulate.md`, `designs.md`, and `specs.md`
- Project state in `.agent-workflow/state.json`

## ADS Workflow

Each feature is managed as a folder under the target specs directory:

```text
.cursor/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

- `articulate.md`: product intent. The planner acts as the driver and works with the user to capture why the feature is needed, who it serves, goals, non-goals, constraints, and success criteria.
- `designs.md`: UI/UX detail. The designer converts the articulate document into flows, states, information architecture, accessibility requirements, and design decisions.
- `specs.md`: implementation reference. The developer turns articulate and designs into concrete implementation context that an AI coding agent can use to plan and produce code.

The documents are not one-time handoffs. They can be revised during development whenever discussion with the user changes product intent, design behavior, or implementation requirements.

## Targets

| Target | Skills Path | Specs Path | Role File |
|--------|-------------|------------|-----------|
| `cursor` | `.cursor/skills/` | `.cursor/specs/` | `SKILL.md` |
| `codex` | `.codex/skills/` | `.codex/specs/` | `AGENT.md` |
| `claude` | `.claude/skills/` | `.claude/specs/` | `CLAUDE.md` |

Only one active target is allowed per project. The active target is stored in `.agent-workflow/state.json`.

## Install

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor
npx @hankim.dev/agent-workflow-orchestration install --target codex
npx @hankim.dev/agent-workflow-orchestration install --target claude
```

The default target is `cursor`. If another target is already active, use `--force` to switch.

Global installation is also supported for role files:

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor --global
```

## Initialize Specs

Create the target-specific specs directory and example ADS documents:

```bash
npx @hankim.dev/agent-workflow-orchestration init --target cursor
```

Generated structure:

```text
your-project/
├── .cursor/
│   ├── skills/
│   │   ├── role-orchestrator/SKILL.md
│   │   ├── role-planner/SKILL.md
│   │   ├── role-designer/SKILL.md
│   │   └── role-developer/SKILL.md
│   └── specs/
│       ├── README.md
│       ├── features/
│       │   └── _example-feature/
│       │       ├── articulate.md
│       │       ├── designs.md
│       │       └── specs.md
│       ├── changes/_example-change.md
│       └── decisions/000-example-decision.md
└── .agent-workflow/
    └── state.json
```

## Create a Feature

```bash
npx @hankim.dev/agent-workflow-orchestration feature --target cursor --name user-onboarding
```

This creates:

```text
.cursor/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

Existing feature documents are preserved by default. Use `--force` to overwrite them.

## CLI

```bash
agent-workflow-orchestration install --target cursor
agent-workflow-orchestration init --target codex
agent-workflow-orchestration feature --target claude --name payment-retry
agent-workflow-orchestration doctor --target claude
agent-workflow-orchestration list
agent-workflow-orchestration validate
```

### `doctor`

Checks target readiness:

- target skills directory
- target specs directory
- active target state
- `package.json` scripts for `lint`, `test`, and `typecheck`

### `validate`

Checks package consistency:

- role contracts and required output keys
- target adapter rendering
- required template files
- package metadata

## Verification Strategy

You do not need to validate this workflow only by running mini projects. The package has layered checks:

- `npm run validate`: verifies manifest, role files, adapters, templates, and package metadata.
- `npm run check:readme`: verifies English/Korean README links and important command references.
- `npm run test:smoke`: creates temporary fixtures for Cursor, Codex, and Claude, then checks install/init/feature/doctor/uninstall behavior.
- `npm run check`: runs all of the above.

Mini projects are still useful as final acceptance tests, but the core workflow is covered by automated fixture tests.

## Local Development

```bash
npm run validate
npm run check:readme
npm run test:smoke
npm run check
```

## Contributing

1. Keep role contract changes synchronized across `agent-workflow.manifest.json` and `skills/`.
2. If target behavior changes, update `adapters/`, `bin/cli.js`, `templates/`, and `scripts/fixture-smoke.js`.
3. If CLI output or generated structure changes, update both `README.md` and `README.ko.md`.
4. Run `npm run check` before publishing or opening a PR.

## Requirements

- Cursor, Codex, or Claude
- Node.js >= 14.0.0

## License

MIT
