# 변경 이력

이 프로젝트의 주요 변경 사항을 기록합니다.

영어 변경 이력은 [`../CHANGELOG.md`](../CHANGELOG.md)를 참고하세요.

## [Unreleased]

## [1.1.0] - 2026-07-25

### 추가

- `.agent-workflow/specs/` 공통 SoT와 재개 가능한 work item 명령
- target별 기존 specs를 원본 보존 방식으로 반입하는 `import` 명령
- researcher, architect, reviewer 역할 계약
- `articulate.md`, `designs.md`, `specs.md` 템플릿을 사용하는 ADS 기능 워크플로 추가
- 기능 단위 ADS 문서를 생성하는 `feature --name` CLI 명령 추가
- 영어를 기본 README로 두고 한국어 문서를 `docs/README.ko.md`에서 관리
- 프로젝트 전체 또는 선택한 project/global target을 안전하게 갱신하는 `update` 명령
- target별 설치 버전과 역할 파일의 SHA-256 소유권 해시
- `work`, `advance`의 `--next-role <role|none>` handoff 저장
- timeout, cache, CI/non-TTY skip, opt-out을 지원하는 npm 업데이트 안내
- Node 14 호환 `semver` 의존성과 `npm ci` 릴리스 검사

### 변경

- planner가 articulate를 주도하고 developer와 reviewer가 잇는 기본 역할 체인으로 갱신
- 여러 target adapter가 하나의 공통 SoT를 함께 읽도록 설치 정책 변경
- install/update/uninstall이 adapter 역할 파일만 처리하고 역할 디렉터리의 sidecar를 보존
- 수정·누락·legacy 무해시 파일이 있으면 비강제 갱신과 삭제를 변경 전에 중단
- `workflow.json.specsRoot`를 모든 specs 명령과 역할 문서 생성에 적용하고 프로젝트 경계를 검증
- work item을 local/project 양쪽에서 검색하고 기존 위치 유지 및 중복 ID 거부
- 새 work item은 schema v2로 생성하고 schema v1 resume 호환 유지
- resume에 work 파일, 실제 task/blocker, 갱신 시각, handoff/verification 경로 출력
- target별 ADS scaffold와 안전한 갱신을 검증하도록 테스트 강화

### 수정

- work item 생성 시 handoff/verification 날짜 placeholder 치환
- `.gitignore` 끝에 개행이 없어도 `.local/` 규칙을 새 줄에 추가

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
