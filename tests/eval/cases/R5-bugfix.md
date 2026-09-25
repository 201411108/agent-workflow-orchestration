---
id: R5
name: 버그 수정
request: src/greet.js의 greet 함수가 name이 비어 있을 때 "hi "만 반환하는 버그를 고쳐줘.
setup:
  files:
    src/greet.js: "export function greet(name) {\n  return \"hi \" + name;\n}\n"
expect:
  roles_expected: []
  roles_forbidden: [role-planner, role-designer]
  max_steps: 6
---

## 왜 이 케이스인가

원인과 기대 동작이 요청에 이미 있다. 제품 의도를 다시 정할 필요가 없으므로
기획과 디자인 역할이 붙으면 과잉 위임이다.

R2와 함께 과잉 위임을 잡는 축을 이룬다. R2는 명백한 단일 수정이고,
R5는 판단이 조금 필요하지만 여전히 기획 단계가 필요 없는 경우다.
