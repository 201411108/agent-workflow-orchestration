---
name: role-orchestrator
description: >-
  ADS(articulate/designs/specs) 문서 루프를 기준으로 사용자 요청을 분류하고
  planner/developer/reviewer 기본 체인과 조건부 역할의 실행 순서를 고정한다.
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
mutation_policy: docs-only
optional_tools:
  - glob_search
  - text_search
fallbacks:
  - specs 폴더가 없으면 문서 기반 컨텍스트 없이 진행하고 init 또는 feature 명령을 안내한다.
  - 특정 역할 스킬을 찾지 못하면 해당 역할을 생략하지 말고 사용자에게 제한사항을 명시한다.
---

# Role: Orchestrator

이 스킬은 실행 엔진이 아니라 ADS 문서 기반 역할 체인 계약을 고정하는 orchestration 레이어다.
기능 단위 SoT는 `.agent-workflow/specs/features/{feature-name}/articulate.md`, `designs.md`, `specs.md` 순서로 읽고 갱신한다.
작업을 재개할 때는 configured continuity storage의 `work-items/{work-id}/work.json`, `handoff.md`, `verification.md`를 먼저 읽는다.

## Activation

- 필요한 조건: 요청이 둘 이상의 역할을 거쳐야 하거나, 어떤 역할이 필요한지 불분명하다.
- 건너뛰어도 되는 조건: 단순 질의, 파일 읽기, 단일 파일의 사소한 수정, 또는 사용자가
  특정 역할을 직접 지명했다.

## Inputs

### Required

- `user_request`: 사용자의 원문 요청

### Optional

- `project_context`: 현재 프로젝트의 스택, 구조, 제약
- `specs_context`: `.agent-workflow/specs/`에서 읽은 ADS 문서 요약
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
- 순서: [role-planner -> role-developer -> role-reviewer]
- 제외된 역할: [없으면 "없음"]

### role_handoff_blocks
활성 역할마다 다음 블록을 하나씩 만들고, 조건부 역할이 제외되면 해당 블록도 제외한다.

#### {active-role}
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
| 신규 기능 또는 상위 기획 | `role-planner -> role-developer -> role-reviewer` |
| articulate 작성/수정 | `role-planner` |
| UI/UX 상세화 | `role-designer -> role-developer -> role-reviewer` |
| 구현 specs 작성 | `role-developer -> role-reviewer` |
| 코드 구현 | `role-developer -> role-reviewer` |
| 버그 수정 | `role-developer -> role-reviewer` |
| 리팩토링 | `role-developer -> role-reviewer` |
| 복합 요청 | `role-planner -> role-developer -> role-reviewer` |

기본 체인은 `role-planner -> role-developer -> role-reviewer`다. 아래 조건이면 해당 역할을 필요한 단계 앞에 삽입한다:

- 코드/문서 근거 또는 외부 참고 확인이 필요함: planner 앞에 `role-researcher`
- UI 흐름, 화면, 상태, 접근성 변경 필요: developer 앞에 `role-designer`
- API, 상태, 호환성 또는 구조 결정이 필요함: developer 앞에 `role-architect`
- 구현 계획, 코드 변경, 검증 필요: `role-developer`
- 구현 결과 또는 구현 전 스펙의 품질 확인이 필요함: `role-reviewer`

## Execution Rules

1. `.agent-workflow/specs/features/{feature-name}/` 아래 `articulate.md`, `designs.md`, `specs.md`를 우선 확인한다.
2. 관련 feature 폴더가 없으면 `agent-workflow-orchestration feature --name {feature-name}` 생성을 권장한다.
3. 문서가 누락된 단계부터 역할을 시작한다. 예: `articulate.md`가 없으면 planner부터 시작한다.
4. 각 역할 실행 결과는 다음 역할의 입력으로 핵심 결정, 리스크, 미결정 질문만 압축 전달한다.
5. 최종 응답에는 실제로 확인된 문서 상태와 추론을 구분한다.

## Handling Returned Needs

역할이 중단하고 반환하면 같은 역할을 그대로 다시 부르지 않는다. 반환된 `필요한 것`을
읽고 그것을 충족할 수 있는 역할을 배정한다. 역할은 다음 역할을 지명하지 않으며,
배정은 이 오케스트레이터의 책임이다.

- 하나의 `필요한 것`을 여러 역할이 나누어 충족할 수 있다. 필요하면 둘 이상을 활성화한다.
- 서로 의존하지 않고 `mutation_policy: none`인 역할은 동시에 배정할 수 있다.
- 충족할 역할이 없으면 임의로 대체하지 말고 누락되는 검토를 사용자에게 알린다.
- 배정이 끝나면 막혔던 역할을 재개한다. 같은 역할이 세 번째로 호출되면 진전 없음으로 본다.

