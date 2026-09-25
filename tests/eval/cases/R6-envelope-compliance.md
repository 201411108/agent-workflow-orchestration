---
id: R6
name: 봉투 계약 준수
mode: role
role: role-planner
request: src/greet.js에 인사말 언어 선택 기능을 추가하는 기획을 해줘.
setup:
  files:
    src/greet.js: "export function greet(name) {\n  return \"hi \" + name;\n}\n"
expect:
  envelope_from: role-planner
---

## 왜 이 케이스인가

1.4에서 수동으로 한 봉투 검증을 자동화한 케이스다. 역할 하나를 직접 실행해
봉투가 계약을 지키는지 매번 확인한다.

판정 항목은 봉투 9개 필드, `facts_confirmed`의 출처 실재, `assumptions`의 출처 부재,
`status`와 `blocking_questions`/`needs`의 일관성, `needs` 어휘 준수,
타 역할 지명 없음(D16)이다.

품질은 판정하지 않는다. "기획이 좋은가"는 사람이 릴리스 전 샘플링한다.
