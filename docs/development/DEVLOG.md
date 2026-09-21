# 개발 이력

세션 간 맥락을 잇기 위한 기록이다. git 이력이 알려주지 못하는 것만 쓴다.
왜 그 선택을 했는지, 무엇을 시도하다 버렸는지, 왜 멈췄는지, 무엇을 기다리는지.

## 형식

최신 항목을 **맨 위**에 추가한다. 네 필드를 고정으로 쓰고 그 이상 쓰지 않는다.
길게 쓰면 유지되지 않는다.

```markdown
## YYYY-MM-DD — 한 줄 제목

- **작업**: 실제로 한 것
- **결정**: 이 세션에서 확정한 것 (D번호가 생겼으면 명시)
- **미해결**: 사용자 확인 대기 중인 가정, 막힌 지점, 버린 접근
- **다음**: 다음 세션이 이어서 할 것
```

**"미해결"이 가장 중요한 필드다.** 여기 적히지 않은 가정은 다음 세션이 기정사실로
취급한다. 사용자 확인을 기다리는 항목은 반드시 남긴다.

---

## 2026-09-21 (14) — 1.6 동작 검증 하네스

- **설계**
  - **판정기와 실행기를 분리했다.** `judge.js`는 모델을 호출하지 않는 순수 모듈이라
    `npm run check`에서 매번 자체 검증된다. `run.js`만 모델을 쓰고 수동 실행한다.
    이 분리 덕에 "판정기가 실제로 위반을 잡는가"를 무료로 확인할 수 있다
  - 케이스 모드를 둘로 나눴다. `routing`은 역할 선택과 스텝만, `role`은 봉투만 판정한다

- **하네스 자체의 결함을 4개 만들고 고쳤다 (전부 실제 실행으로 발견)**
  1. **거짓 양성**: `system/init` 이벤트의 에이전트 **목록**을 호출로 오인해
     모든 케이스가 과잉 위임으로 판정됐다. R2 첫 실행에서 7개 역할이 전부 잡혔다.
     실제로는 위임이 없었고 도구는 Read/Edit 둘뿐이었다
  2. **도구 귀속 오류**: 부모 스트림에는 서브에이전트 내부 도구가 나타나지 않는다.
     거기서 관찰되는 Bash/Skill/Agent는 메인 세션의 것인데 역할 계약 위반으로
     판정했다. 라우팅 모드에서는 도구를 판정하지 않도록 바꿨다
  3. **D6 의미 위반**: `maxSteps`를 도구 호출 수로 셌다. D6의 정의는 "전체 역할
     호출 수 상한"이다. R1이 14/12로 거짓 실패했고, 고친 뒤 3/12로 통과했다
  4. **파서 한계**: 역할이 `"glob:src/**"`처럼 따옴표로 감싸 쓰는데 못 읽었다

  거짓 실패를 내는 판정기는 없느니만 못하다. 네 건 모두 회귀 테스트로 고정했다

- **하네스가 찾아낸 진짜 계약 공백 (수정함)**
  - `role-planner`가 "package.json이 없다"를 사실로 보고하려는데 봉투에 자리가 없어
    `source`에 서술을 밀어 넣었다. **계약 공백이지 모델 오류가 아니다**
  - `source`의 허용 형태를 셋으로 명시했다: 파일 경로, URL,
    그리고 `glob:<패턴>` — **없음을 확인한 사실**의 출처.
    재실행에서 역할이 새 형태를 올바로 사용하는 것을 확인했다
  - 7개 계약, 템플릿, D5, 판정기를 함께 갱신했다

- **첫 유효 베이스라인**: 40/41 검사, 5/6 케이스 (`2026-09-21T07-20-21`)
  - 그 이전 기록 4개는 하네스 결함기의 것이라 비교 기준으로 쓸 수 없다.
    `eval-history/README.md`에 어느 기록이 유효한지 표로 남겼다

- **열려 있는 발견 (덮지 않는다)**
  - R6: `role-planner`가 **쓰려다 실패한 파일**을 `facts_confirmed`의 출처로 인용했다.
    존재하지 않는 파일은 근거가 아니다
  - 1회 실행으로는 계약 결함인지 모델 변동인지 구분할 수 없다. `--runs 5`가 필요하다
  - **임계값을 낮춰 통과시키지 않는다.** 사후 조정은 검증이 아니라 사후 합리화다 (D12)

- **정리**: 참조되지 않는 중복 파일 `scripts/eval-judge-test.js`를 제거했다

- **다음**: ROADMAP 1.7 능력 선언과 의존성 디스패치. Phase 1 최대 변경이며
  **1.6 하네스로 전후 비교가 필수다.** 지금 베이스라인이 그 기준이 된다

---

## 2026-09-21 (13) — 1.5 역할별 스킬·도구 바인딩

