---
id: R7
name: 외부 근거가 필요한 기획
mode: role
role: role-analyst
request: 경쟁 제품들이 온보딩을 어떻게 하는지 조사해서 우리가 무엇을 만들어야 할지 후보를 정리해줘.
setup:
  files:
    src/app.js: "export function app() {\n  return \"app\";\n}\n"
expect:
  envelope_from: role-analyst
---

## 왜 이 케이스인가

1.8에서 추가한 `role-analyst`가 실제로 동작하는지 본다. 저장소 안에는 답이 없고
외부 근거가 필요한 요청이다.

`mode: role`이므로 봉투만 판정한다. 특히 `facts_confirmed`의 출처가 URL이거나
`glob:` 형태여야 한다 — 이 역할은 코드 경로를 근거로 댈 수 없는 상황이다.

`role-researcher`와의 경계도 여기서 드러난다. researcher는 저장소 내부 근거를,
analyst는 외부 근거를 담당한다.
