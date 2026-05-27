---
name: role-orchestrator
description: >-
  ADS(articulate/designs/specs) 문서 루프를 기준으로 사용자 요청을 분류하고
  planner/designer/developer 역할의 실행 순서와 문서 핸드오프를 고정한다.
inputs:
  required:
    - user_request
  optional:
    - project_context
    - specs_context
    - attached_urls
outputs:
  required:
    - task_classification
    - active_roles
    - role_handoff_blocks
    - final_summary
required_tools:
  - file_read
optional_tools:
  - glob_search
  - text_search
fallbacks:
  - specs 폴더가 없으면 문서 기반 컨텍스트 없이 진행하고 init 또는 feature 명령을 안내한다.
  - 특정 역할 스킬을 찾지 못하면 해당 역할을 생략하지 말고 사용자에게 제한사항을 명시한다.
---

# Role: Orchestrator

이 스킬은 실행 엔진이 아니라 ADS 문서 기반 역할 체인 계약을 고정하는 orchestration 레이어다.
기능 단위 SoT는 `features/{feature-name}/articulate.md`, `designs.md`, `specs.md` 순서로 읽고 갱신한다.

## Inputs

### Required

- `user_request`: 사용자의 원문 요청

### Optional

- `project_context`: 현재 프로젝트의 스택, 구조, 제약
- `specs_context`: target-specific specs 디렉터리에서 읽은 ADS 문서 요약
- `attached_urls`: 피그마, 이슈, 문서 링크

## Outputs

반드시 아래 4개 블록을 순서대로 만든다.

1. `task_classification`
2. `active_roles`
3. `role_handoff_blocks`
4. `final_summary`

### Output Contract

```markdown
## 작업 분석 결과

### task_classification
- 요청 유형: [articulate | design | spec | implementation | bugfix | refactor | review | mixed]
- 관련 feature: [features/{feature-name} 또는 미확인]
- 문서 상태: [articulate/designs/specs 각각 present | missing | stale | unknown]
- 근거: [1-2줄]

### active_roles
- 순서: [role-planner -> role-designer -> role-developer]
- 제외된 역할: [없으면 "없음"]

### role_handoff_blocks
#### role-planner
- 목표:
- 읽을 문서:
- 작성/갱신할 문서:
- 다음 역할 입력:

#### role-designer
- 목표:
- 읽을 문서:
- 작성/갱신할 문서:
- 다음 역할 입력:

#### role-developer
- 목표:
- 읽을 문서:
- 작성/갱신할 문서:
- 다음 역할 입력:

### final_summary
- 완료된 분석:
- 아직 미해결인 점:
- ADS 기록 여부:
```

## Routing Rules

| 요청 유형 | 활성 역할 |
|-----------|-----------|
| 신규 기능 또는 상위 기획 | `role-planner -> role-designer -> role-developer` |
| articulate 작성/수정 | `role-planner` |
| UI/UX 상세화 | `role-designer -> role-developer` |
| 구현 specs 작성 | `role-developer` |
| 코드 구현 | `role-developer` |
| 버그 수정 | `role-developer` |
| 리팩토링 | `role-developer` |
| 복합 요청 | `role-planner -> role-designer -> role-developer` |

아래 조건이면 역할을 추가한다:

- 왜/무엇을 위한 기능인지 불명확함: `role-planner`
- UI 흐름, 화면, 상태, 접근성 변경 필요: `role-designer`
- 구현 계획, 코드 변경, 검증 필요: `role-developer`

## Execution Rules

1. target-specific specs의 `features/{feature-name}/` 아래 `articulate.md`, `designs.md`, `specs.md`를 우선 확인한다.
2. 관련 feature 폴더가 없으면 `agent-workflow-orchestration feature --target {target} --name {feature-name}` 생성을 권장한다.
3. 문서가 누락된 단계부터 역할을 시작한다. 예: `articulate.md`가 없으면 planner부터 시작한다.
4. 각 역할 실행 결과는 다음 역할의 입력으로 핵심 결정, 리스크, 미결정 질문만 압축 전달한다.
5. 최종 응답에는 실제로 확인된 문서 상태와 추론을 구분한다.

## Fallback Rules

- `glob_search`가 없으면 직접 경로를 확인하고 파일 목록을 수동 탐색한다.
- 관련 ADS 문서가 없으면 `specs_context`를 비워두고 계속 진행한다.
- 역할 스킬을 열 수 없으면 그 사실을 노출하고 일반 추론 모드로 작업하되, 해당 역할 산출물은 "degraded"로 표시한다.
- 단순 질문, 파일 읽기, 사소한 단일 수정은 이 스킬을 건너뛴다.
