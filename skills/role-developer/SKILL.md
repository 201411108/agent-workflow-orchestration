---
name: role-developer
description: >-
  articulate.md와 designs.md를 구현 가능한 specs.md로 정리하고, 이를 기반으로
  코드 변경과 검증 결과를 연결하는 implementation 역할 스킬.
inputs:
  required:
    - user_request
  optional:
    - articulate_handoff
    - designs_handoff
    - project_rules
    - specs_context
    - existing_specs_doc
outputs:
  required:
    - specs_doc
    - change_summary
    - verification
    - followups
required_tools:
  - file_read
  - file_edit
optional_tools:
  - text_search
  - lint_runner
  - test_runner
  - task_subagent
fallbacks:
  - lint/test 도구가 없으면 수행 불가를 명시하고 수동 검토 결과를 남긴다.
  - 프로젝트 규칙 파일이 없으면 인접 코드 패턴을 우선 규칙으로 사용한다.
---

# Role: Developer

목표는 `articulate.md`와 `designs.md`를 코드 작업 가능한 `specs.md`로 압축하고, 실제 구현과 검증 결과를 명확히 남기는 것이다.
`specs.md`는 AI에 그대로 넣었을 때 구현 계획과 코드 산출물이 나올 수 있을 만큼 구체적이어야 한다.

## Inputs

### Required

- `user_request`

### Optional

- `articulate_handoff`: 제품 의도, 대상, 목표, 제약
- `designs_handoff`: 사용자 흐름, UI 상태, 접근성, 디자인 결정
- `project_rules`: 프로젝트 규칙
- `specs_context`: 관련 ADS 문서 요약
- `existing_specs_doc`: 기존 `features/{feature-name}/specs.md`

## Outputs

```markdown
## 개발 결과

### specs_doc
- feature:
- implementation_goal:
- scope:
- interfaces_and_contracts:
- behavior:
- edge_cases:
- verification_plan:
- ai_implementation_notes:
- status: [Draft | Ready for implementation | Implemented | Deprecated]

### change_summary
- 변경 목표:
- 주요 수정:
- 영향 범위:

### verification
- lint:
- tests:
- manual_review:
- unresolved_risks:

### followups
- [추가 작업]
```

## Workflow

1. `articulate.md`와 `designs.md` 또는 각 handoff를 먼저 읽고 구현 체크리스트로 압축한다.
2. 기존 `specs.md`가 있으면 갱신 모드로 전환한다.
3. 관련 코드와 인접 패턴을 읽고 실제 프로젝트 구조에 맞는 인터페이스, 상태, 데이터, 테스트 기준을 정리한다.
4. 구현 전 또는 구현 중 사용자 논의로 요구사항이 바뀌면 `articulate.md`, `designs.md`, `specs.md` 중 영향을 받는 문서를 갱신 대상으로 표시한다.
5. 코드 변경 후 lint/test/typecheck 중 가능한 검증을 실행한다.
6. 구현 완료 후 target-specific specs의 `changes/`에 실제 변경 기록과 검증 결과를 남긴다.

## Tool Guidance

- `text_search` 사용 가능: 유사 구현, 재사용 가능한 유틸리티, 프로젝트 명령을 찾는다.
- `lint_runner` 또는 `test_runner` 없음: 패키지 스크립트나 문서화된 명령을 직접 탐색한다.
- `task_subagent`는 큰 변경에서만 사용하고, 즉시 필요한 탐색은 직접 수행한다.

## Fallback Rules

- platform-specific 규칙 파일이 없어도 실패로 간주하지 않는다.
- i18n, 로깅, 플랫폼 분리 같은 규칙은 코드베이스에 실제 흔적이 있을 때만 강제한다.
- `any` 금지, 에러 처리, null 안전성은 기본 원칙으로 유지하되, 프로젝트 스타일을 무시하지 않는다.

## Notes

- "검증 완료"는 실제로 실행한 항목만 쓴다.
- 새로운 패턴 도입보다 기존 코드와의 일관성을 우선한다.
