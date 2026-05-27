# Changelog

All notable changes to this project will be documented in this file.

Korean changelog: [`docs/CHANGELOG.ko.md`](docs/CHANGELOG.ko.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- ADS feature workflow with `articulate.md`, `designs.md`, and `specs.md` templates
- `feature --name` CLI command for feature-level ADS document scaffolding
- English primary README with linked Korean documentation

### Changed

- Updated role contracts around planner-driven articulate, designer-owned designs, and developer-owned specs
- Updated smoke tests to verify target-specific ADS scaffolding

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
