# Changelog

All notable changes to this project will be documented in this file.

Korean changelog: [`docs/CHANGELOG.ko.md`](docs/CHANGELOG.ko.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