반환에 쓰는 `필요한 것` 어휘는 다음과 같다. 요청 유형을 역할 순서로 바꾸는 표가 아니라
능력 어휘이며, 어떤 역할이 어떤 능력을 갖는지는 역할 선언에서 읽는다.

| 필요한 것 | 의미 |
|-----------|------|
| `product-intent` | 제품 의도, 목표, 범위 확정 |
| `ui-decision` | 화면, 흐름, 상태 결정 |
| `code-evidence` | 코드베이스에서 사실 확인 |
| `external-evidence` | 외부 자료, 시장, 레퍼런스 확인 |
| `contract-decision` | API, 상태, 호환성 구조 결정 |
| `implementation` | 코드 또는 설정 변경 |
| `verification` | 검증 수단 마련과 실행 |
| `acceptance-criteria` | 수용 기준 확정 |

## Handoff Contract

역할별 산출물과 별개로, 모든 역할은 아래 봉투를 마지막에 하나 붙여 오케스트레이터에
반환한다. 형식은 7개 역할이 동일하다.

```yaml
from: role-orchestrator
work_id: <work-id 또는 none>
status: complete | blocked
produced: [이 실행에서 실제로 만든 산출물 키]
facts_confirmed:
  - claim: 확인된 사실
    source: path/to/file.ts:42
assumptions:
  - claim: 검증되지 않은 전제
    risk: high | medium | low
blocking_questions: []
needs: []
out_of_scope: [이번 실행에서 건드리지 않은 영역]
```

규칙:

- `source` 없는 주장은 `facts_confirmed`에 넣지 않는다. `assumptions`로 보낸다.
- `source`로 쓸 수 있는 형태는 셋뿐이다. 서술("코드에서 확인함")은 출처가 아니다.
  - 파일 경로: `src/greet.js:42` (줄 번호는 선택)
  - URL: `https://...`
  - 검색 범위: `glob:**/package.json` — **없음을 확인한 사실**의 출처다.
    "package.json이 없다"는 사실이며, 그 근거는 어디를 찾았는지다.
- `out_of_scope`는 비울 수 있으나 생략할 수 없다. 자율 실행의 최대 실패 모드는
  멈춤이 아니라 범위가 조금씩 넓어지는 것이다.
- `blocking_questions`가 비어 있지 않으면 `status: blocked`이며 사용자 확인이 필요하다.
- `needs`가 비어 있지 않으면 `status: blocked`이며 오케스트레이터가 배정한다.
  어휘는 `## Stop Conditions`에서 쓰는 것과 같다.
- 다음 역할을 지명하지 않는다. 배정은 오케스트레이터의 책임이다.

## Done Criteria

아래가 전부 참이면 종료한다.

- `task_classification`, `active_roles`, `role_handoff_blocks`, `final_summary` 네 블록을 모두 작성했다.
- 활성 역할마다 핸드오프 블록이 정확히 하나씩 있고, 제외된 역할의 블록은 없다.
- 각 활성 역할의 입력이 상류 역할의 산출물 또는 사용자 요청으로 충족된다.
- 아직 해결되지 않은 항목이 `final_summary`에 남아 있다.

## Stop Conditions

아래에 해당하면 즉시 중단하고 오케스트레이터로 반환한다.
**다음 역할을 지명하지 않는다.** 막힌 조건과 `필요한 것`만 기술하면 오케스트레이터가
능력 선언을 보고 배정한다. 하나의 `필요한 것`을 여러 역할이 나누어 충족할 수도 있고,
같은 `필요한 것`을 여러 역할이 병렬로 처리할 수도 있다.

- 요청에서 목표를 특정할 수 없어 어떤 역할도 배정할 수 없다. 사용자에게 질문한다.
- 반환된 `필요한 것`을 충족할 수 있는 역할이 하나도 없다. 누락되는 검토를 명시하고 사용자에게 알린다.
- 필요한 역할 파일을 열 수 없다. 대체하지 말고 `degraded` 상태와 누락되는 검토를 알린다.
- 같은 역할이 세 번째로 다시 호출된다. 진전 없음으로 보고한다.
- 두 번 연속으로 새로운 산출물이나 확인된 사실이 늘지 않았다. 진전 없음으로 보고한다.

## Fallback Rules

- `glob_search`가 없으면 직접 경로를 확인하고 파일 목록을 수동 탐색한다.
- 관련 ADS 문서가 없으면 `specs_context`를 비워두고 계속 진행한다.
- 역할 스킬을 열 수 없으면 그 사실을 노출하고 일반 추론 모드로 작업하되, 해당 역할 산출물은 "degraded"로 표시한다.
- 단순 질문, 파일 읽기, 사소한 단일 수정은 이 스킬을 건너뛴다.