- **작업**
  - manifest 최상위 키를 `skills` → `roles`로 변경. `loadManifest`가 구 키도 읽는다
  - 역할마다 `skills: []`(D14)와 `toolPolicy: deny-by-default` 추가
  - `adapters/*.json`에 추상 도구 → 네이티브 도구 매핑 추가
  - 렌더러가 매핑을 해석해 claude `tools:` frontmatter와 codex `web_search` 키를 생성
  - 렌더러가 `## Tools` 표를 본문에 주입. 도구 가용성을 사실로 알려준다
  - 7개 계약에서 "사용 가능:/사용 불가" 조건문 제거
  - `docs-only`인데 `file_edit`를 선언하지 않던 planner/designer를 고쳤다

- **작업 중 발견한 결함 (수정함)**
  - ⚠️ **`role-reviewer`가 `mutationPolicy: none`인데 읽기 전용이 아니었다.**
    `test_runner`를 선언해 `Bash`를 받고 있었고, Bash 한 줄이면 무엇이든 쓸 수 있다.
    `none`의 보장이 무의미했다
  - 해결: reviewer는 검증을 직접 실행하지 않는다. 제공된 `verification`을 읽고
    공백을 finding으로 보고하며 필요하면 `needs: verification`으로 반환한다.
    게이트 제작은 `role-qa`의 책임이다 (D7)
  - 어댑터에 `writeCapableTools`를 선언하고 `validate`가 기계 검사한다

- **자초한 버그 하나**
  - `manifest.skills` → `manifest.roles` 전역 치환이 **방금 작성한 하위 호환 폴백을
    같이 덮어썼다.** `manifest.roles : manifest.roles`가 되어 구 키 지원이 죽었다.
    구 키로 실제 설치를 돌려보다가 발견했다. 문자열 치환 후에는 방금 쓴 코드도
    다시 읽어야 한다

- **결정**
  - D17 확정 — 도구 허용 목록을 역할 선언에서 도출한다. 고정 목록은 같은 정책의
    역할에 가장 넓은 권한을 준다. `role-architect`와 `role-researcher`는 둘 다
    `none`이지만 후자만 웹 검색이 필요하다
  - `skills` 매핑은 추가하지 않았다. 모든 역할의 `skills`가 빈 배열이므로 D14의
    "선험적 설계 금지"에 따라 실제 선언이 생길 때 만든다

- **타깃별 한계 (정직하게 기록)**
  - claude: `tools` 허용 목록으로 deny-by-default 강제됨
  - codex: **역할별 허용 목록이 없다.** `sandbox_mode`와 `web_search`만 제어 가능.
    deny-by-default는 계약 문구로만 존재하며 위반은 1.6 하네스가 사후 탐지한다
  - cursor: 1.1 조사 범위 밖이라 매핑을 추측으로 채우지 않았다

- **검증**
  - `validate` 검사 6종이 실패를 잡는 것을 각각 확인 (D12): 매핑 누락 / 매핑·주석
    모두 없음 / `none` 역할의 `file_edit` / `toolPolicy` 누락 / 조건문 재유입 /
    `none` 역할의 쓰기 가능 도구
  - 스모크에 도구 바인딩 고정. 매핑을 지우면 실패하는 것을 확인
  - 구 `skills` 키 manifest로 설치해 동일 결과가 나오는 것을 실측

- **미해결**
  - Codex custom agent 노출 최종 확인 (사용량 한도 해제 후)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.6 동작 검증 하네스. 1.4의 봉투 판정 스크립트가 프로토타입이고,
  1.5에서 생긴 "선언되지 않은 도구 사용" 탐지도 여기서 구현한다

---

## 2026-09-21 (12) — 1.4 핸드오프 봉투 스키마 고정

- **설계**
  - 핸드오프를 **봉투(envelope)**로 설계했다. 역할별 산출물(payload)과 분리해서
    7개 역할이 같은 형식을 쓴다. `handoff_notes`가 4개 역할에만 있어서
    그 키를 확장하는 방식으로는 전체를 덮을 수 없었다
  - **`to` 필드를 두지 않기로 했다.** D5 초안에는 `to: role-developer`가 있었는데
    이는 D16 위반이다. 봉투는 언제나 오케스트레이터로 반환되므로 `to`는 불필요하다
  - `status: complete | blocked` 추가. `blocking_questions` 또는 `needs`가
    비어 있지 않으면 `blocked`

- **작업**
  - 7개 SKILL.md에 `## Handoff Contract` 추가
  - `templates/handoff-template.md`를 봉투 구조로 교체 (work-item 치환자 유지)
  - `validate`가 봉투 9개 필드와 `from`이 자기 역할인지 검사
  - D5를 확정 스키마로 갱신

