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

## Inputs

### Required

- `user_request`

### Optional

- `specs_context`: 관련 ADS 문서 요약
- `existing_articulate_doc`: 기존 `features/{feature-name}/articulate.md`
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
- 문서 갱신 위치: `features/{feature-name}/articulate.md`
```

## Workflow

1. target-specific specs의 `features/{feature-name}/articulate.md`가 있으면 먼저 읽고 갱신 모드로 전환한다.
2. 관련 feature 폴더가 없으면 새 기능으로 간주하고 feature slug 후보를 제안한다.
3. 사용자 요청에서 목적, 대상, 목표, 비목표, 제약, 성공 기준을 분리한다.
4. 디자인이나 구현으로 넘어가기 전에 "왜 필요한지"와 "무엇을 위해 필요한지"가 명확한지 확인한다.
5. 불명확한 사항은 `open_questions`에 남기고, 질문하지 못하면 명시적 기본값을 기록한다.
6. 다음 단계가 가능하면 디자이너가 바로 `designs.md`를 작성할 수 있게 handoff를 압축한다.

## Tool Guidance

- `web_search` 사용 가능: 최신 외부 레퍼런스가 필요한 경우 실제 URL이 있는 2-3개만 포함한다.
- `structured_question` 사용 가능: 답변이 없으면 권장 가정을 같이 기록한다.
- `glob_search` 없음: target-specific specs의 `features/`와 `decisions/`를 직접 확인한다.

## Fallback Rules

- 외부 검색 불가: 레퍼런스 없이 로컬 컨텍스트와 사용자 요청만으로 articulate를 작성한다.
- 기존 `articulate.md` 없음: 신규 기획으로 간주한다.
- 질문 불가: 구현에 치명적인 미결정만 남기고, 나머지는 명시적 기본값으로 채운다.

## Notes

- "좋게", "편하게", "적절히" 같은 표현은 관찰 가능한 목표나 제약으로 바꾼다.
- UI와 구현 세부는 결정하지 말고, 필요한 경우 `designs.md` 또는 `specs.md`의 입력으로 넘긴다.
