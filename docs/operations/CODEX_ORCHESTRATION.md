# Codex 역할 기반 오케스트레이션 운영 가이드

## 개요

이 저장소의 프로젝트 전용 Codex 오케스트레이션은 공식 로컬 탐색 경로를 사용한다.
오케스트레이터는 저장소 스킬이고, planner·designer·developer는 서로 다른 실행
권한과 책임을 가진 custom agent다.

2026-07-25에 확인한 공식 Codex 매뉴얼의 `Build skills`, `Subagents`,
`Custom instructions with AGENTS.md`, `Configuration Reference` 규약을 기준으로
구성했다. 원문은 [Codex manual](https://developers.openai.com/codex/codex-manual.md)에서
확인할 수 있다.

## 변경 전 문제

- 프로젝트 루트에 Codex가 자동 탐색하는 `.agents/skills` 스킬이 없었다.
- `skills/role-*`는 패키지 배포용 역할 계약 소스였으며 현재 프로젝트의 Codex
  저장소 스킬로 자동 로드되는 경로가 아니었다.
- 루트 `AGENTS.md`, 프로젝트 custom agent, multi-agent 프로젝트 설정이 없었다.
- 역할 계약은 있었지만 현재 저장소에서 planner·designer·developer를 별도 agent
  thread로 실행하는 프로젝트 구성은 없었다.
- 요청에서 언급된 `.codex/skills/role-*/AGENT.md`,
  `.agent-workflow/state.json`, `current-work.md`는 작업 시작 시 현재 Git 트리와
  전체 Git 이력에 존재하지 않았다. 따라서 추적 파일 삭제나 사용자 파일 변경은
  수행하지 않았다.

## 변경 후 구조

```text
.
├── AGENTS.md
├── .agents/
│   └── skills/
│       └── feature-orchestrator/
│           └── SKILL.md
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── planner.toml
│       ├── designer.toml
│       └── developer.toml
└── docs/
    └── operations/
        └── CODEX_ORCHESTRATION.md
```

## 스킬과 custom agent의 차이

| 구분 | 스킬 | custom agent |
|---|---|---|
| 목적 | 반복 가능한 분류·라우팅 절차 | 역할별 독립 실행 세션 |
| 이 저장소의 대상 | `feature-orchestrator` | `planner`, `designer`, `developer` |
| 프로젝트 경로 | `.agents/skills/<name>/SKILL.md` | `.codex/agents/<name>.toml` |
| 호출 | `/skills`, `$feature-orchestrator`, 설명 기반 암시 호출 | 오케스트레이터 또는 사용자 요청으로 위임 |
| 컨텍스트 | 선택되면 `SKILL.md` 본문 로드 | 압축된 역할 인계로 별도 agent thread 실행 |
| 권한 | 메인 세션 정책에 따름 | planner/designer는 `read-only`, developer는 부모 설정 상속 |

특정 모델과 reasoning effort는 고정하지 않았다. 각 custom agent는 명시적 spawn
설정, `[agents]` 기본값, 부모 세션 값의 공식 우선순위를 따른다.

## 역할별 책임

### planner

- 기존 SSoT와 요구사항을 먼저 확인한다.
- MUST/SHOULD/COULD, 수용 기준, 엣지 케이스, 비기능 요구사항, 미결정 사항을
  구조화한다.
- `sandbox_mode = "read-only"`이며 앱 코드를 수정하지 않는다.

### designer

- 기존 UI 패턴, 디자인 토큰, 접근성, 상태 표현, 반응형 및 플랫폼 차이를 검토한다.
- 구현 가능한 디자인 결정과 developer 인계를 작성한다.
- `sandbox_mode = "read-only"`이며 앱 코드를 수정하지 않는다.

### developer

- planner/designer 인계를 구현 체크리스트로 변환한다.
- 기존 코드 패턴과 프로젝트 규칙을 우선해 코드와 테스트를 수정한다.
- 실제 실행한 lint, typecheck, test만 보고하고 미검증 항목과 리스크를 남긴다.

## 요청 유형별 라우팅

| 요청 유형 | 역할 순서 |
|---|---|
| UI가 포함된 신규 기능 | planner → designer → developer |
| UI가 없는 신규 기능 | planner → developer |
| UI/UX 개선 | designer → developer |
| 버그 수정·리팩터링 | developer |
| 기획 검토 | planner |
| 디자인 리뷰 | designer |
| 복합 요청 | 필요한 역할만 조합 |
| 단순 질의·파일 읽기·사소한 단일 수정 | 오케스트레이터와 위임 생략 가능 |

역할 사이에는 전체 대화나 원시 로그 대신 목표, 확인된 사실, 결정 사항, 가정,
리스크, 미결정 사항, 미검증 항목, 다음 역할 입력을 전달한다. 의존하는 역할은
앞 역할이 완료된 뒤 시작한다.

## 호출 예시

### 신규 기능 요청

```text
프로필 편집 기능을 새로 개발해줘.
```

UI가 필요한 요청이라면 메인 에이전트는 작업 전에 다음과 같이 알리고 역할을
순서대로 실행한다.

```text
작업 분류: UI가 포함된 신규 기능 | 활성 역할: planner → designer → developer
```

### 오케스트레이터 명시 호출

```text
$feature-orchestrator 결제 수단 관리 기능을 요구사항부터 구현까지 진행해줘.
```

### 역할 명시 위임

```text
planner custom agent에 현재 로그인 요구사항의 엣지 케이스만 검토하도록 위임해줘.
```

```text
designer custom agent에 설정 화면의 접근성과 오류 상태를 리뷰하도록 위임해줘.
```

## 로딩 및 실행 확인

`AGENTS.md`는 세션 시작 시 instruction chain에 포함된다. 프로젝트 설정이나
`AGENTS.md`를 변경한 뒤에는 새 세션을 시작하거나 Codex를 재시작한다. 스킬 변경은
자동 감지될 수 있지만 목록에 나타나지 않으면 재시작한다.

새 세션에서 다음 스모크 테스트를 순서대로 수행한다.

1. `/skills`에서 `feature-orchestrator`를 확인한다.
2. `프로필 편집 기능을 새로 개발해줘` 같은 테스트 요청을 실행한다.
3. 작업 분류와 활성 역할 안내를 확인한다.
4. `/agent`에서 선택된 역할 thread를 확인한다.
5. planner → designer 또는 developer의 압축 인계를 확인한다.
6. 모든 역할 완료 후 메인 에이전트의 통합 검증을 확인한다.

`/agent`는 실행 중이거나 완료된 agent thread를 검사하고 전환하는 용도다. 역할을
직접 요청할 때는 위 예시처럼 prompt에서 custom agent 이름과 범위를 명시한다.

프로젝트 `.codex` 설정과 custom agent는 trusted project에서만 로드된다. 소비자
프로젝트에서는 설치 또는 갱신 후 프로젝트를 trusted 상태로 열고 새 세션을
시작해야 한다.

## 소비자 프로젝트 설치와 갱신

프로젝트 범위:

```bash
npx @hankim.dev/agent-workflow-orchestration@latest install --target codex
npx @hankim.dev/agent-workflow-orchestration@latest update --target codex
```

global 범위:

```bash
npx @hankim.dev/agent-workflow-orchestration@latest install --global --target codex
npx @hankim.dev/agent-workflow-orchestration@latest update --global --target codex
```

프로젝트 설치는 `.agents/skills`, `.codex/agents`, `.codex/config.toml`, 루트
`AGENTS.md`에 적용된다. global 설치는 각각 `~/.agents/skills`,
`~/.codex/agents`, `~/.codex/config.toml`, `~/.codex/AGENTS.md`에 적용된다.

- skill과 세 agent TOML은 SHA-256 hash로 추적하는 package-owned 전체 파일이다.
- config는 기존 주석과 알 수 없는 key를 보존하고 multi-agent key만 병합한다.
- guidance는 고유한 `BEGIN/END` marker 사이 블록만 관리한다.
- 모든 파일의 소유권과 공유 설정을 preflight한 뒤 쓰므로 발견 가능한 충돌 시
  Codex payload를 일부만 적용하지 않는다.
- `--force`도 소유하지 않은 공유 config/guidance나 소유권이 불명확한 legacy 파일을
  덮거나 삭제하지 않는다.
- uninstall은 package가 추가한 key와 marker 블록만 제거하고 소비자 내용을
  보존한다.
- config 병합은 주석, 알 수 없는 key, dotted managed key, CRLF를 보존한다.
  inline table로 정의된 managed namespace, 비활성화된 필수 flag, 3보다 작은 thread
  상한은 충돌로 처리한다.

공개된 1.0.0이 표준 설정으로 생성한 네 legacy
`.codex/skills/role-*/AGENT.md`는 정확한 SHA-256 hash로 식별한다. 그 밖의 파일은
state hash가 현재 파일과 일치하거나 전체 파일이 알려진 package 생성본과 일치할
때만 제거한다. 같은 역할 디렉터리의 sidecar는 보존한다. custom specs를 사용했거나
편집되어 소유권을 증명할 수 없는 파일은 update가 경로와 이유를 출력하고 중단하므로
먼저 백업하고 내용을 수동 검토해야 한다.

### 배포와 소비자 업데이트

PR merge만으로 npm 소비자가 갱신되지는 않는다. CI 통과와 merge 후 package
maintainer가 `1.1.0`을 npm에 publish하고 아래 명령으로 registry 상태를 확인해야
한다.

```bash
npm view @hankim.dev/agent-workflow-orchestration version
```

publish 후 소비자는
`npx @hankim.dev/agent-workflow-orchestration@latest update --target codex`를
실행하고 trusted project의 새 Codex 세션을 시작한다. 전역 설치 사용자는
`npm install -g @hankim.dev/agent-workflow-orchestration@latest`로 package를
갱신한 뒤 `agent-workflow-orchestration update --global --target codex`를
실행한다.

## 실패 및 degraded 동작

서브에이전트 도구가 비활성화됐거나 custom agent를 시작할 수 없으면 다음을
사용자에게 알린다.

- `상태: degraded`
- 사용할 수 없는 역할
- 생략되는 기획·디자인·구현 검토
- 메인 에이전트 결과의 제한과 미검증 항목

이 경우 일반 추론을 별도 역할 실행처럼 보고하지 않는다. 안전하게 가능한 메인
작업은 계속할 수 있지만 위임 성공으로 기록하지 않는다.

## 설정 유지보수

- 스킬의 이름이나 적용 범위를 바꾸면 `SKILL.md`의 `name`, `description`,
  라우팅 표와 루트 `AGENTS.md` 연결을 함께 확인한다.
- custom agent를 바꾸면 TOML의 `name`, `description`, `developer_instructions`
  필수 필드와 역할 권한을 검사한다.
- planner/designer의 `sandbox_mode = "read-only"`를 유지한다.
- developer에는 모델을 고정하지 않고 부모 세션 설정 상속을 우선한다.
- 역할 수가 바뀌면 `.codex/config.toml`의
  `max_concurrent_threads_per_session`이 실제 최대 활성 역할 수와 맞는지 검토한다.
- 수동 상태 파일을 현재 작업의 SSoT로 만들지 않는다. 결정과 결과는 역할 인계,
  최종 응답, 기존 SSoT와 변경 이력에 기록한다.
- 정적 검사는 YAML frontmatter, TOML 문법·필수 필드, 레거시 프로젝트 경로,
  `AGENTS.md` 연결, `git diff --check`, 비밀정보 포함 여부를 다룬다.
- 런타임 검사는 반드시 새 세션에서 `/skills`와 `/agent`로 별도 수행한다.

## 마이그레이션 및 제거

- 기존 orchestrator 계약의 분류·라우팅 개념은
  `.agents/skills/feature-orchestrator/SKILL.md`로 옮겼다.
- planner·designer·developer 책임은 `.codex/agents/*.toml`의 실제 custom agent로
  분리했다.
- 프로젝트 규칙과 위임 조건은 루트 `AGENTS.md`에 연결했다.
- 현재 checkout에는 `.codex/skills/*/AGENT.md`가 없어 제거한 파일이 없다.
- 현재 checkout과 Git 이력에는 루트 `.agent-workflow/state.json` 및
  `current-work.md`가 없어 제거한 파일이 없다. 앞으로도 자동 갱신 장치 없이
  이러한 수동 상태 파일을 SSoT로 사용하지 않는다.
- 루트 `skills/`와 `agent-workflow.manifest.json`의 기존 다중 target 역할 계약은
  유지했다. Codex adapter는 공식 runtime bundle을 설치하도록 갱신했으며
  Cursor/Claude adapter 동작은 유지했다.

## 업데이트 노트

### 2026-07-29

- npm 소비자 프로젝트와 global 범위에 공식 Codex skill, custom agent, multi-agent
  설정, guidance 관리 블록을 설치하도록 CLI와 package payload를 연결했다.
- config key-level 병합, guidance marker 병합, full-file hash 소유권, legacy
  `AGENT.md` 안전 제거와 sidecar 보존을 구현했다.
- install/update/uninstall의 preflight 충돌 처리와 project/global fixture 검증을
  추가했다.
- 공개 1.0.0 표준 legacy 출력의 정확한 hash 기반 이전, dotted TOML과 CRLF 보존,
  inline table·부족한 thread 상한 충돌 검증을 추가했다.
- 배포 후 실제 runtime 로딩은 trusted project의 새 세션에서 `/skills`와 `/agent`
  스모크 테스트로 확인해야 한다.
- 소비자 배포 구현 커밋:
  `b11cc8957c01457b6d2b383f5a65de6203e74ae0`

### 2026-07-25

- 공식 Codex 저장소 스킬 경로에 `feature-orchestrator`를 추가했다.
- planner, designer, developer를 프로젝트 custom agent로 추가했다.
- multi-agent 기능을 명시적으로 활성화하고 동시 agent thread를 최대 3개로
  제한했다.
- 루트 `AGENTS.md`에 오케스트레이터 우선 호출, 최소 역할 선택, 압축 인계,
  메인 에이전트 통합 검증, 브랜치·커밋 규칙을 추가했다.
- 설정 커밋: `9b3a24c55ff90135e9de10e464098d4042790c12`
- 정적 검증은 완료했으며 새 세션의 실제 스킬 선택과 custom agent thread 실행은
  위 스모크 테스트로 남겼다.