- **검증 — 실제 역할을 돌려서 확인했다**
  - 임시 프로젝트에 설치하고 `role-planner` 서브에이전트를 실제 실행해 봉투를 받았다
  - 기계 판정 결과: 필수 9개 필드 전부 존재 / `facts_confirmed` 6개 모두 출처 보유 /
    `assumptions` 8개 모두 출처 없음(정상) / risk 8/8 표기 /
    `status: blocked`와 `blocking_questions` 존재가 일관 / `out_of_scope` 5개 /
    타 역할 지명 없음(D16 준수)
  - **이 판정 스크립트가 1.6 하네스의 프로토타입이다.** 계약 준수를 기계로 판정할 수
    있다는 D12의 전제가 실물로 확인됐다
  - 검사 3종이 실패를 잡는 것을 먼저 확인했다 (D12): 봉투 필드 제거,
    `from`을 다른 역할로 변경, 템플릿에서 `needs` 제거

- **미해결**
  - Codex custom agent 노출 최종 확인 (사용량 한도 해제 후)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.5 역할별 스킬·도구 바인딩

---

## 2026-09-20 (11) — Stop Conditions에서 역할 지명 제거 (D16)

- **사용자 지적으로 1.3의 설계 오류를 고쳤다**
  - 1.3의 Stop Conditions에 `role-planner로 반환한다` 같은 대상을 적었는데,
    이것은 **역할별 고정 라우팅 표를 계약에 다시 들여온 것**이다.
    D2(라우팅은 선언에서 계산)에 정면으로 어긋나고, 1.7의 완료 기준
    "저장소 어디에도 고정 역할 순서 표가 남아있지 않다"를 위배한다
  - 6개 파일에 하드코딩된 라우팅 8개가 있었다

- **작업**
  - Stop Conditions를 "누구에게"에서 "무엇이 필요한가"로 전면 재작성
  - 능력 어휘 8개 고정: `product-intent`, `ui-decision`, `code-evidence`,
    `external-evidence`, `contract-decision`, `implementation`, `verification`,
    `acceptance-criteria`
  - `role-orchestrator`에 `## Handling Returned Needs` 추가. 반환된 `필요한 것`을
    읽고 배정하는 규칙과 능력 어휘 표를 담았다
  - `validate`가 Stop Conditions 안의 타 역할 언급을 실패로 처리한다

- **결정**
  - D16 확정 — 역할은 다음 역할을 지명하지 않는다. 근거 셋:
    (1) 역할을 추가하면 낡는다. 1.8에서 analyst/qa가 들어오면 계약 7개를 손으로 고쳐야 한다
    (2) 하나의 필요가 한 역할에 대응한다고 가정한다. 근거 수집은 researcher와 analyst가
        나눠 맡거나 D3에 따라 병렬로 돌 수 있는데 지명이 그 가능성을 미리 닫는다
    (3) 판단 위치가 틀렸다. 막힌 역할은 자기에게 무엇이 없는지만 알고,
        누가 채울 수 있는지는 전체 상태를 보는 오케스트레이터가 안다

- **검증**
  - `validate` 통과, `npm run check` 전부 통과
  - **재발 방지 검사가 실제로 잡는지 확인했다 (D12).** reviewer에 `role-planner`를
    되돌려 넣자 `Stop Conditions names another role (role-planner)`로 실패

- **1.4와 1.7에 반영**
  - 1.4: 핸드오프에 `needs` 필드 추가. 능력 어휘를 구조로 옮겨 오케스트레이터가
    자연어 파싱 없이 배정하게 한다
  - 1.7: `capabilities` 선언이 D16의 능력 어휘와 같은 값을 쓰도록 하고,
    계약의 `필요한 것`과 어긋나지 않는지 `validate`가 검사한다

- **미해결**
  - Codex custom agent 노출 최종 확인 (사용량 한도, 2026-09-21 13:39 이후)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.4 핸드오프 스키마 고정

---

## 2026-09-20 (10) — 1.3 Activation / Done / Stop 추가

- **작업**
  - 7개 역할 계약에 `## Activation`, `## Done Criteria`, `## Stop Conditions` 추가
  - `validate`의 필수 토큰에 세 섹션을 넣어 강제
  - Done Criteria를 전수 검토해 주관적이던 2건을 확인 가능한 문장으로 교체
    (reviewer의 "그대로 실행할 수 있는 형태" → "파일 경로와 필요한 수정 내용이 적혀 있다",
    researcher의 "다시 탐색하지 않고 판단할 수 있는" → "읽어야 할 파일 경로가 열거되어 있다")

- **설계 메모**
  - Stop Conditions에 D6의 경계 조건을 역할 수준으로 내렸다. orchestrator에는
    같은 역할 3회 재호출과 2회 연속 무진전, developer에는 같은 실패 3회를 명시했다.
    Phase 3.2 드라이버가 이 값을 기계적으로 강제하기 전까지는 계약이 유일한 방어선이다
  - Stop Conditions 대부분이 "다른 역할로 반환"으로 끝난다. D4에 따라 역할이 직접
    다른 역할을 부르지 않으므로, 반환 대상을 명시해 오케스트레이터가 재배정하게 했다
  - 각 역할의 `mutation_policy` 위반을 Stop Conditions에 명시했다. 1.2에서 네이티브
    권한(`tools`, `sandbox_mode`)으로 강제되지만 `docs-only`와 `implementation`의
    경로 구분은 네이티브 수단이 없으므로(D15 한계) 계약으로 보완한다

