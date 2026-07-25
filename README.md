# Agent Workflow Orchestration

[![npm version](https://img.shields.io/npm/v/%40hankim.dev%2Fagent-workflow-orchestration.svg)](https://www.npmjs.com/package/@hankim.dev/agent-workflow-orchestration)

English | [한국어](./docs/README.ko.md)

Agent Workflow Orchestration installs a consistent role-based AI workflow for Cursor, Codex, and Claude. It does not provide an agent runtime. Instead, it lays down role contracts, target-specific skill files, a harness-neutral Single Source of Truth, and resumable handoff state for AI-assisted planning, design, and implementation.

## What It Provides

- Platform-neutral role contracts in [`agent-workflow.manifest.json`](./agent-workflow.manifest.json)
- Target adapters for Cursor, Codex, and Claude
- Role files for orchestrator, researcher, planner, designer, architect, developer, and reviewer workflows
- ADS feature documents: `articulate.md`, `designs.md`, and `specs.md`
- Shared project configuration and specs in `.agent-workflow/`
- Optional local or version-controlled continuity work items for model/session handoff
- Safe role-file updates with ownership hashes and sidecar preservation
- Once-daily interactive update notifications that never modify files automatically

The default feature chain is `Planner → Developer → Reviewer`. Researcher is inserted when evidence gathering is needed, Designer for UI changes, and Architect for API, state, compatibility, or structural decisions.

## ADS Workflow

Each feature is managed as a folder under the target specs directory:

```text
.agent-workflow/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

- `articulate.md`: product intent. The planner acts as the driver and works with the user to capture why the feature is needed, who it serves, goals, non-goals, constraints, and success criteria.
- `designs.md`: UI/UX detail. The designer converts the articulate document into flows, states, information architecture, accessibility requirements, and design decisions.
- `specs.md`: implementation reference. The developer turns articulate and designs into concrete implementation context that an AI coding agent can use to plan and produce code.

The documents are not one-time handoffs. They can be revised during development whenever discussion with the user changes product intent, design behavior, or implementation requirements.

## Targets

| Target | Skills Path | Shared Specs Path | Role File |
|--------|-------------|------------|-----------|
| `cursor` | `.cursor/skills/` | `.agent-workflow/specs/` | `SKILL.md` |
| `codex` | `.codex/skills/` | `.agent-workflow/specs/` | `AGENT.md` |
| `claude` | `.claude/skills/` | `.agent-workflow/specs/` | `CLAUDE.md` |

Multiple targets can be installed in one project. Their role files read the same harness-neutral specs and continuity state.

## Install

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor
npx @hankim.dev/agent-workflow-orchestration install --target codex
npx @hankim.dev/agent-workflow-orchestration install --target claude
```

The default target is `cursor`. Installing another target adds its role files without deleting existing target content.
Each generated role file is recorded with its package version and SHA-256 ownership hash. `install --force`, `update --force`, and `uninstall --force` only touch the adapter role file itself; other files in the same role directory are preserved.

Global installation is also supported for role files:

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor --global
```

## Update Existing Installations

Use an explicit `@latest` when you want `npx` to fetch the current CLI:

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update
```

Project `update` refreshes every target recorded in `.agent-workflow/.local/state.json`. Select one target with `--target`. Global role files require an explicit target:

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update --target codex
npm install -g @hankim.dev/agent-workflow-orchestration@latest
agent-workflow-orchestration update --global --target codex
```

Files installed by 1.0.x have no ownership hashes. Perform the first migration explicitly; sidecar files in role directories remain untouched:

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update --force
```

Without `--force`, `update` and `uninstall` first compare every role file with its recorded hash. A missing hash, modified file, or missing file aborts the whole operation without changing anything.

## Initialize Specs

Create the shared specs directory and example ADS documents:

```bash
npx @hankim.dev/agent-workflow-orchestration init
```

Generated structure:

```text
your-project/
├── .cursor/
│   └── skills/
│   │   ├── role-orchestrator/SKILL.md
│   │   ├── role-researcher/SKILL.md
│   │   ├── role-planner/SKILL.md
│   │   ├── role-designer/SKILL.md
│   │   ├── role-architect/SKILL.md
│   │   ├── role-developer/SKILL.md
│   │   └── role-reviewer/SKILL.md
└── .agent-workflow/
    ├── workflow.json
    ├── .gitignore
    └── specs/
│       ├── README.md
│       ├── features/
│       │   └── _example-feature/
│       │       ├── articulate.md
│       │       ├── designs.md
│       │       └── specs.md
│       ├── changes/_example-change.md
│       └── decisions/000-example-decision.md
```

## Create a Feature

```bash
npx @hankim.dev/agent-workflow-orchestration feature --name user-onboarding
```

This creates:

```text
.agent-workflow/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

Existing feature documents are preserved by default. Use `--force` to overwrite them.

`workflow.json.specsRoot` controls the shared specs location. It must be a project-relative path that remains inside the project:

```json
{
  "schemaVersion": 2,
  "specsRoot": "docs/agent-specs",
  "continuity": { "storage": "local" },
  "migrations": []
}
```

## Continuity And Migration

Import existing target-specific specs without changing their source files:

```bash
agent-workflow-orchestration import --from cursor --dry-run
agent-workflow-orchestration import --from cursor
```

Create and resume a work item after its feature exists:

```bash
agent-workflow-orchestration work --name implement-onboarding --feature user-onboarding
agent-workflow-orchestration advance --name implement-onboarding --phase implementation --role role-developer --next-role role-reviewer
agent-workflow-orchestration resume --name implement-onboarding
```

`work` records Developer as the default next role. Use `--next-role <role>` or `--next-role none` on `work` and `advance` to persist the actual handoff.

By default, work items are stored below `.agent-workflow/.local/` and excluded from version control. Set `"continuity": { "storage": "project" }` in `.agent-workflow/workflow.json` to share new work items through the repository. `resume`, `advance`, and forced work-item refreshes search both locations, so changing this setting does not strand existing work. If the same ID exists in both locations, the command stops and prints both paths.

For legacy target specs, preview conflicts before importing. The source is never removed:

```bash
agent-workflow-orchestration import --from cursor --dry-run
agent-workflow-orchestration import --from cursor
```

## Update Notifications

Interactive TTY runs check the npm `latest` tag at most once per day with an 800 ms timeout. Failures are cached for one hour and never affect the command result. CI and non-TTY runs skip the check. Set `AGENT_WORKFLOW_NO_UPDATE_CHECK=1` or `NO_UPDATE_NOTIFIER=1` to disable it.

The notification is advisory only. It never updates the package or generated files. Because 1.0.0 did not contain this checker, the first 1.1.0 migration must be discovered through the GitHub Release or these instructions.

## CLI

```bash
agent-workflow-orchestration install --target cursor
agent-workflow-orchestration install --target codex
agent-workflow-orchestration update
agent-workflow-orchestration init
agent-workflow-orchestration feature --name payment-retry
agent-workflow-orchestration work --name payment-retry-implementation --feature payment-retry
agent-workflow-orchestration resume --name payment-retry-implementation
agent-workflow-orchestration doctor --target claude
agent-workflow-orchestration list
agent-workflow-orchestration validate
```

### `doctor`

Checks target readiness:

- target skills directory
- shared specs and workflow configuration
- available legacy specs imports
- installed target role files
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
- `npm run test:smoke`: creates temporary fixtures and checks ownership hashes, sidecar safety, shared specs, legacy import, continuity resume, and safe updates/removal.
- `npm run test:update-check`: uses a local mock registry and fake clock to cover update availability, cache, timeout, offline, CI, and opt-out behavior without accessing the real registry.
- `npm run check`: runs all of the above.

Mini projects are still useful as final acceptance tests, but the core workflow is covered by automated fixture tests.

## Local Development

```bash
npm run validate
npm run check:readme
npm run test:smoke
npm run test:update-check
npm run check
```

## Contributing

1. Keep role contract changes synchronized across `agent-workflow.manifest.json` and `skills/`.
2. If target behavior changes, update `adapters/`, `bin/cli.js`, `templates/`, and `scripts/fixture-smoke.js`.
3. If CLI output or generated structure changes, update both `README.md` and `README.ko.md`.
4. Run `npm run check` before publishing or opening a PR.

## Requirements

- Cursor, Codex, or Claude
- Node.js >= 14.14.0

## License

MIT
