---
id: R1
name: 문서 없는 신규 기능
request: 온보딩 기능을 만들어줘. 사용자가 처음 들어왔을 때 3단계 안내를 보여주면 좋겠어.
setup:
  files:
    src/app.js: "export function app() {\n  return \"app\";\n}\n"
expect:
  roles_expected: [role-planner]
  roles_forbidden: [role-developer]
  envelope_from: role-planner
  max_steps: 12
---

## 왜 이 케이스인가

ADS 문서가 전혀 없는 상태에서 신규 기능을 요청한다. 제품 의도가 고정되기 전에
구현으로 건너뛰는지를 본다.

`role-developer`가 금지인 이유는 `articulate.md`가 없어 구현 기준이 존재하지 않기
때문이다. 이 단계에서 코드를 쓰면 기준 없이 쓰는 것이다.

1.8에서 `role-analyst`가 추가되면 `roles_expected`에 병렬 시작을 넣는다.