- **검증**
  - `validate` 통과, `npm run check` 전부 통과
  - **검사가 실제로 실패를 잡는지 먼저 확인했다 (D12).** planner에서
    `## Stop Conditions`를 바꾸자 `missing token: ## Stop Conditions`로 실패
  - 세 섹션이 claude 서브에이전트, codex TOML, cursor 스킬, 오케스트레이터 스킬
    배포물 전부에 반영되는 것을 실측 확인 (각 3/3)

- **미해결**
  - Codex custom agent 노출 최종 확인 (사용량 한도, 2026-09-21 13:39 이후)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.4 핸드오프 스키마 고정. D5의 frontmatter + 본문 하이브리드를
  구현하며, 여기서 1.6 검증 하네스의 판정 기준이 생긴다

---

## 2026-09-20 (9) — 1.2b 레거시 경로 마이그레이션

- **작업**
  - `getLegacyRolePlan(adapter, targetState)` 추가. 어댑터의 `legacyRolePaths`가
    입력이며 `{role}` 패턴 확장과 리터럴 경로를 모두 처리한다
  - `removeLegacyRoleFiles()`를 `update`와 `uninstall` 양쪽에 연결했다
  - 증명 불가 파일은 **중단이 아니라 `[kept]`로 보고**한다. 구 파일은 이미
    로드되지 않으므로 갱신 전체를 막을 이유가 없다
  - 스모크 테스트에 구 claude 레이아웃 합성 + cursor 키 형식 변경 시나리오 추가

- **1.2에서 놓친 회귀를 발견하고 고쳤다**
  - ⚠️ 1.2가 state 키 형식을 `<role>/<fileName>`에서 프로젝트 상대 경로로 바꿨다.
    그 결과 **기존 cursor 설치본이 `update`를 전혀 하지 못했다** —
    소유권 해시를 찾지 못해 7개 파일 전부 `ownership hash is missing` conflict로
    중단됐다. 고아 파일보다 심각한 문제였다
  - `findRecordedHash`가 구 키를 폴백으로 본다
  - **단, 파일이 새 경로에 실제로 존재할 때만 폴백한다.** 처음엔 무조건 폴백하게
    했더니 claude가 `file is missing`으로 막혔다. 새 경로에 파일이 없는 것은
    경로 이동이지 소유권 위반이 아니다

- **검증 (전부 실측)**
  - cursor: update 정상, 파일 7개, 고아 없음
  - claude: 새 파일 7개 생성 + 구 파일 7개 제거, 고아 없음
  - codex: 새 파일 7개 + 구 파일 4개 제거
  - 수정된 구 파일 1개 + 사이드카: 구 파일 보존·보고, 사이드카 보존, 사용자 편집 무사
  - update 없이 바로 uninstall: 구 파일 7개 정리, 잔여 없음
  - **D12 원칙대로 두 검사를 각각 깨뜨려 실패를 확인했다.**
    레거시 제거 무력화 → `unexpected path exists`,
    구 키 폴백 무력화 → `command failed: update --target cursor`

- **미해결**
  - Codex custom agent 노출 최종 확인 (사용량 한도, 2026-09-21 13:39 이후)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.3 역할 계약에 Activation / Done / Stop 추가

---

## 2026-09-20 (8) — doctor에 Codex trust 검사 추가

- **작업**
  - trust 의미론을 대조군으로 확정한 뒤 `doctor`에 검사를 추가했다
  - `readCodexTrustedPaths()` — `$CODEX_HOME/config.toml`(기본 `~/.codex/config.toml`)의
    `[projects."<path>"] trust_level = "trusted"`를 훑는다. 전체 TOML 파서를 넣지 않고
    섹션 헤더와 해당 키만 본다. 읽을 수 없으면 `null`을 반환해 "신뢰 없음"과 구분한다
  - `findCodexTrustAnchor()` — 조상 경로까지 거슬러 확인하고 가장 구체적인 경로를 보고한다
  - README, README.ko에 trust 요구사항과 진단 방법을 문서화했다

- **실측으로 확정한 것**
  - **`.codex/` 레이어 전체가 trust 뒤에 있다.** 같은 `.codex/config.toml`을 두고
    untrusted 디렉터리에서는 반영 안 됨(`high`), trusted 저장소 루트에서는 반영됨(`low`).
    (7)의 `AGENTS: NONE`이 우리 결함이 아님이 확증됐다
  - **trust는 하위 디렉터리로 상속된다.** trusted 경로 아래 임시 디렉터리에서도 반영됨.
    따라서 정확한 경로 일치가 아니라 조상 탐색이 맞다
  - `-c` 오버라이드로는 trust를 부여할 수 없다 (대조군으로 `-c` 자체는 동작 확인)

