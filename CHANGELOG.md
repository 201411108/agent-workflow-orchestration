# Changelog

All notable changes to this project will be documented in this file.

Korean changelog: [`docs/CHANGELOG.ko.md`](docs/CHANGELOG.ko.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `doctor` inspects the contents of installed role files, not only their
  presence: Codex TOML is parsed, Claude and cursor frontmatter must declare the
  expected role name, and enum-valued keys are checked. A consumer whose install
  is invalid now has a diagnostic
- Roles may declare `skills`. An empty list is a prohibition, not a deferral: the
  `Skill` tool is withheld, which is the one boundary the runtime enforces.
  Declaring skills grants the tool, preloads them through the target's native
  key, and renders a `## Skills` section stating plainly that the narrower
  boundary is contract text only
- Three new roles: `role-analyst` (external evidence and metrics), `role-qa`
  (turns acceptance criteria into executable tests), and `role-releaser`
  (deploy and rollback). Ten roles total
- Role declarations drive dispatch: `capabilities`, `produces`, `consumes`, and
  `optionalConsumes` replace the fixed routing table
- Handoff envelope shared by every role, with sourced facts, separated
  assumptions, blocking questions, needed capabilities, and explicit scope
- `Activation`, `Done Criteria`, and `Stop Conditions` in every role contract
- Per-role tool binding rendered into each target's native syntax
- Behavioral eval harness (`npm run eval`) with a pure judge that is
  self-verified on every `npm run check`
- `doctor` reports Codex project trust; an untrusted project silently skips the
  whole `.codex/` layer
- `npm run check:package` verifies the published package contains product files
  only and nothing the runtime needs is missing

#### Previously unreleased


- Publishable Codex runtime payload and project/global installer coverage for
  the official skill, custom-agent, config, and guidance paths
- Pull-request CI for package checks and packed-content verification
- Project-local Codex `feature-orchestrator` skill under the official
  `.agents/skills` discovery path
- Read-only planner and designer custom agents plus a developer custom agent
  under `.codex/agents`
- Project multi-agent configuration and repository orchestration guidance
- Codex orchestration operations guide with migration notes and new-session
  smoke tests
- Reusable pull request template based on the repository's existing PR structure

### Changed

- `work` and `advance` no longer infer a role. The CLI used a fixed
  phase-to-role table that did not contain `role-analyst`, `role-qa`, or
  `role-releaser`, so those roles could never be recorded. Pass `--role` and
  `--next-role` to set them; omitted, they are left untouched. Dispatch is the
  orchestrator's job, computed from role declarations (D2)
- Claude target now installs roles as subagents under `.claude/agents/` and the
  orchestrator as a skill. The previous layout wrote `CLAUDE.md` into
  `.claude/skills/`, which Claude Code never loaded
- Codex deploys all ten roles; previously only three custom agents shipped
- Role files are rendered from the manifest and role contracts instead of
  hand-written payload copies
- `mutationPolicy` maps to each target's native permission keys, and tool
  allowlists are derived from role declarations rather than fixed per policy
- The published package no longer ships development documents, the eval
  harness, or repository test scripts

#### Previously unreleased

- Codex install, update, and uninstall now preserve shared TOML comments and
  unknown keys, manage only a marked `AGENTS.md` block, track full-file
  ownership, and safely migrate provably package-owned legacy `AGENT.md` files
- Standard Codex 1.0.0 outputs are recognized by exact hashes; dotted TOML and
  CRLF are preserved, while unsafe managed-namespace forms fail preflight
- Codex project work now routes only the roles required by the request and
  passes compressed decisions, risks, unknowns, and verification gaps between
  roles
- Standardized the remaining change-record and ADR templates in English
- Migration record references configuration commit
  `9b3a24c55ff90135e9de10e464098d4042790c12`
- Consumer-distribution implementation is recorded in commit
  `b11cc8957c01457b6d2b383f5a65de6203e74ae0`

### Fixed

- A role could dispatch other roles and hold a conversation with them. The
  Claude adapter granted `role-developer` the unscoped `Agent` tool, so it spawned
  `role-reviewer` directly and got back an id for continuing that conversation —
  defeating both "the orchestrator assigns" and "no direct agent-to-agent
  dialogue". Scoping the grant does not help: the runtime ignores the scope. The
  abstract `task_subagent` tool is removed, and `validate` now fails any render
  that grants `Agent`
- `doctor` reports whether tool binding is enforced on the target at all. On
  cursor it is not, so a contract's `required_tools` there is text rather than a
  boundary, and consumers were never told
- The eval harness reported three checks as passing that could never fail:
  their inputs were hardcoded empty arrays. `tools.declared_only` had no
  observation path at all, `scope.out_of_scope_respected` had the data but never
  used it, and `setup.roles_loaded` was blind on Claude because the runner
  discarded the events carrying the role roster. Out-of-scope violations and
  role loading are now computed from real observations; unobservable checks are
  reported separately and excluded from the pass count
- Content invariants (contract sections, envelope fields, absence of fixed
  chains) were checked only against sources, while the claim they supported was
  about deployed files. They now run against each target's render
- TOML validity was asserted by string inspection, which is how the 1.5 Codex
  defect passed. Renders are now parsed
- `install` reported that role files went to the skills directory even on targets
  where roles and the orchestrator go to different directories (Claude writes
  roles to `.claude/agents/` and the orchestrator to `.claude/skills/`). It now
  names both
- `doctor` checked only the skills directory on those targets, so all nine role
  files could be missing and it still reported present
- Three fixed role chains survived the 1.7 removal because the chain check
  read one syntax (`role-a -> role-b`) in one place (`skills/*/SKILL.md`): a
  prose chain in the orchestrator's frontmatter `description`, which is the text
  the harness reads when deciding whether to load the skill; `Planner → Developer
  → Reviewer` in the shipped `README.md`; and the CLI's phase-to-role table.
  `validate` now checks bare role stems and full-width arrows across role
  contracts, shipped documents, CLI sources, and the Codex payload roster
- Two more role contracts described a chain in prose, with no arrow and no
  second role name, so all four new checks passed them. Rendering the package
  into a project and scanning the deployed files exposed them; a contract now
  may not use the word "chain" at all
- Claude target produced files that were never discovered as skills
- `role-reviewer` declared `mutationPolicy: none` but received `Bash` through
  `test_runner`, so it was not read-only
- Deployed role files pointed at `Source: skills/role-*.md`, a path that does
  not exist in a consumer project, and roles cited it as evidence
- Updating an existing cursor install aborted because the recorded ownership
  key format changed
- Legacy role files from earlier layouts are migrated instead of left orphaned

## [1.1.0] - 2026-07-25

### Added

- ADS feature workflow with `articulate.md`, `designs.md`, and `specs.md` templates
- `feature --name` CLI command for feature-level ADS document scaffolding
- English primary README with linked Korean documentation
- Harness-neutral `.agent-workflow/specs/` storage and resumable work item commands
- Non-destructive legacy `import` flow for target-specific specs
- Researcher, architect, and reviewer role contracts
- Safe `update` command for recorded project targets and selected project/global targets
- Per-target installed versions and SHA-256 ownership hashes for generated role files
- Explicit `--next-role <role|none>` handoff persistence for `work` and `advance`
- Advisory interactive npm update checks with timeout, cache, CI/non-TTY skip, and opt-out controls
- Node 14-compatible `semver` dependency and reproducible `npm ci` release checks

### Changed

- Updated role contracts around planner-driven articulate, designer-owned designs, and developer-owned specs
- Updated smoke tests to verify target-specific ADS scaffolding
- Multiple target adapters may coexist while consuming one shared SoT
- Install, update, and uninstall only modify the adapter role file and preserve role-directory sidecars
- Modified, missing, or legacy unhashed role files abort non-forced updates and removal before any change
- `workflow.json.specsRoot` now controls all specs commands and generated role references, with project-boundary validation
- Work item lookup searches local and project storage, preserves an existing item's location, and rejects duplicate IDs
- New work items use schema v2 project-relative document paths while resume remains compatible with schema v1
- Resume packets include the work file, actual pending tasks and blockers, update time, and handoff/verification paths
- The default feature chain is Planner → Developer → Reviewer, with Researcher, Designer, and Architect inserted conditionally
- Release verification installs dependencies with `npm ci` before checks and publish

### Fixed

- Replaced handoff and verification date placeholders when work items are created
- Added `.local/` to `.agent-workflow/.gitignore` correctly when the existing file lacks a final newline

## [1.0.0] - 2026-03-30

### Added

- Orchestrator harness skill for multi-role agent coordination
- Role-planner skill for requirements analysis and edge case discovery
- Role-designer skill for UI/UX heuristic evaluation and Figma analysis
- Role-developer skill for codebase-aware implementation
- CLI tool with `install`, `uninstall`, `list` commands
- Global and project-scoped installation support
- SSoT (Single Source of Truth) specs management system
- `init` command for `.cursor/specs/` folder initialization
- Document templates for features, changes, and decisions (ADR)
- Spec-aware workflow integrated into all role skills
