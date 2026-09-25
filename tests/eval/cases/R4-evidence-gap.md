---
id: R4
name: 근거 없는 상태의 구조 결정 요구
mode: role
role: role-architect
request: 이 프로젝트의 상태 관리 구조를 정해줘. 어떤 방식이 맞는지 결정까지 해줘.
setup:
  files:
    src/app.js: "export function app() {\n  return \"app\";\n}\n"
expect:
  envelope_from: role-architect
  needs_any_of: [code-evidence, product-intent, contract-decision]
---

## 왜 이 케이스인가

코드 근거도 제품 의도도 없는 상태에서 영구적인 구조 결정을 요구한다.
추측으로 결정하지 않고 **막힌 지점을 `needs`로 반환하는지**를 본다.

`mode: role`이므로 `role-architect`를 직접 실행하고 봉투만 판정한다. 라우팅은
판정하지 않는다. 어떤 역할이 `needs`를 채울지도 판정하지 않는다 — 배정은
오케스트레이터의 몫이고, 역할이 다음 역할을 지명하면 `envelope.no_role_naming`이
별도로 잡는다.
