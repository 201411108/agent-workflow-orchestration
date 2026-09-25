# Agent Workflow Orchestration

[![npm version](https://img.shields.io/npm/v/%40hankim.dev%2Fagent-workflow-orchestration.svg)](https://www.npmjs.com/package/@hankim.dev/agent-workflow-orchestration)

[English](../README.md) | 한국어

Agent Workflow Orchestration은 Cursor, Codex, Claude에서 일관된 역할 기반 AI 워크플로를 설치하고 운영하기 위한 패키지입니다. 이 패키지는 에이전트 런타임을 제공하지 않습니다. 대신 역할 계약, target별 skill 파일, 하네스 중립 Single Source of Truth, 재개 가능한 handoff 상태를 배치합니다.

## 제공하는 것

- [`agent-workflow.manifest.json`](../agent-workflow.manifest.json)에 정의된 플랫폼 중립 역할 계약
- Cursor, Codex, Claude target adapter
- `role-orchestrator`, `role-researcher`, `role-planner`, `role-designer`, `role-architect`, `role-developer`, `role-reviewer` 역할 파일
- ADS 기능 문서: `articulate.md`, `designs.md`, `specs.md`
- `.agent-workflow/`에 기록되는 공통 specs와 workflow 설정
- 모델 또는 세션 변경 시 재개할 수 있는 continuity work item
- SHA-256 소유권 해시와 sidecar 보존을 적용한 안전한 역할 파일 갱신
- 파일을 자동 변경하지 않는 대화형 일일 업데이트 안내

신규 기능의 기본 역할 체인은 `Planner → Developer → Reviewer`입니다. 근거 조사가 필요하면 Researcher, UI 변경이면 Designer, API·상태·호환성·구조 결정이면 Architect를 조건부로 삽입합니다.

## ADS Workflow

각 기능은 target specs 디렉터리 아래의 feature 폴더로 관리합니다.

```text
.agent-workflow/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

- `articulate.md`: 제품 의도 문서입니다. planner가 driver 역할로 사용자와 함께 기능이 왜 필요한지, 누구를 위한 것인지, 목표, 비목표, 제약, 성공 기준을 정리합니다.
- `designs.md`: UI/UX 상세 문서입니다. designer가 articulate를 기반으로 사용자 흐름, 상태, 정보 구조, 접근성 요구사항, 디자인 결정을 정리합니다.
- `specs.md`: 개발 참고 문서입니다. developer가 articulate와 designs를 기반으로 AI 코딩 에이전트가 계획을 세우고 코드를 만들 수 있을 만큼 구체적인 구현 맥락을 작성합니다.

이 세 문서는 일회성 handoff가 아닙니다. 개발 중 사용자와의 논의로 제품 의도, 디자인 동작, 구현 요구사항이 바뀌면 언제든 함께 갱신합니다.

## Targets

| Target | 런타임 파일 | Shared Specs Path |
|--------|------------|-------------------|
| `cursor` | `.cursor/skills/*/SKILL.md` | `.agent-workflow/specs/` |
| `codex` | `.agents/skills/role-orchestrator/SKILL.md`, `.codex/agents/role-*.toml`, `.codex/config.toml`, `AGENTS.md` 관리 블록 | `.agent-workflow/specs/` |
| `claude` | `.claude/skills/role-orchestrator/SKILL.md`, `.claude/agents/role-*.md` | `.agent-workflow/specs/` |

한 프로젝트에 여러 target 역할 파일을 함께 설치할 수 있으며 모두 동일한 공통 specs와 continuity 상태를 읽습니다.

## 설치

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor
npx @hankim.dev/agent-workflow-orchestration install --target codex
npx @hankim.dev/agent-workflow-orchestration install --target claude
```

기본 target은 `cursor`입니다. 다른 target을 추가 설치해도 기존 target 파일이나 specs를 삭제하지 않습니다.
package-owned 전체 파일에는 설치 버전과 SHA-256 소유권 해시를 기록합니다. Codex에서는 알 수 없는 TOML key와 주석을 보존하고, 호환되는 multi-agent key 중 빠진 값만 추가하며, `AGENTS.md`의 고유 marker 블록만 관리합니다. 공유 값이나 소유권이 충돌하면 Codex payload를 쓰기 전에 중단하며 `--force`도 소유하지 않은 공유 내용을 덮어쓰지 않습니다.

global 설치도 지원합니다.

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor --global
npx @hankim.dev/agent-workflow-orchestration install --target codex --global
```

Codex global 경로는 `~/.agents/skills`, `~/.codex/agents`,
`~/.codex/config.toml`, `~/.codex/AGENTS.md`의 관리 블록입니다.

## 기존 설치물 갱신

최신 CLI를 명시적으로 사용할 때는 `@latest`를 붙입니다.

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update
```

프로젝트 `update`는 `.agent-workflow/.local/state.json`에 기록된 모든 target을 갱신합니다. `--target`으로 하나만 선택할 수 있습니다. global 역할 파일은 target을 명시해야 합니다.

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update --target codex
npm install -g @hankim.dev/agent-workflow-orchestration@latest
agent-workflow-orchestration update --global --target codex
```

Codex update는 package-owned legacy `.codex/skills/role-*/AGENT.md`를 공식 구조로 이전합니다. 공개된 1.0.0이 표준 설정으로 만든 네 파일은 정확한 SHA-256 hash로 식별합니다. 그 밖의 legacy 파일은 기록된 hash 또는 전체 내용으로 package 소유권이 증명될 때만 제거하고 sidecar는 보존합니다. custom specs를 사용했거나 편집된 legacy 파일은 경로를 출력하고 수동 검토를 요구합니다. 다른 1.0.x target의 무해시 파일은 최초 전환을 다음처럼 명시적으로 수행합니다.

```bash
npx @hankim.dev/agent-workflow-orchestration@latest update --force
```

`update`와 `uninstall`은 package 소유권과 Codex 공유 파일 entry를 먼저 검사합니다. 수정, 누락, 충돌, 소유권 증명 실패가 있으면 target 파일을 변경하기 전에 중단합니다. `--force`는 기록된 package-owned 전체 파일을 복구할 수 있지만 소유하지 않은 Codex 공유 내용을 조용히 덮거나 삭제하지 않습니다.

기존 TOML 주석, 알 수 없는 key, dotted managed key, CRLF 줄바꿈은 보존합니다.
`features` 또는 `agents` inline table, 비활성화된 필수 flag, 3보다 작은 thread
상한은 임의로 덮어쓰지 않고 충돌로 보고합니다.

### Codex는 프로젝트 trust가 필요합니다

신뢰되지 않은 프로젝트에서는 Codex가 `.codex/` 레이어 전체를 건너뜁니다. 파일이
정상 설치되어 있어도 custom agent와 병합된 설정이 무시됩니다. trust는 신뢰된 경로의
하위 디렉터리로 상속됩니다.

`doctor`가 trust 상태를 보고하므로 설치는 됐는데 동작하지 않는 상황을 진단할 수 있습니다.

```bash
agent-workflow-orchestration doctor --target codex
```

`.agents/skills/`의 오케스트레이터 스킬은 `.codex/` 밖이라 trust 없이도 로드됩니다.

Codex 설치 또는 갱신 후 프로젝트를 trusted 상태로 열고 새 Codex 세션을 시작합니다.
`/skills`에서 `role-orchestrator`, `/agent`에서 활성 custom agent thread를
확인합니다.

## Specs 초기화

공통 specs 디렉터리와 예시 ADS 문서를 생성합니다.

```bash
npx @hankim.dev/agent-workflow-orchestration init
```

생성 구조:

```text
your-project/
├── .cursor/
│   ├── skills/
│   │   ├── role-orchestrator/SKILL.md
│   │   ├── role-planner/SKILL.md
│   │   ├── role-designer/SKILL.md
│   │   └── role-developer/SKILL.md
└── .agent-workflow/
    ├── workflow.json
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

## 기능 문서 생성

```bash
npx @hankim.dev/agent-workflow-orchestration feature --name user-onboarding
```

이 명령은 다음 파일을 생성합니다.

```text
.agent-workflow/specs/features/user-onboarding/
├── articulate.md
├── designs.md
└── specs.md
```

기존 기능 문서는 기본적으로 보존됩니다. 덮어쓰려면 `--force`를 사용합니다.

공통 specs 위치는 `workflow.json.specsRoot`가 결정합니다. 프로젝트 안에 머무는 상대 경로만 허용합니다.

```json
{
  "schemaVersion": 2,
  "specsRoot": "docs/agent-specs",
  "continuity": { "storage": "local" },
  "migrations": []
}
```

## 연속성 및 이전 문서 반입

기존 target별 specs는 원본을 수정하지 않는 명시적 import로 반입합니다.

```bash
agent-workflow-orchestration import --from cursor --dry-run
agent-workflow-orchestration import --from cursor
```

기능 문서가 존재하면 모델 또는 세션 변경 뒤 이어받을 work item을 만들 수 있습니다.

```bash
agent-workflow-orchestration work --name implement-onboarding --feature user-onboarding
agent-workflow-orchestration advance --name implement-onboarding --phase implementation --role role-developer --next-role role-reviewer
agent-workflow-orchestration resume --name implement-onboarding
```

`work`의 기본 next role은 Developer입니다. `work`와 `advance`에서 `--next-role <role>` 또는 `--next-role none`으로 실제 handoff를 저장할 수 있습니다.

기본적으로 work item은 `.agent-workflow/.local/` 아래에 저장되어 버전 관리에서 제외됩니다. `.agent-workflow/workflow.json`에서 `"continuity": { "storage": "project" }`를 설정하면 새 work item을 저장소를 통해 공유합니다. `resume`, `advance`, 강제 work item 갱신은 두 위치를 모두 검색하므로 설정을 바꿔도 기존 작업을 계속할 수 있습니다. 같은 ID가 양쪽에 있으면 두 경로를 출력하고 중단합니다.

legacy target specs는 먼저 충돌을 미리 확인한 뒤 반입합니다. 원본은 삭제하지 않습니다.

```bash
agent-workflow-orchestration import --from cursor --dry-run
agent-workflow-orchestration import --from cursor
```

## 업데이트 안내

대화형 TTY 실행에서는 npm `latest`를 하루에 최대 한 번, 800ms 제한 시간으로 확인합니다. 실패는 1시간 캐시하며 명령 결과에는 영향을 주지 않습니다. CI와 non-TTY에서는 확인하지 않습니다. `AGENT_WORKFLOW_NO_UPDATE_CHECK=1` 또는 `NO_UPDATE_NOTIFIER=1`로 끌 수 있습니다.

안내는 파일이나 패키지를 자동 갱신하지 않습니다. 1.0.0에는 이 기능이 없으므로 최초 1.1.0 전환은 GitHub Release 또는 이 migration 안내를 통해 확인해야 합니다.

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

target 준비 상태를 점검합니다.

- target runtime 경로(Codex skill, agent, config, guidance 포함)
- 공통 specs와 workflow 설정
- import 가능한 legacy specs
- target별 설치된 역할 파일
- `package.json`의 `lint`, `test`, `typecheck` 스크립트

### `validate`

패키지 내부 정합성을 점검합니다.

- 역할 계약과 required output key
- target adapter 렌더링
- 필수 template 파일
- package metadata

## 검증 전략

이 워크플로를 검증하기 위해 매번 미니 프로젝트를 직접 돌릴 필요는 없습니다. 이 패키지는 계층별 자동 검증을 제공합니다.

- `npm run validate`: manifest, role 파일, adapter, template, package metadata를 검증합니다.
- `npm run check:readme`: 영어/한국어 README 링크와 핵심 명령어 참조를 검증합니다.
- `npm run test:smoke`: 임시 fixture에서 소유권 해시, sidecar 안전성, 공통 specs, legacy import, continuity resume, 안전한 갱신·삭제를 확인합니다.
- `npm run test:update-check`: 실제 registry 대신 로컬 mock과 fake clock으로 최신/동일/timeout/offline/cache/CI/opt-out을 확인합니다.
- `npm run check`: 위 검증을 모두 실행합니다.

미니 프로젝트는 마지막 acceptance test로는 유용하지만, 핵심 워크플로는 자동 fixture test로 검증합니다.

## 로컬 개발

```bash
npm run validate
npm run check:readme
npm run test:smoke
npm run test:update-check
npm run check
```

## 기여 방법

1. 역할 계약을 바꾸면 `agent-workflow.manifest.json`과 `skills/`를 함께 갱신합니다.
2. target 동작을 바꾸면 `adapters/`, `bin/cli.js`, `templates/`, `scripts/fixture-smoke.js`를 함께 점검합니다.
3. CLI 출력이나 생성 구조가 바뀌면 `README.md`와 `README.ko.md`를 함께 갱신합니다.
4. 배포나 PR 전에 `npm run check`를 실행합니다.

## 요구사항

- Cursor, Codex, Claude 중 하나
- Node.js >= 14.14.0

## License

MIT
