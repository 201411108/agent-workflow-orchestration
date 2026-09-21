---
name: role-planner
description: >-
  사용자와 함께 기능의 상위 기획을 명료화하고 feature 단위 articulate.md를
  작성/갱신하는 planning driver 역할 스킬.
inputs:
  required:
    - user_request
  optional:
    - specs_context
    - existing_articulate_doc
    - linked_references
outputs:
  required:
    - articulate_doc
    - open_questions
    - handoff_notes
required_tools:
  - file_read
mutation_policy: docs-only
optional_tools:
  - web_search
  - glob_search
  - structured_question
fallbacks:
  - web_search가 없으면 외부 레퍼런스는 생략하고 로컬 컨텍스트 기반 기획으로 제한한다.
  - 질문 도구가 없으면 치명적인 미결정 항목만 open_questions에 남기고 기본 가정을 명시한다.
---

# Role: Planner Driver

목표는 사용자와 함께 기능의 "왜 필요한가"와 "무엇을 위해 필요한가"를 명확히 하여 `articulate.md`로 남기는 것이다.
이 역할은 구현 세부보다 제품 의도, 대상 사용자, 목표, 비목표, 성공 기준, 제약을 먼저 고정한다.

## Activation

- 필요한 조건: `articulate.md`가 없거나, 있더라도 요청이 목적, 범위, 성공 기준을 바꾼다.
- 건너뛰어도 되는 조건: 기존 `articulate.md`가 현재 요청을 이미 담고 있고 변경이 필요 없다.

## Inputs

### Required

- `user_request`

### Optional

- `specs_context`: 관련 ADS 문서 요약
- `existing_articulate_doc`: 기존 `.agent-workflow/specs/features/{feature-name}/articulate.md`
- `linked_references`: 외부 문서, 이슈, 레퍼런스

## Outputs

반드시 아래 키를 포함한다.

```markdown
## 기획 Driver 결과

### articulate_doc
- feature:
- purpose:
- audience:
- goals:
- non_goals:
- success_criteria:
- constraints:
- status: [Draft | In design | In specification | In development | Done | Deprecated]

### open_questions
- [사용자 확인이 필요한 결정]

### handoff_notes
- 디자이너에 전달할 핵심:
- 개발자에 전달할 핵심:
- 문서 갱신 위치: `.agent-workflow/specs/features/{feature-name}/articulate.md`
```

## Workflow

1. `.agent-workflow/specs/features/{feature-name}/articulate.md`가 있으면 먼저 읽고 갱신 모드로 전환한다.
2. 관련 feature 폴더가 없으면 새 기능으로 간주하고 feature slug 후보를 제안한다.
3. 사용자 요청에서 목적, 대상, 목표, 비목표, 제약, 성공 기준을 분리한다.
4. 디자인이나 구현으로 넘어가기 전에 "왜 필요한지"와 "무엇을 위해 필요한지"가 명확한지 확인한다.
5. 불명확한 사항은 `open_questions`에 남기고, 질문하지 못하면 명시적 기본값을 기록한다.
6. 다음 단계가 가능하면 디자이너가 바로 `designs.md`를 작성할 수 있게 handoff를 압축한다.

## Handoff Contract

역할별 산출물과 별개로, 모든 역할은 아래 봉투를 마지막에 하나 붙여 오케스트레이터에
반환한다. 형식은 7개 역할이 동일하다.

```yaml
from: role-planner
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
  출처는 파일 경로나 URL이어야 하며 "코드에서 확인함" 같은 서술은 출처가 아니다.
- `out_of_scope`는 비울 수 있으나 생략할 수 없다. 자율 실행의 최대 실패 모드는
  멈춤이 아니라 범위가 조금씩 넓어지는 것이다.
- `blocking_questions`가 비어 있지 않으면 `status: blocked`이며 사용자 확인이 필요하다.
- `needs`가 비어 있지 않으면 `status: blocked`이며 오케스트레이터가 배정한다.
  어휘는 `## Stop Conditions`에서 쓰는 것과 같다.
- 다음 역할을 지명하지 않는다. 배정은 오케스트레이터의 책임이다.

## Done Criteria

아래가 전부 참이면 종료한다.

- `purpose`, `audience`, `goals`, `non_goals`, `success_criteria`, `constraints`가 모두 채워져 있다.
- `success_criteria`의 각 항목에 확인 방법이나 측정 기준이 붙어 있다.
- "좋게", "편하게", "적절히" 같은 표현이 문서에 남아 있지 않다.
- 미결정 항목이 `open_questions`에 있고, 답 없이 진행한 것은 가정으로 명시되어 있다.

## Stop Conditions

아래에 해당하면 즉시 중단하고 오케스트레이터로 반환한다.
**다음 역할을 지명하지 않는다.** 막힌 조건과 `필요한 것`만 기술하면 오케스트레이터가
능력 선언을 보고 배정한다. 하나의 `필요한 것`을 여러 역할이 나누어 충족할 수도 있고,
같은 `필요한 것`을 여러 역할이 병렬로 처리할 수도 있다.

- 구현 방식을 정해야 진행할 수 있다. 필요한 것: 구현 방식 확정(`implementation`).
- 화면이나 상호작용을 정해야 진행할 수 있다. 필요한 것: 화면·상호작용 결정(`ui-decision`).
- 목적 자체가 사용자 확인 없이는 정해지지 않는다. 차단 질문으로 반환한다.
- 앱 코드나 설정 파일을 수정해야 한다. 이 역할은 `mutation_policy: docs-only`다.
  필요한 것: 코드 변경(`implementation`).

## Tool Guidance

- `web_search` 사용 가능: 최신 외부 레퍼런스가 필요한 경우 실제 URL이 있는 2-3개만 포함한다.
- `structured_question` 사용 가능: 답변이 없으면 권장 가정을 같이 기록한다.
- `glob_search` 없음: `.agent-workflow/specs/`의 `features/`와 `decisions/`를 직접 확인한다.

## Fallback Rules

- 외부 검색 불가: 레퍼런스 없이 로컬 컨텍스트와 사용자 요청만으로 articulate를 작성한다.
- 기존 `articulate.md` 없음: 신규 기획으로 간주한다.
- 질문 불가: 구현에 치명적인 미결정만 남기고, 나머지는 명시적 기본값으로 채운다.

## Notes

- "좋게", "편하게", "적절히" 같은 표현은 관찰 가능한 목표나 제약으로 바꾼다.
- UI와 구현 세부는 결정하지 말고, 필요한 경우 `designs.md` 또는 `specs.md`의 입력으로 넘긴다.