- **검증**
  - 실제 동작 확인: untrusted 디렉터리 → `[warn] ... not trusted`,
    저장소 루트 → `[ok] trusted via /Users/hankim/Desktop/workspace/agent-workflow-orchestration`
  - 스모크 테스트에 3개 시나리오 고정: 신뢰 없음 / 상위 경로 상속 / 신뢰 정보 읽기 불가
  - **D12 원칙대로 검사를 먼저 깨뜨려 실패를 확인했다.** trust 판정을 항상 trusted로
    바꾸자 스모크가 `expected output to include "[warn] codex project trust"`로 실패했다

- **미해결**
  - Codex custom agent 노출 최종 확인 — trust 부여 + 사용량 한도 해제 후 가능
    (2026-09-21 13:39 이후). 이제 `doctor`가 trust 상태를 알려주므로 진단은 가능하다
  - 1.2b 레거시 마이그레이션 (이월)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.2b 레거시 경로 마이그레이션

---

## 2026-09-20 (7) — 하네스 실제 로드 검증

- **작업**
  - 검증 프로젝트에 claude/codex 두 타깃을 설치하고 실제 CLI로 로드 확인
  - 결과와 근거를 HARNESS_CAPABILITIES 9절에 기록
  - `validate`에 검사 2건 추가: AGENTS 블록의 역할 이름 누락, TOML 여러 줄 구분자 불균형

- **결과**
  - **Claude 통과.** `role-architect/designer/developer/planner/researcher/reviewer`
    6개가 서브에이전트로, `role-orchestrator`가 스킬로 전부 노출된다.
    1.2 이전 레이아웃이었다면 하나도 나오지 않는다. 결함 수정이 실증됐다
  - **Codex 부분 통과.** `role-orchestrator` 스킬은 로드되지만 custom agent는 `NONE`
  - 원인은 프로젝트 trust. 근거 체인: 프로젝트 `.codex/config.toml`의
    `model_reasoning_effort`가 헤더에 반영되지 않음 → `-c` 대조군은 반영됨 →
    `~/.codex/config.toml`의 trusted 목록에 검증 디렉터리 없음 → 공식 문서가
    "untrusted projects skip the .codex/ layer entirely"라고 명시.
    **우리 파일의 결함이 아니다**
  - 생성된 TOML 6개 전부 `tomllib` 파싱 성공, 필수 키 보유, `sandbox_mode`가
    `mutationPolicy`와 일치

- **검증으로 발견한 버그 (수정함)**
  - `payloads/codex/AGENTS.block.md`가 구 이름(`$feature-orchestrator`,
    `planner`/`designer`/`developer`)을 참조해 설치된 `AGENTS.md`가 존재하지 않는
    이름을 안내했다. 1.2에서 놓쳤다. **정적 검사로는 못 잡고 실제 설치물을 봐서 잡았다**

- **미해결**
  - Codex custom agent 노출 확인 — trust 부여 후 재시도 필요.
    `-c`로는 trust를 줄 수 없고 Codex 사용량 한도(2026-09-21 13:39 해제)에 걸렸다.
    사용자가 검증 디렉터리에서 `codex`를 한 번 열어 trust를 승인하면 확인 가능
  - `doctor`가 Codex trust 상태를 확인하지 못한다. 설치는 됐는데 역할이 안 보이는
    상황의 원인을 짚어주지 못한다. 개선 후보
  - 1.2b 레거시 마이그레이션 (이월)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.2b 레거시 경로 마이그레이션

---

## 2026-09-20 (6) — 1.2 역할 시스템 통합

- **작업**
  - 어댑터 스키마 교체. `fileName` 단일 값 → `roleFilePattern`, `roleFormat`,
    `orchestratorAs`, `skillFilePattern`, `rolesDir`, `permissions`
  - `renderTargetRoleFile`을 3개 포맷으로 분기 (`passthrough` / `markdown-frontmatter` / `toml`)
  - `getManagedRoleFiles`가 payload 사본을 읽지 않고 manifest + SKILL.md에서 렌더링
  - **Claude 타깃 결함 수정.** 7개 역할이 이제 `.claude/agents/role-*.md`(서브에이전트 6개)와
    `.claude/skills/role-orchestrator/SKILL.md`(스킬 1개)로 배포된다
  - Codex도 동일 구조로 7개 전부 배포 (기존 3개 → 7개)
  - `validate` 재작성: 스키마 필수 키, 권한 매핑 3종, 포맷별 구조, 역할 수 = 배포 파일 수
  - `payloads/codex/`의 손으로 쓴 역할 파일 4개 제거. 이제 payload에는
    `AGENTS.block.md`와 `config.toml`만 남는다
  - 루트 `.codex/config.toml` 제거 (D10 잔여 항목 해소)
  - `list`/`doctor`의 하드코딩된 `feature-orchestrator`, planner/designer/developer 제거
  - README, README.ko 경로 표 갱신
  - 스모크 테스트를 새 구조로 갱신 (파일 수 4 → 7, 경로/이름 변경, TOML 키 검증 추가)

