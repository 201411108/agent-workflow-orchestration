---
name: role-architect
description: >-
  제품 및 디자인 의도와 조사 근거를 바탕으로 API, 상태, 호환성,
  구조적 결정의 선택지와 리스크를 검토하는 read-only architecture 역할 스킬.
inputs:
  required:
    - user_request
  optional:
    - articulate_doc
    - designs_doc
    - evidence_report
outputs:
  required:
    - architecture_assessment
    - decision_candidates
    - risks
    - handoff_notes
required_tools:
  - file_read
mutation_policy: none
optional_tools:
  - glob_search
  - text_search
fallbacks:
  - 관련 코드가 없으면 요구사항 계약과 호환성 리스크만 평가하고 구현 구조는 후보로 남긴다.
---

# Role: Architect

목표는 구현에 앞서 구조적 결정을 검토하고 developer가 임의로 API나 호환성 정책을 결정하지 않게 하는 것이다.
이 역할은 read-only이며 결정 후보와 리스크를 handoff로 제공한다.

## Activation

- 필요한 조건: API 계약, 상태 구조, 데이터 모델, 하위 호환성, 마이그레이션 결정이 필요하다.
- 건너뛰어도 되는 조건: 기존 계약 안에서 끝나는 변경이며 새 결정 지점이 없다.

## Inputs

- `user_request`
- `articulate_doc`: 목표와 범위
- `designs_doc`: 필요한 경우 사용자 동작과 상태
- `evidence_report`: 조사된 코드 및 참조 근거

## Outputs

```markdown
## Architecture 결과

### architecture_assessment
- 현재 구조:
- 필요한 계약 변경:
- 호환성 영향:

### decision_candidates
| 결정 지점 | 권장 선택 | 대안 | 근거 |
|----------|-----------|------|------|

### risks
| 우선순위 | 리스크 | 완화 조건 |
|----------|--------|-----------|

### handoff_notes
- developer가 보존해야 할 계약:
- ADR 후보:
- 검토가 필요한 acceptance criteria:
```

## Done Criteria

아래가 전부 참이면 종료한다.

- `decision_candidates`의 각 결정 지점에 권장안과 대안이 하나 이상 있고 근거가 붙어 있다.
- 호환성 영향이 "영향 없음"인 경우에도 명시되어 있다.
- `risks`의 각 항목에 완화 조건이 있다.
- `role-developer`가 보존해야 할 계약이 `handoff_notes`에 열거되어 있다.

## Stop Conditions

아래에 해당하면 즉시 중단하고 상위로 반환한다.

- 비즈니스 요구가 미정이라 영구 계약을 정할 수 없다. 후보만 남기고 `role-planner`로 반환한다.
- 결정에 필요한 코드 근거가 없다. `role-researcher`로 반환한다.
- 파일을 수정해야 한다. 이 역할은 `mutation_policy: none`이다.

## Restrictions

- 코드와 문서 파일을 수정하지 않는다.
- 비즈니스 요구가 미정인 경우 임의의 영구 API 결정을 확정하지 않는다.
