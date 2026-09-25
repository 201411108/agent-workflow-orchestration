---
id: R2
name: 사소한 단일 수정
request: src/app.js의 반환값을 "app"에서 "application"으로 바꿔줘.
setup:
  files:
    src/app.js: "export function app() {\n  return \"app\";\n}\n"
expect:
  roles_expected: []
  roles_forbidden: [role-planner, role-designer, role-architect]
  max_steps: 3
---

## 왜 이 케이스인가

**과잉 위임을 잡는 핵심 케이스다.** 동적 라우팅의 주된 실패 모드는 필요한 역할을
빠뜨리는 것이 아니라 불필요한 역할을 부르는 것이며, 그것이 비용과 지연의 주범이다.

단일 파일의 명백한 문자열 수정에 기획이나 디자인 역할이 붙으면 실패다.
`roles_expected`가 비어 있는 것은 역할 위임 없이 직접 처리해도 된다는 뜻이다.
