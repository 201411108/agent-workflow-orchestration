# 변경 이력

이 프로젝트의 주요 변경 사항을 기록합니다.

영어 변경 이력은 [`../CHANGELOG.md`](../CHANGELOG.md)를 참고하세요.

## [Unreleased]

### Added

- 역할 3개 추가: `role-analyst`(외부 근거와 지표), `role-qa`(수용 기준을 실행
  가능한 테스트로), `role-releaser`(배포와 롤백). 총 10개 역할
- 역할 선언이 배정을 결정한다. `capabilities`, `produces`, `consumes`,
  `optionalConsumes`가 고정 라우팅 표를 대체한다
- 모든 역할이 공유하는 핸드오프 봉투. 출처 있는 사실, 분리된 가정, 차단 질문,
  필요한 능력, 명시적 범위를 담는다
- 모든 역할 계약에 `Activation`, `Done Criteria`, `Stop Conditions`
- 역할별 도구 바인딩을 타깃 네이티브 구문으로 렌더링
- 동작 검증 하네스(`npm run eval`). 판정기는 모델을 호출하지 않으며
  `npm run check`에서 매번 자체 검증된다
- `doctor`가 Codex 프로젝트 trust를 보고한다. 신뢰되지 않은 프로젝트는
  `.codex/` 레이어 전체를 조용히 건너뛴다
- `npm run check:package`가 배포 산출물에 제품 파일만 있고 런타임에 필요한
  파일이 빠지지 않았는지 검사한다

### Changed

- Claude 타깃이 역할을 `.claude/agents/`의 서브에이전트로, 오케스트레이터를
  스킬로 설치한다. 이전 레이아웃은 `.claude/skills/`에 `CLAUDE.md`를 썼고
  Claude Code가 그것을 로드하지 않았다
- Codex가 10개 역할을 모두 배포한다. 이전에는 custom agent 3개만 나갔다
- 역할 파일을 손으로 쓴 payload 사본이 아니라 manifest와 역할 계약에서 렌더링한다
- `mutationPolicy`를 타깃 네이티브 권한 키로 매핑하고, 도구 허용 목록을 정책별
  고정값이 아니라 역할 선언에서 도출한다
- 배포 패키지에서 개발 문서, 검증 하네스, 저장소 테스트 스크립트를 제외한다

### Fixed

- Claude 타깃이 스킬로 탐색되지 않는 파일을 생성하던 문제
- `role-reviewer`가 `mutationPolicy: none`인데 `test_runner`를 통해 `Bash`를
  받아 읽기 전용이 아니던 문제
- 배포된 역할 파일이 소비자 프로젝트에 존재하지 않는 `Source: skills/role-*.md`
  경로를 가리켰고 역할이 그것을 근거로 인용하던 문제
- 기존 cursor 설치본을 갱신할 때 소유권 키 형식이 바뀌어 중단되던 문제
- 이전 레이아웃의 역할 파일이 고아로 남지 않고 마이그레이션된다

#### 이전 미출시 항목

## [이전 Unreleased]

### 추가

- 공식 skill, custom agent, config, guidance 경로를 project/global 범위에 설치하는
  배포 가능한 Codex runtime payload와 fixture 검증 추가
- package 검사와 pack 내용 검증을 실행하는 pull request CI 추가
- 공식 `.agents/skills` 탐색 경로에 프로젝트 전용 Codex
  `feature-orchestrator` 스킬 추가
- `.codex/agents`에 읽기 전용 planner·designer와 developer custom agent 추가
- 프로젝트 multi-agent 설정과 저장소 오케스트레이션 규칙 추가
- 마이그레이션 노트와 새 세션 스모크 테스트를 포함한 Codex 운영 가이드 추가
- 기존 PR 구조를 반영한 재사용 가능한 pull request 템플릿 추가

### 변경

- Codex install/update/uninstall이 공유 TOML 주석과 알 수 없는 key를 보존하고,
  `AGENTS.md` marker 블록만 관리하며, 전체 파일 소유권과 증명 가능한 legacy
  `AGENT.md` 안전 이전을 처리하도록 변경
- 표준 Codex 1.0.0 출력은 정확한 hash로 식별하고 dotted TOML과 CRLF를 보존하며,
  안전하지 않은 managed namespace 형식은 preflight에서 중단하도록 변경
- Codex 프로젝트 작업이 요청에 필요한 역할만 선택하고 역할 간에 결정, 리스크,
  미결정 사항, 검증 공백을 압축 전달하도록 변경
- 변경 기록 및 ADR 템플릿에 남아 있던 한국어 문구를 영어로 통일
- 설정 커밋 `9b3a24c55ff90135e9de10e464098d4042790c12`을 마이그레이션
  변경 이력에 기록
- 소비자 배포 구현 커밋
  `b11cc8957c01457b6d2b383f5a65de6203e74ae0`을 변경 이력에 기록

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