- **결정**
  - D15 — 오케스트레이터는 스킬, 나머지 6개는 서브에이전트. 판별은 D14 기준
    ("핸드오프를 주고받는가"). 오케스트레이터는 메인 세션의 라우팅 절차다
  - `mutationPolicy` 네이티브 매핑 확정. `docs-only`와 `implementation`을 경로로
    강제하는 네이티브 수단이 없어 근사하며, 경로 위반은 1.6 하네스가 탐지한다
  - `.codex/config.toml`은 계속 병합한다. `features.multi_agent`/`agents.enabled`가
    기본 true지만 소비자가 명시적으로 꺼둔 경우를 덮어써야 한다
  - Cursor는 1.1 조사 범위 밖이라 기존 동작 유지. 별도 조사 후 변경

- **회귀 방지**
  - `renderTargetRoleFile` 교체로 1.0.x 레거시 소유권 증명이 깨질 뻔했다.
    구 렌더링을 `renderLegacyCodexRoleFile`로 분리 보존했다.
    레거시 판정에만 쓰이며 새 배포에는 사용하지 않는다

- **미해결**
  - ⚠️ **1.2b 레거시 마이그레이션.** 구버전 설치본을 update하면 새 레이아웃은 정상
    생성되지만 구 파일 7개(`.claude/skills/role-*/CLAUDE.md`)가 고아로 남는다.
    state에서 빠져 uninstall로도 지워지지 않는다. 실측 확인함. 파괴적이지는 않다
  - `adapters/*.json`의 `legacyRolePaths`는 선언만 되어 있고 아직 코드가 읽지 않는다.
    1.2b의 입력이다
  - **하네스 실행 미검증.** 새 Codex/Claude 세션에서 역할이 실제로 로드되는지는
    확인하지 않았다. 문서 규약과 일치시켰을 뿐이다
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.2b 레거시 경로 마이그레이션

---

## 2026-09-20 (5) — 1.1 하네스 네이티브 조사 완료

- **작업**
  - `docs/development/HARNESS_CAPABILITIES.md` 작성. Claude Code 문서 2편,
    Codex 문서 3편을 확인해 8개 영역 대조. 모든 칸에 출처 표기, 미확인 4건 명시
  - D2~D6, D14에 네이티브/보완/충돌 판정 기록
  - ROADMAP 1.1 완료 처리, 1.2 범위 확대

- **결정 (판정 결과)**
  - **충돌 없음.** D2~D6, D14를 수정하지 않는다. 우리가 만들 범위만 줄었다
  - **D3 병렬 = 네이티브.** 동시성 상한은 Claude 환경변수(기본 20)와
    Codex `agents.max_concurrent_threads_per_session`. 스케줄러를 만들지 않는다
  - **D4 직접 대화 금지 = 네이티브.** Claude 서브에이전트는 대화 이력을 받지 못하고
    결과만 부모로 반환하므로 에이전트 간 직접 대화가 구조적으로 불가능하다.
    우리가 강제할 규칙이 아니라 하네스가 이미 강제하는 구조였다
  - **D14 스킬 바인딩 = 네이티브.** Claude 서브에이전트 frontmatter `skills:`,
    Codex `[[skills.config]]`의 `enabled`/`path`. 프롬프트 지시로 격하되지 않는다
  - **D2·D5 = 보완.** 네이티브 위임은 "누구에게"만 정하고 산출물 의존성 계산은 없다.
    구조화 컨텍스트 전달 경로도 없어 핸드오프는 task message에 싣는다
  - **D6 = 부분.** `maxSteps`는 Claude `maxTurns`에 위임. `maxReentry`,
    `noProgressLimit`, `out_of_scope` 위반 감지는 드라이버가 만든다
  - **D9 worktree 격리 = 네이티브** (`isolation: worktree`). Phase 3.3 범위 축소

- **확정된 결함**
  - ⚠️ **`adapters/claude.json`이 동작하지 않는다.** `.claude/skills/<role>/CLAUDE.md`를
    생성하는데 Claude Code 스킬 파일명은 `SKILL.md` 고정이다. 게다가 역할을 스킬 경로에
    두었다 — 역할은 서브에이전트(`.claude/agents/<name>.md`)다. 두 가지가 동시에 틀렸다.
    **현재 Claude 타깃은 설치되어도 로드되지 않는다.** 1.2에서 바로잡는다
  - Codex 타깃 경로(`.agents/skills/`, `.codex/agents/`)는 정확하다

