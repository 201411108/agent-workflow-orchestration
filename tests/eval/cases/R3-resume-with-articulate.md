---
id: R3
name: articulate가 이미 있는 기능
request: 온보딩 기능 작업을 이어서 해줘.
setup:
  files:
    src/app.js: "export function app() {\n  return \"app\";\n}\n"
    .agent-workflow/specs/features/onboarding/articulate.md: "# Articulate: onboarding\n\n- purpose: 첫 방문자가 3단계 안내를 보고 핵심 기능을 이해한다\n- audience: 신규 가입 직후 사용자\n- goals: 3단계 이내 완료, 건너뛰기 가능\n- non_goals: 온보딩 중 결제 유도\n- success_criteria: 완료율을 로그로 측정한다\n- constraints: 기존 라우팅을 바꾸지 않는다\n- status: Draft\n"
expect:
  roles_expected: []
  roles_forbidden: [role-planner]
  max_steps: 12
---

## 왜 이 케이스인가

제품 의도가 이미 고정되어 있다. `role-planner`를 다시 부르면 이미 끝난 결정을
재논의하는 것이며 핸드오프 손실이다.

`Activation`의 "건너뛰어도 되는 조건: 기존 `articulate.md`가 현재 요청을 이미 담고
있고 변경이 필요 없다"가 실제로 지켜지는지 본다.
