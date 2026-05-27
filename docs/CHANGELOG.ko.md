# 변경 이력

이 프로젝트의 주요 변경 사항을 기록합니다.

영어 변경 이력은 [`../CHANGELOG.md`](../CHANGELOG.md)를 참고하세요.

## [Unreleased]

### 추가

- `.agent-workflow/specs/` 공통 SoT와 재개 가능한 work item 명령
- target별 기존 specs를 원본 보존 방식으로 반입하는 `import` 명령
- researcher, architect, reviewer 역할 계약

### 변경

- 여러 target adapter가 하나의 공통 SoT를 함께 읽을 수 있도록 설치 정책 변경
- target 설치 및 제거 과정에서 사용자 파일과 specs를 삭제하지 않도록 안전성 강화

### Added

- `articulate.md`, `designs.md`, `specs.md` 템플릿을 사용하는 ADS 기능 워크플로 추가
- 기능 단위 ADS 문서를 생성하는 `feature --name` CLI 명령 추가
- 영어를 기본 README로 두고 한국어 문서를 `docs/README.ko.md`에서 관리

### Changed

- planner가 articulate를 주도하고, designer가 designs를 담당하며, developer가 specs를 담당하도록 역할 계약 갱신
- target별 ADS scaffold를 검증하도록 smoke test 강화

## [1.0.0] - 2026-03-30

### Added

- multi-role agent coordination을 위한 orchestrator harness skill 추가
- 요구사항 분석과 edge case discovery를 위한 role-planner skill 추가
- UI/UX heuristic evaluation과 Figma analysis를 위한 role-designer skill 추가
- codebase-aware implementation을 위한 role-developer skill 추가
- `install`, `uninstall`, `list` 명령을 제공하는 CLI tool 추가
- global 및 project-scoped 설치 지원
- SSoT(Single Source of Truth) specs management system 추가
- `.cursor/specs/` 폴더 초기화를 위한 `init` 명령 추가
- features, changes, decisions(ADR) 문서 템플릿 추가
- 모든 역할 skill에 spec-aware workflow 통합