- **미해결**
  - Codex 미확인 4건: 역할별 도구 허용 목록(sandbox_mode 외), 하위 에이전트 spawn
    대상 제한, 턴 수 상한 키, Claude 스킬 카탈로그 토큰 예산. 1.2에서 필요해지면 재조사
  - `.codex/config.toml` 처리 — 1.2 범위로 편입. `features.multi_agent`와
    `agents.enabled`가 기본 true이므로 실질 의미는 `max_concurrent_threads_per_session`뿐
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.2 역할 시스템 통합. 1.1 결과로 Claude 타깃 재구성과
  어댑터 스키마 변경이 추가됐다

---

## 2026-09-20 (4) — 역할·스킬·도구 용어 확정

- **작업**
  - D14 추가. 저장소에서 "스킬"이 세 뜻으로 쓰이던 것을 정리했다.
    manifest 최상위 `"skills"`는 역할 목록, `skills/role-*/`도 역할 계약,
    `feature-orchestrator`만 실제 스킬이었다
  - ROADMAP 1.5의 예시에서 `metric-query`를 스킬 목록에서 도구로 옮겼다.
    접근 수단은 스킬이 아니다
  - ROADMAP 1.1에 스킬 해결 경로·이름 충돌 우선순위 조사 항목 추가

- **결정**
  - D14 — 판별 기준은 "핸드오프를 주고받는가". 예면 역할, 아니면 스킬이나 도구.
    스킬과 도구는 "무엇에 접근하는가(도구) / 어떻게 하는가(스킬)"로 나눈다
  - 스킬 출처 3종(하네스 내장 / 패키지 배포 / 소비자 고유) 모두 선언 가능하되
    우리 책임은 패키지 배포분뿐
  - **스킬을 선험적으로 설계하지 않는다.** `skills` 키 초기값은 빈 배열.
    둘 이상의 역할이 같은 절차를 실제로 중복 서술할 때 추출한다.
    1.1에서 바인딩이 표현 불가능으로 판정되면 미리 만든 스킬은 전부 헛일이 된다
  - 1.5에서 manifest 최상위 키를 `skills` → `roles`로 변경한다.
    역할별 `skills`를 추가하면 한 파일에서 같은 키가 두 뜻이 되기 때문.
    breaking change이므로 `bin/cli.js`에 하위 호환 처리를 함께 넣는다

- **미해결**
  - `adapters/claude.json`의 `fileName: "CLAUDE.md"` 의심 지점 (1.1에서 확인, 이월)
  - `.codex/config.toml` 처리 (1.2로 이월)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **다음**: ROADMAP 1.1 하네스 네이티브 기능 조사

---

## 2026-09-20 (3) — main 머지, 하네스 네이티브 조사를 1.1로 전진 배치

- **작업**
  - 1.0까지의 작업을 커밋(c190e25) → `main`에 fast-forward 머지 →
    `feat/phase1-role-system` 브랜치 생성. 푸시는 하지 않았다
  - Phase 1에 두 작업 추가. 기존 1.1~1.8을 1.2~1.9로 번호 변경
    - 신규 **1.1 하네스 네이티브 기능 조사** — 모든 작업 앞에 배치
    - 기존 1.4 도구 매핑을 **1.5 역할별 스킬·도구 바인딩**으로 확장
      (`skills` 키, `toolPolicy: deny-by-default` 추가)
  - VERIFICATION에 **L0 문서 검증** 절 추가. 1.1은 코드가 아니라 사실을 산출하므로
    L1~L4에 해당하지 않는다. 기준은 "대조표의 모든 칸에 출처가 있는가"

- **결정**
  - D13 확정 — 네이티브 기능을 먼저 확인하고 직접 만들지 않는다.
    각 설계 결정을 네이티브/보완/충돌로 판정하고, 충돌이면 하네스를 이기려 하지 않고
    해당 D 항목을 수정한다
  - 1.1을 최우선에 둔 이유: D2~D6이 하네스가 이미 제공하는 것과 중복일 수 있고,
    추측 위에 1.2~1.9를 쌓으면 전부 다시 해야 한다

- **미해결**
  - ⚠️ **`adapters/claude.json` 의심 지점.** `skillsDir: ".claude/skills"` +
    `fileName: "CLAUDE.md"` 조합으로 `.claude/skills/role-planner/CLAUDE.md`를 생성한다.
    Claude Code의 스킬 탐색 규약과 일치하지 않으면 **Claude 타깃은 설치돼도 로드되지
    않는 상태**다. 1.1에서 공식 문서로 확인한다. 확인 전까지 단정하지 않는다
  - `.codex/config.toml` 처리 (1.2로 이월)
  - Phase 2 미니 프로젝트 대상 미정 (이월)

- **커밋 실수 기록**: 첫 커밋에서 `git add`에 삭제된 `.agents` 경로를 함께 넘겨
  pathspec 오류가 났고 `2>/dev/null`로 가려져 문서 5개가 누락된 채 커밋됐다.
  푸시 전이라 `--amend`로 복구했다. **삭제된 경로를 `git add` 인자에 넣지 않는다.
  `git add`의 stderr를 버리지 않는다.**

