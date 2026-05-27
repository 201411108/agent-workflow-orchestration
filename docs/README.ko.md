# Agent Workflow Orchestration

[![npm version](https://img.shields.io/npm/v/%40hankim.dev%2Fagent-workflow-orchestration.svg)](https://www.npmjs.com/package/@hankim.dev/agent-workflow-orchestration)

[English](../README.md) | 한국어

Agent Workflow Orchestration은 Cursor, Codex, Claude에서 일관된 역할 기반 AI 워크플로를 설치하고 운영하기 위한 패키지입니다. 이 패키지는 에이전트 런타임을 제공하지 않습니다. 대신 역할 계약, target별 skill 파일, 하네스 중립 Single Source of Truth, 재개 가능한 handoff 상태를 배치합니다.

## 제공하는 것

- [`agent-workflow.manifest.json`](./agent-workflow.manifest.json)에 정의된 플랫폼 중립 역할 계약
- Cursor, Codex, Claude target adapter
- `role-orchestrator`, `role-researcher`, `role-planner`, `role-designer`, `role-architect`, `role-developer`, `role-reviewer` 역할 파일
- ADS 기능 문서: `articulate.md`, `designs.md`, `specs.md`
- `.agent-workflow/`에 기록되는 공통 specs와 workflow 설정
- 모델 또는 세션 변경 시 재개할 수 있는 continuity work item

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

| Target | Skills Path | Shared Specs Path | Role File |
|--------|-------------|------------|-----------|
| `cursor` | `.cursor/skills/` | `.agent-workflow/specs/` | `SKILL.md` |
| `codex` | `.codex/skills/` | `.agent-workflow/specs/` | `AGENT.md` |
| `claude` | `.claude/skills/` | `.agent-workflow/specs/` | `CLAUDE.md` |

한 프로젝트에 여러 target 역할 파일을 함께 설치할 수 있으며 모두 동일한 공통 specs와 continuity 상태를 읽습니다.

## 설치

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor
npx @hankim.dev/agent-workflow-orchestration install --target codex
npx @hankim.dev/agent-workflow-orchestration install --target claude
```

기본 target은 `cursor`입니다. 다른 target을 추가 설치해도 기존 target 파일이나 specs를 삭제하지 않습니다.

역할 파일은 global 설치도 지원합니다.

```bash
npx @hankim.dev/agent-workflow-orchestration install --target cursor --global
```

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

## 연속성 및 이전 문서 반입

기존 target별 specs는 원본을 수정하지 않는 명시적 import로 반입합니다.

```bash
agent-workflow-orchestration import --from cursor --dry-run
agent-workflow-orchestration import --from cursor
```

기능 문서가 존재하면 모델 또는 세션 변경 뒤 이어받을 work item을 만들 수 있습니다.

```bash
agent-workflow-orchestration work --name implement-onboarding --feature user-onboarding
agent-workflow-orchestration advance --name implement-onboarding --phase implementation --role role-developer
agent-workflow-orchestration resume --name implement-onboarding
```

기본적으로 work item은 `.agent-workflow/.local/` 아래에 저장되어 버전 관리에서 제외됩니다. `.agent-workflow/workflow.json`에서 `"continuity": { "storage": "project" }`를 설정하면 저장소를 통해 공유합니다.

## CLI

```bash
agent-workflow-orchestration install --target cursor
agent-workflow-orchestration install --target codex
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

- target skills 디렉터리
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
- `npm run test:smoke`: 임시 fixture에서 다중 target 설치, 공통 specs, legacy import, continuity resume, doctor, 안전한 uninstall 동작을 확인합니다.
- `npm run check`: 위 검증을 모두 실행합니다.

미니 프로젝트는 마지막 acceptance test로는 유용하지만, 핵심 워크플로는 자동 fixture test로 검증합니다.

## 로컬 개발

```bash
npm run validate
npm run check:readme
npm run test:smoke
npm run check
```

## 기여 방법

1. 역할 계약을 바꾸면 `agent-workflow.manifest.json`과 `skills/`를 함께 갱신합니다.
2. target 동작을 바꾸면 `adapters/`, `bin/cli.js`, `templates/`, `scripts/fixture-smoke.js`를 함께 점검합니다.
3. CLI 출력이나 생성 구조가 바뀌면 `README.md`와 `README.ko.md`를 함께 갱신합니다.
4. 배포나 PR 전에 `npm run check`를 실행합니다.

## 요구사항

- Cursor, Codex, Claude 중 하나
- Node.js >= 14.0.0

## License

MIT