- **다음**: ROADMAP 1.1 하네스 네이티브 기능 조사. 산출물은
  `docs/development/HARNESS_CAPABILITIES.md`

---

## 2026-09-20 (2) — 레이어 경계 실행과 검증 체계 수립

- **작업**
  - ROADMAP 1.0 완료. **A안(제거)** 채택. 루트 `.codex/agents/{planner,designer,developer}.toml`과
    `.agents/skills/feature-orchestrator/SKILL.md` 삭제, 빈 디렉터리 정리
  - 삭제 전 참조 확인: `bin/cli.js`의 모든 참조는 `payloads/codex/` 또는 설치 대상
    경로를 가리켰고 루트 사본에 의존하는 코드는 없었다
  - `docs/development/VERIFICATION.md` 신규 작성 — 4단계 검증 사다리, 라우팅 케이스
    테이블, 임계값, 실패 시 행동
  - ROADMAP에 **1.5 동작 검증 하네스** 신설. 기존 1.5~1.7을 1.6~1.8로 번호 변경
  - `CLAUDE.md`, `AGENTS.md`, D10의 레이어 표와 위반 상태 절을 제거 결과에 맞춰 갱신

- **결정**
  - D12 확정 — 검증 4단계(L1 구조 / L2 렌더링 / L3 동작 / L4 통합).
    원칙 셋: 판정 가능한 것만 판정한다, 임계값을 착수 전에 고정한다,
    검사를 먼저 추가해 실패를 확인한 뒤 통과시킨다
  - L3 하네스를 1.6(의존성 디스패치) **앞**에 배치. 1.6이 Phase 1 최대 변경이므로
    검증 없이 진행하지 않는다. 1.3(핸드오프 스키마) 이후에만 만들 수 있어 1.5가 유일한 자리
  - 임계값: 구조·경계·출처 100%, 라우팅 정확도 80%(5회 중 4회).
    구조는 결정론적이어야 하므로 100%, 라우팅은 판단이 개입하므로 변동 허용

- **미해결**
  - `.codex/config.toml` 처리. A의 범위 밖이라 보존했다. 현재 custom agent 없이
    multi-agent만 켜둔 상태로 동작 영향은 없다. 1.1에서 함께 정한다
  - Phase 2 미니 프로젝트 대상 여전히 미정 (이전 항목에서 이월)

- **다음**: ROADMAP 1.1 역할 시스템 통합. 검증은 L1 + L2(골든 스냅샷 신규 도입)

---

## 2026-09-20 — 로드맵 수립과 개발 레이어 분리

- **작업**
  - 저장소 전수 진단. 확인된 사실은 ROADMAP "착수 시점 진단" 표 9개 항목에 기록
  - `docs/development/ROADMAP.md`, `DESIGN_DECISIONS.md` 신규 작성
  - `CLAUDE.md` 신규 작성 — **기존에 Claude Code 진입점이 전혀 없었다.**
    Codex용 `AGENTS.md`만 있어 새 Claude 세션은 저장소 지침을 자동으로 읽지 못했다
  - `DEVLOG.md` 신규 작성 (이 문서)
  - `AGENTS.md`를 레이어 구분에 맞춰 재구성

- **결정**
  - D1~D9 확정. 핵심은 D2(고정 체인 폐기, 의존성 해소 라우팅),
    D4(에이전트 간 직접 대화 금지, 질문 반환), D7(자율성 상한 = 검증 가능성)
  - D10(레이어 분리), D11(연속성 메커니즘) 추가
  - 사용자 요청으로 동적 라우팅을 Phase 1에 편입. 고정 체인을 폐기하고
    능력 선언 기반 디스패치로 전환한다. 이 때문에 신규 역할 추가가
    1.5 → 1.6으로 밀렸다. 디스패치가 선언 기반이 되면 역할 추가가 거의 공짜가 되므로
    순서상 이게 맞다

- **미해결**
  - ⚠️ **루트 `.codex/agents/*.toml` 3개와 `.agents/skills/feature-orchestrator/`의
    처리 방침 — 사용자 확인 대기.** 이들은 제품 메커니즘을 저장소 자신에 적용한 것이며
    `payloads/codex/`의 사본과 이미 드리프트 중이다 (현재는 한국어/영어 차이지만
    손으로 두 벌을 관리하는 구조라 내용도 갈라진다).
    D10에 따르면 레이어 1은 레이어 2를 쓰지 않아야 하므로 제거가 맞지만,
    삭제하면 이 저장소의 Codex 세션이 오케스트레이션을 잃는다.
    ROADMAP 1.0으로 분리해 두었다. **임의로 삭제하지 말 것**
  - Phase 2 미니 프로젝트 대상 미정. 사용자가 구상 중인 서비스가 있으나
    ROADMAP의 선정 기준 4개(특히 "테스트 가능한 로직 보유")를 만족하는지 미확인

- **다음**: ROADMAP 1.0 (루트 에이전트 파일 처리 방침 확정) → 1.1 (역할 시스템 통합)
