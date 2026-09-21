# 개발 로드맵

이 저장소를 "역할 계약 배포기"에서 "지시를 받아 스스로 완수하는 실행 시스템"으로
진화시키는 단계별 작업 지침이다. 세션이 바뀌어도 이 문서만 읽으면 이어서 작업할 수
있도록 현재 상태, 다음 작업, 완료 기준을 명시한다.

- 세션 진입점과 레이어 구분: [../../CLAUDE.md](../../CLAUDE.md)
- 설계 결정과 근거: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)
- 세션 간 맥락 기록: [DEVLOG.md](./DEVLOG.md)
- 단계별 검증 방법과 임계값: [VERIFICATION.md](./VERIFICATION.md)
- 기존 Codex 구성 이력: [../operations/CODEX_ORCHESTRATION.md](../operations/CODEX_ORCHESTRATION.md)

## 이 문서를 쓰는 방법

1. 작업 시작 전 "현재 상태"와 해당 작업의 완료 기준을 먼저 읽는다.
2. `다음 작업`에 적힌 하나만 수행한다. 여러 작업을 묶어서 처리하지 않는다.
3. 완료 기준을 전부 만족했을 때만 체크박스를 채운다. 부분 완료는 미완료다.
4. 작업을 끝내면 체크박스와 "현재 상태"를 같은 커밋에서 갱신한다.
5. 설계 결정을 바꿔야 하면 DESIGN_DECISIONS.md를 먼저 고치고 로드맵을 조정한다.
   로드맵만 고치고 결정을 남겨두지 않는다.
6. 검증은 실제로 실행한 명령과 결과만 기록한다. 실행하지 못한 검사는 미검증으로 남긴다.
7. 착수 전에 [VERIFICATION.md](./VERIFICATION.md)에서 그 작업의 검증 단계와 임계값을
   확인한다. 임계값은 착수 **전에** 고정하며 사후에 낮추지 않는다.
8. 검사를 먼저 추가해 실패하는 것을 확인한 뒤 통과시킨다. 통과하는 검사를 나중에
   붙이면 아무것도 검증하지 못한다.

---

## 현재 상태

- 진행 단계: **Phase 1 — 1.6 완료, 1.7 미착수**
- 다음 작업: **1.7 능력 선언과 의존성 디스패치**
- 마지막 갱신: 2026-09-20

직전 세션의 맥락과 미해결 항목은 [DEVLOG.md](./DEVLOG.md) 최상단 항목을 읽는다.

---

## 착수 시점 진단 (2026-09-20)

로드맵의 모든 작업은 아래 확인된 사실을 전제로 한다.

| # | 사실 | 근거 |
|---|---|---|
| 1 | 역할 계약은 7개인데 Codex custom agent는 3개만 배포된다 | `payloads/codex/.codex/agents/`에 planner, designer, developer만 존재 |
| 2 | researcher, architect, reviewer는 실행 경로가 없다 | 위와 동일 |
| 3 | 오케스트레이터가 두 개이며 라우팅 표가 서로 다르다 | `skills/role-orchestrator/SKILL.md`는 planner→developer→reviewer, `.agents/skills/feature-orchestrator/SKILL.md`는 planner→designer→developer |
| 4 | 실행 경로에서 리뷰 단계가 빠져 있다 | Codex가 로드하는 것은 후자이며 reviewer가 없다 |
| 5 | 역할 계약에 완료 조건과 중단 조건이 없다 | 7개 SKILL.md 전부 Workflow 항목이 서술형이며 관찰 가능한 종료 조건이 없다 |
| 6 | 추상 도구명이 실제 도구로 매핑되지 않는다 | `adapters/*.json`에 `tools` 키 없음. 경로만 매핑 |
| 7 | 핸드오프 체인이 검증되지 않는다 | `bin/cli.js:1497`은 `handoffOutputs ⊆ requiredOutputs`만 검사. 생산자 존재 여부는 미검사 |
| 8 | `work.json`의 진행 상태를 아무도 쓰지 않는다 | `pendingTasks`/`blockers`는 `cli.js:1286-1287`에서 `[]`로 초기화되고 `1363-1374`에서 출력될 뿐 |
| 9 | CLI는 아무것도 실행하지 않는다 | `bin/cli.js` 전체에 `child_process` 없음 |
| 10 | Claude Code 진입점이 없었다 | `CLAUDE.md` 부재. Codex용 `AGENTS.md`만 존재해 새 Claude 세션이 저장소 지침을 자동으로 읽지 못했다. 2026-09-20 생성 |
| 11 | 루트 에이전트 파일이 payload 사본과 드리프트했다 | `.codex/agents/*.toml` 3개, `.agents/skills/feature-orchestrator/SKILL.md` 전부 `payloads/codex/`의 대응 파일과 다름 (루트 한국어, payload 영어) |

---

## Phase 1 — 역할 시스템 재건

목표: 지시 하나를 받았을 때, 적합한 역할이 자동으로 선택되고 서로 구조화된 핸드오프로
협업하며, 각 역할이 언제 끝나고 언제 멈춰야 하는지 아는 상태.

작업 순서에 의존성이 있다. 1.1을 건너뛰면 이후 개선이 절반만 반영된다.

### 1.0 루트 에이전트 파일 처리 방침 확정

레이어 분리(D10)의 유일한 위반 지점을 정리한다. **사용자 결정이 필요하다.**

대상: 루트 `.codex/agents/{planner,designer,developer}.toml`,
`.agents/skills/feature-orchestrator/SKILL.md`

이들은 제품 메커니즘을 저장소 자신에 적용한 것이며 `payloads/codex/`의 사본과 이미
드리프트했다. 손으로 두 벌을 관리하는 구조이므로 방치하면 내용까지 갈라진다.

선택지:

| 안 | 내용 | 장점 | 비용 |
|---|---|---|---|
| A | 제거 | D10 완전 준수. 드리프트 원천 제거 | 이 저장소의 Codex 세션이 오케스트레이션을 잃는다 |
| B | payload에서 자동 렌더링 | 드리프트 제거, 도그푸딩 유지 | 제품을 고칠 때마다 개발 환경이 같이 바뀐다 (D10의 근거 2에 정면 위배) |
| C | 동결 후 Phase 2까지 유지 | 현 상태 유지, 결정 연기 | 드리프트 계속 누적 |

- [x] 사용자와 A/B/C 확정 → **A 채택 (제거)**
- [x] 확정안을 D10의 "현재 위반 상태" 절에 반영
- [x] 실행 — 루트 `.codex/agents/*.toml` 3개와
      `.agents/skills/feature-orchestrator/SKILL.md` 제거, 빈 디렉터리 정리

완료 기준:
- [x] `CLAUDE.md` 경로별 레이어 표에서 "⚠️ 미정"이 해소된다
- [x] `npm run check` 통과 (루트 사본에 의존하는 코드 없음을 사전 확인)

남은 항목: `.codex/config.toml`은 A의 범위 밖이므로 보존했다. 현재는 custom agent 없이
multi-agent만 켜둔 상태이며 동작에 영향은 없다. 처리 방침은 1.2에서 함께 정한다.

### 1.1 하네스 네이티브 기능 조사 및 설계 검증

**이후 모든 작업의 형태를 결정하므로 가장 먼저 한다.** 우리가 설계한 것(D2~D6)이
Claude Code와 Codex가 이미 네이티브로 제공하는 기능과 중복인지, 보완인지, 충돌인지를
확인한다. 네이티브 기능을 직접 만들면 유지 비용만 늘고 하네스 업데이트에 깨진다.

조사 항목:

- [x] **역할의 네이티브 단위** — Claude는 subagent(`.claude/agents/`)와
      skill(`.claude/skills/`) 중 무엇이 역할에 맞는가. Codex는 custom agent와 skill 중 무엇인가
- [x] **도구 제한 구문** — 역할별 도구 허용/차단을 네이티브로 거는 방법.
      1.5의 매핑 테이블이 이것과 중복인지 판정
- [x] **스킬 바인딩 구문** — 특정 역할에 특정 스킬만 노출하는 네이티브 방법이 있는가 (1.5 입력).
      **표현 불가능하면 1.5의 `skills` 키는 프롬프트 지시로 격하된다**
- [x] **스킬의 해결 경로** — 하네스 내장/패키지 배포/소비자 고유 스킬을 각각 어떻게
      참조하는가. 이름 충돌 시 우선순위는 무엇인가 (D14의 출처 3종 확인)
- [x] **위임 방식** — 역할 간 호출을 네이티브로 어떻게 하는가. D2 디스패처가 이를 대체하는가 보완하는가
- [x] **병렬 실행** — 동시 실행을 네이티브로 지원하는가. D3의 전제 확인
- [x] **컨텍스트 전달** — 서브에이전트에 컨텍스트를 넘기는 네이티브 경로.
      D5 핸드오프가 중복인지 판정

확인이 필요한 구체적 의심 지점:

> `adapters/claude.json`은 `skillsDir: ".claude/skills"` + `fileName: "CLAUDE.md"`로
> `.claude/skills/role-planner/CLAUDE.md`를 생성한다. Claude Code의 스킬 탐색 규약과
> 일치하는지 확인이 필요하다. 불일치라면 **Claude 타깃은 설치돼도 로드되지 않는 상태**이며,
> 1.2 렌더링 설계와 어댑터 스키마가 함께 바뀐다.

산출물:

- [x] `docs/development/HARNESS_CAPABILITIES.md` — 하네스별 기능 대조표.
      각 항목에 확인한 공식 문서 출처를 남긴다
- [x] D2~D6 각각에 **네이티브 / 보완 / 충돌** 판정 기록
- [x] 충돌 판정이 나온 결정은 `DESIGN_DECISIONS.md`를 먼저 수정하고 로드맵을 조정 — **충돌 없음**

완료 기준:
- [x] 대조표의 모든 항목에 출처가 있다. 미확인 항목은 `미확인`으로 명시했다
- [x] Claude 어댑터 `fileName` 문제에 결론이 났다 — **결함 확정**
- [x] 충돌 판정 없음. D2~D6, D14 모두 유지

**결과**: D3·D4·D14는 네이티브, D2·D5는 보완, D6는 부분 네이티브.
Claude 타깃은 현재 설치되어도 로드되지 않는 상태로 확인됐다.

### 1.2 역할 시스템 통합

두 개로 갈라진 역할 시스템을 하나로 합친다. **1.1 결과로 Claude 타깃 재구성이
범위에 추가됐다.**

⚠️ **먼저**: 현재 Claude 타깃은 `.claude/skills/<role>/CLAUDE.md`를 생성하는데
Claude Code 스킬 파일명은 `SKILL.md` 고정이라 **설치되어도 로드되지 않는다.**
역할을 스킬 경로에 둔 것도 잘못이다. 역할은 서브에이전트다.

- [x] **Claude 타깃을 역할=서브에이전트로 재구성한다.** `.claude/agents/<role>.md`,
      Markdown + YAML frontmatter
- [x] **어댑터 스키마를 바꾼다.** `fileName` 단일 값으로는 부족하다.
      타깃마다 역할 경로와 스킬 경로가 분리되고 파일 형식도 다르다 (Markdown / TOML)
- [x] **`mutationPolicy` → 네이티브 권한 키 렌더링 표**를 만든다
      (Claude `permissionMode`/`tools`, Codex `sandbox_mode`)
- [x] **`.codex/config.toml` 처리 결정.** `features.multi_agent`와 `agents.enabled`는
      기본값이 `true`이므로 payload의 config는 `max_concurrent_threads_per_session`만
      실질적 의미를 갖는다. 루트에 남겨둔 파일도 함께 정리한다

- [x] 오케스트레이터 정본을 `skills/role-orchestrator/SKILL.md`로 정한다
- [x] `.agents/skills/feature-orchestrator/SKILL.md`를 손으로 쓴 파일에서
      정본의 렌더링 결과로 바꾼다
- [x] custom agent `.toml`을 `manifest` + `SKILL.md`에서 렌더링하도록 바꾼다
      (현재는 계약과 실행 파일이 따로 관리되어 갈라졌다)
- [x] 7개 역할 전부 배포되게 한다 (오케스트레이터는 스킬, 나머지 6개는 에이전트 — D15)
- [x] `validate`에 "manifest 역할 수 = 배포 파일 수" 검사를 추가한다

완료 기준:
- [x] `npm run check` 통과
- [x] 오케스트레이터 라우팅 정의가 저장소에 단 한 곳만 존재한다
- [x] **Claude 실제 로드 검증 통과.** 서브에이전트 6개 + 오케스트레이터 스킬 전부 노출
- [x] Codex `role-orchestrator` 스킬 실제 로드 검증 통과
- [x] 생성된 TOML 6개 `tomllib` 파싱 및 `sandbox_mode` 일치 확인
- [ ] Codex custom agent 노출 — **trust 게이트로 미확인.** 프로젝트가 untrusted면
      `.codex/` 레이어 전체가 스킵된다 (우리 결함 아님, 근거는 HARNESS_CAPABILITIES 9절).
      Codex 사용량 한도로 2026-09-21 이후 재시도

### 1.2b 레거시 경로 마이그레이션

1.2에서 배포 경로가 바뀌어 기존 설치본에 고아 파일이 남는다. 실측 결과:

```
구버전 설치 → 신버전 update 실행 후
  .claude/agents/role-*.md              ← 새로 생성되고 state에 기록됨 (정상)
  .claude/skills/role-orchestrator/SKILL.md  ← 정상
  .claude/skills/role-*/CLAUDE.md       ← 7개 고아. state에서 빠져 uninstall로도 안 지워진다
```

파괴적이지는 않다. 구 파일은 Claude Code가 애초에 로드하지 않았으므로 무해하지만,
`uninstall` 후에도 남아 사용자 저장소를 더럽힌다.

`adapters/*.json`의 `legacyRolePaths` 키가 이 작업의 입력이다. 현재는 선언만 되어 있고
코드가 읽지 않는다.

- [x] 타깃 공통 `getLegacyRolePlan(adapter, targetState)` 추가. 어댑터의
      `legacyRolePaths`를 입력으로 쓴다
- [x] 기록된 해시로 소유권이 증명될 때만 제거한다. 증명 불가 파일은 **보존하고 보고**한다
      (중단하지 않는다 — 구 파일은 이미 로드되지 않으므로 갱신 전체를 막을 이유가 없다)
- [x] 1.0.x Codex 레거시 경로(`.codex/skills/role-*/AGENT.md`) 처리를 유지한다
- [x] `update`와 `uninstall` 양쪽에 연결한다
- [x] 스모크 테스트에 구 레이아웃 합성 → update → 고아 없음 시나리오를 추가한다

- [x] **추가로 발견한 회귀 수정.** 1.2가 state 키 형식을 `<role>/<fileName>`에서
      프로젝트 상대 경로로 바꾸면서 **기존 cursor 설치본이 update를 전혀 하지 못했다**
      (소유권 해시를 못 찾아 전부 conflict). `findRecordedHash`가 구 키를 폴백으로
      본다. 단, 파일이 새 경로에 실제로 존재할 때만 적용한다 — 없으면 경로 이동이지
      소유권 위반이 아니다

완료 기준:
- [x] 구버전 설치본을 update하면 구 경로 파일이 남지 않는다 (cursor/claude/codex 실측)
- [x] 사용자가 수정한 구 파일은 제거되지 않고 경로가 보고된다 (`[kept]`)
- [x] 사이드카 파일은 보존된다
- [x] update 없이 바로 uninstall해도 잔여 파일이 없다

### 1.3 역할 계약에 Activation / Done / Stop 추가

출력 템플릿은 이미 충분하므로 건드리지 않는다. 빠진 것은 "언제 시작하고 언제 끝나고
언제 멈추는가"다.

- [x] 7개 SKILL.md 전부에 아래 세 섹션을 추가한다
- [x] `validate`가 세 섹션의 존재를 강제하도록 한다

```markdown
## Activation
- 이 역할이 필요한 조건: (관찰 가능한 형태로)
- 건너뛰어도 되는 조건:

## Done Criteria
- 아래가 전부 참이면 종료: (체크 가능한 목록)

## Stop Conditions
- 즉시 중단하고 상위로 반환: (예: 결정 권한 없음, 범위 밖 파일 수정 필요)
```

`Stop Conditions`가 이 작업의 핵심이다. 자율 에이전트의 1위 실패 모드는 멈춤이 아니라
잘못된 방향으로 오래 달리는 것이고, 그것을 막는 것은 프롬프트 품질이 아니라 명시적
중단 조건이다.

완료 기준:
- [x] 7개 SKILL.md 전부 세 섹션 보유, `validate` 통과
- [x] Stop Conditions가 다음 역할을 지명하지 않고 필요한 능력만 기술한다 (D16).
      `validate`가 타 역할 언급을 실패로 처리한다
- [x] Done Criteria의 모든 항목이 사람이 참/거짓을 판정할 수 있는 문장이다.
      전수 검토 후 주관적이던 2건(reviewer의 "그대로 실행할 수 있는 형태",
      researcher의 "다시 탐색하지 않고 판단할 수 있는")을 확인 가능한 문장으로 바꿨다
- [x] 세 섹션이 claude / codex / cursor 배포물에 모두 반영된다 (실측)

### 1.4 핸드오프 스키마 고정

D5를 구현한다.

- [x] `templates/handoff-template.md`를 봉투 구조로 교체한다
- [x] 7개 SKILL.md 전부에 `## Handoff Contract` 봉투를 추가한다.
      역할별 산출물(payload)과 분리된 공통 봉투(envelope)로 설계했다
- [x] `facts_confirmed` 항목에 출처를 필수로 만든다
- [x] `out_of_scope`를 필수 필드로 만든다
- [x] `blocking_questions` 반환 프로토콜(D4)을 봉투와 오케스트레이터 계약에 명시한다
- [x] 핸드오프에 `needs` 필드를 추가한다 (D16)
- [x] `to` 필드를 두지 않는다. 역할이 다음 역할을 지명하는 것은 D16 위반이다
- [x] `validate`가 봉투 9개 필드와 `from`이 자기 역할인지를 검사한다

완료 기준:
- [x] 역할 하나를 수동 실행했을 때 스키마를 지킨 핸드오프가 나온다.
      `role-planner` 서브에이전트를 실제 실행해 봉투를 받고 기계 판정으로 검증했다
- [x] 출처 없는 주장이 `facts_confirmed`가 아니라 `assumptions`로 간다.
      실행 결과: facts 6개 전부 출처 보유, assumptions 8개 전부 출처 없음, risk 8/8 표기
- [x] `status`와 `blocking_questions`의 일관성이 유지된다 (실행 결과 `blocked` 일치)
- [x] 실행 결과가 다음 역할을 지명하지 않는다 (D16 준수 확인)

### 1.5 역할별 스킬·도구 바인딩

각 역할이 **어떤 스킬과 도구를 쓸 수 있는지** 선언으로 고정하고, 타깃의 네이티브
구문으로 렌더링한다. 1.1의 조사 결과에 따라 형태가 정해진다 — 네이티브 구문이 있으면
그것으로 렌더링하고, 없는 타깃은 프롬프트 지시로 대체한다.

현재는 manifest에 `requiredTools`/`optionalTools`가 추상 이름으로만 있고 매핑이 없으며,
"역할이 호출할 수 있는 스킬"이라는 개념 자체가 없다.

- [x] **manifest 최상위 키를 `skills` → `roles`로 변경한다.** 역할별 `skills`를
      추가하면 한 파일에서 `skills`가 두 뜻이 된다. `bin/cli.js`에 하위 호환 처리 포함
- [x] manifest 역할에 `skills` 키를 추가한다 (역할이 호출 가능한 절차의 허용 목록).
      **초기값은 빈 배열.** 스킬을 선험적으로 설계하지 않는다 (D14)
- [x] `toolPolicy`를 추가한다. 기본값은 `deny-by-default` — 선언되지 않은 도구는 쓰지 않는다
- [x] `adapters/*.json`에 `tools` 매핑을 추가하고 타깃 네이티브 구문으로 렌더링한다.
      `skills` 매핑은 모든 역할의 `skills`가 빈 배열이라 아직 필요 없다 (D14: 선험적 설계 금지).
      역할이 실제로 스킬을 선언할 때 추가한다
- [x] 매핑이 `null`인 도구는 `## Tools` 표에 "없음"으로 표시하고 조건문을 제거한다
- [x] `validate`가 manifest의 모든 도구명 매핑 존재를 검사한다
- [x] **추가: 도구를 역할 선언에서 도출한다 (D17).** 고정 목록은 같은 정책의 역할에
      가장 넓은 권한을 준다
- [x] **추가: 읽기 전용 보장 검사.** 1.5 중 `role-reviewer`가 `none`인데
      `test_runner` → `Bash`를 받아 읽기 전용이 아니었다. 어댑터의
      `writeCapableTools`로 기계 검사한다

용어는 D14에서 고정했다. 핸드오프를 주고받으면 역할, 아니면 스킬이나 도구이며,
무엇에 접근하는가는 도구, 어떻게 하는가는 스킬이다.

```json
{
  "name": "role-analyst",
  "skills": [],
  "requiredTools": ["file_read"],
  "optionalTools": ["web_search", "metric_query"],
  "toolPolicy": "deny-by-default"
}
```

`skills`가 비어 있는 것이 정상 초기 상태다. 지표 조회처럼 무언가에 **접근**하는 것은
스킬이 아니라 도구로 선언한다.

```json
"tools": {
  "web_search": { "codex": "web_search", "claude": "WebSearch", "cursor": null },
  "test_runner": { "codex": "shell", "claude": "Bash", "cursor": "terminal" }
}
```

완료 기준:
- [x] 렌더링 결과에 도구 가용성 조건문이 남지 않는다. `validate`가 검사한다
- [x] 에이전트가 자기 도구 가용성을 추론할 필요가 없다. `## Tools` 표가 사실을 준다
- [x] 역할별 도구 허용 목록이 타깃 네이티브 구문으로 렌더링된다
      (claude `tools:` frontmatter, codex `web_search`).
      네이티브 수단이 없는 타깃은 `toolBindingNote`에 기록했다
- [ ] 선언되지 않은 도구를 역할이 사용하면 탐지된다 — **1.6 하네스에서 구현**
- [x] manifest 최상위 키가 `roles`이고, 구 `skills` 키를 가진 파일도 동작한다 (실측)

### 1.6 동작 검증 하네스

L3 동작 검증을 만든다. 1.4에서 핸드오프 스키마가 생겨야 판정 기준이 존재하므로
그 이후에만 만들 수 있고, **1.7 착수 전까지 반드시 있어야 한다.**
1.7은 Phase 1에서 가장 큰 변경이며 검증 없이 진행하지 않는다 (D12).

- [x] `tests/eval/cases/` 시나리오 파일 형식 확정 (frontmatter + 근거 설명)
- [x] 라우팅 케이스 R1~R5 + 봉투 케이스 R6 작성
- [x] **판정기(`tests/eval/judge.js`)를 실행기와 분리했다.** 모델을 호출하지 않는
      순수 모듈이라 `npm run check`에서 매번 자체 검증된다
- [x] 판정기 구현: 봉투 9개 필드, 출처 실재, assumptions 출처 부재,
      status 일관성, needs 어휘, D16 역할 지명, 라우팅 기대/금지, 스텝 상한
- [x] n회 반복 실행과 통과율 집계 (`npm run eval -- --runs 5`)
- [x] 실패를 계약 결함 / 컨텍스트 부족 / 모델 변동으로 분류해 기록
- [x] 결과를 `docs/development/eval-history/`에 남긴다

**모드 분리**: `routing`은 역할 선택과 스텝만, `role`은 봉투만 판정한다.
부모 스트림에는 서브에이전트 내부 도구가 나타나지 않으므로 라우팅 모드에서
관찰되는 도구는 메인 세션의 것이며 역할 계약의 대상이 아니다. 이를 구분하지 않아
첫 실행이 거짓 실패를 냈다.

완료 기준:
- [x] 현재 역할 구성으로 `npm run eval`이 돌고 통과율이 출력된다.
      첫 유효 베이스라인: **40/41 검사, 5/6 케이스**
- [x] 필수 필드를 빼면 판정기가 실패를 낸다. `judge.test.js`가 위반 봉투 12종과
      관찰기 회귀를 모델 없이 검증한다
- [x] 실패 원인 3분류가 결과에 기록된다

**열려 있는 발견**: R6에서 `role-planner`가 쓰려다 실패한 파일을 출처로 인용했다.
1회로는 계약 결함인지 모델 변동인지 구분할 수 없어 `--runs 5`가 필요하다.
임계값을 낮춰 통과시키지 않는다. `eval-history/README.md` 참조.

### 1.7 능력 선언과 의존성 디스패치

D2의 구현. 고정 체인을 폐기하고 라우팅을 선언에서 계산한다.
**이 작업이 끝나면 1.8의 역할 추가가 거의 공짜가 된다.**

- [ ] manifest 각 역할에 `capabilities`, `produces`, `consumes`를 추가한다.
      `capabilities`는 D16의 능력 어휘와 같은 값을 쓴다
      (`product-intent`, `ui-decision`, `code-evidence`, `external-evidence`,
      `contract-decision`, `implementation`, `verification`, `acceptance-criteria`)
- [ ] `validate`가 계약의 `필요한 것`과 역할 `capabilities` 어휘가 어긋나지 않는지 검사한다
- [ ] 오케스트레이터 계약을 고정 라우팅 표에서 의존성 해소 절차로 교체한다
- [ ] D3의 병렬 규칙을 오케스트레이터 계약에 명시한다
- [ ] D6의 경계 조건을 오케스트레이터 계약에 명시한다
      (Phase 3에서 드라이버가 이 값을 기계적으로 강제한다)
- [ ] `skills/role-orchestrator/SKILL.md`와 렌더링된 오케스트레이터에서
      하드코딩된 라우팅 표를 제거한다

완료 기준:
- **1.6 하네스의 라우팅 케이스 전체를 임계값 이상으로 통과한다 (전후 비교 필수)**
- 저장소 어디에도 `요청 유형 → 고정 역할 순서` 표가 남아있지 않다
- 같은 요청에 대해 상황(기존 문서 유무)에 따라 다른 역할 조합이 선택된다
- `role-researcher`와 `role-analyst`처럼 `mutationPolicy: none`인 역할이
  동시에 배정될 수 있다

### 1.8 신규 역할 3개

D1의 기준으로 도출된 역할만 추가한다.

- [ ] `role-analyst` — 외부 시장/경쟁/유저 지표. `mutationPolicy: none`.
      산출물: `market_evidence`, `metric_report`, `opportunity_candidates`.
      체인의 **앞**(신규 기획)과 **뒤**(배포 후 피드백) 양쪽에 등장한다
- [ ] `role-qa` — 수용 기준을 실행 가능한 테스트로. `mutationPolicy: implementation`
      (테스트 파일 경로로 한정). 산출물: `test_plan`, `executable_tests`, `coverage_gaps`.
      **`role-developer` 앞에 배치한다** (D7)
- [ ] `role-releaser` — 빌드/배포/롤백. `mutationPolicy: implementation`.
      Phase 3.1에서 활성화하되 계약은 여기서 만든다
- [ ] 기존 `role-researcher`의 본문을 내부 코드/문서 근거 수집으로 좁힌다
      (현재 이름과 달리 본문이 전부 코드 조사이며, 외부 조사는 `role-analyst`로 간다)

완료 기준:
- 총 10개 역할이 배포되고 `/agent`에서 확인된다
- 라우팅 표를 수정하지 않고 선언 추가만으로 동작한다 (1.7 검증)

### 1.9 의존성 그래프 검증

- [ ] `validate`에 추가: 모든 역할의 `consumes`가 상류 역할의 `produces`에 존재하는지
- [ ] `validate`에 추가: 의존성 그래프에 순환이 없는지
- [ ] `validate`에 추가: 도달 불가능한 역할이 없는지

완료 기준:
- 존재하지 않는 산출물을 `consumes`에 넣으면 `npm run check`가 실패한다
- 역할 10개의 그래프가 기계적으로 검증된다

---

## Phase 2 — 미니 프로젝트 실증

**이 단계에서 자동 루프를 만들지 않는다.** 사람이 크랭크를 돌리되 Phase 1의 역할들이
실제로 일을 해내는지 본다. 드라이버를 먼저 넣으면 실패 원인이 역할 정의인지 드라이버인지
구분할 수 없다.

### 미니 프로젝트 선정 기준

- [ ] 테스트 가능한 로직이 있다 (순수 CRUD 화면만 있으면 QA 역할이 할 일이 없어 부적합)
- [ ] 사용자가 도메인을 잘 알아 산출물의 오류를 알아볼 수 있다
- [ ] 사람 혼자 2~3일이면 만들 수 있는 크기다 (비교 기준 확보)
- [ ] 배포 가능하다 (Phase 3에서 관측 대상이 된다)

### 측정 항목 (시작 전에 확정한다)

이것을 정하지 않으면 "잘 되는 것 같다"로 끝나고 Phase 3의 설계 근거가 사라진다.

| 지표 | 용도 |
|---|---|
| 기능당 사람 개입 횟수 | Phase 3에서 줄여야 할 대상 |
| **개입 이유 분류** | 역할 정의 결함 / 컨텍스트 부족 / 판단 필요 |
| 핸드오프 손실 | 앞 역할의 결정을 뒤 역할이 무시하거나 재결정한 횟수 |
| 범위 확장 | 요청하지 않은 파일을 수정한 횟수 |
| 게이트 1회 통과율 | Phase 3 재시도 한도의 근거 |

"개입 이유 분류"가 Phase 3의 설계도 그 자체다. `판단 필요`로 분류된 항목은 영구
사람 체크포인트로 남기고, 나머지 둘은 고쳐서 자동화 범위에 넣는다.

### 실행

- [ ] 대상 프로젝트에 install / init / feature 수행
- [ ] analyst → planner 기획 (실제 외부 조사가 되는지 확인)
- [ ] 동적 디스패치가 실제로 적합한 역할을 고르는지 관찰 (1.5 실증)
- [ ] 매 핸드오프를 사람이 읽고 손실 기록 ← 이것이 이 단계의 실제 산출물
- [ ] 회고: 불필요했던 역할, 없어서 막힌 역할, 경계 조건 위반 사례

Phase 1의 역할 정의를 여기서 최소 1회 되감는다. 그것을 예상하고 일정을 잡는다.

---

## Phase 3 — 배포와 상시 실행

Phase 2의 서비스를 실제 배포하고, 그것을 관측 대상 삼아 루프를 닫는다.

### 3.1 배포

- [ ] 사람이 직접 1회 배포한다 (에이전트에게 먼저 맡기지 않는다)
- [ ] 그 절차를 `role-releaser` 계약으로 고정한다

### 3.2 L1 — 드라이버 도입

D8의 구현. `bin/cli.js`에 `child_process`가 들어가는 첫 지점.

- [ ] 헤드리스 에이전트를 순차 호출하는 Node 드라이버
- [ ] `work.json`을 기계 판독 SSoT로 승격 (`pendingTasks`/`blockers`에 실제로 쓰기)
- [ ] `workflow.json`에 게이트 선언: `{ "gates": {...}, "maxRetries": 3 }`
- [ ] D6의 경계 조건을 드라이버가 강제
- [ ] D9의 규칙 반전을 자율 모드에 한해 적용

범위: 한 기능을 `qa → developer → 게이트`까지 무인 실행, PR 생성에서 멈추고 사람 승인.

### 3.3 L2 — 자가 수정 루프

- [ ] 게이트 실패 로그를 다음 developer 턴의 입력으로 전달
- [ ] 재시도 한도 초과 시 사람 호출
- [ ] 작업별 git worktree 격리 (실패한 시도를 버릴 수 있어야 재시도가 안전하다)

### 3.4 L3 — 상시 실행

- [ ] 이슈/요청 큐를 작업 단위로 소비
- [ ] 배포된 서비스의 지표를 `role-analyst`가 주기적으로 읽어 개선 후보 생성
- [ ] 생성된 후보를 큐에 투입 ← 여기서 루프가 닫힌다

### 안전장치 (3.2부터 적용, 나중에 붙이지 않는다)

- [ ] 반복 횟수 상한
- [ ] 토큰 예산 상한
- [ ] diff 크기 상한
- [ ] 위험 경로 차단 목록

---

## 의존성 요약

```
1.0 레이어 경계 확정 ✅
  ↓
1.1 하네스 네이티브 조사 ← 이후 모든 작업의 형태를 결정
  ↓
1.2 시스템 통합
  ├─→ 1.3 Activation/Done/Stop ─┐
  ├─→ 1.4 핸드오프 스키마 ───────┤
  └─→ 1.5 스킬·도구 바인딩 ──────┴─→ 1.6 검증 하네스
                                          ↓
                                     1.7 의존성 디스패치 ─→ 1.8 신규 역할 ─→ 1.9 그래프 검증
                                                                                    │
                                                    Phase 2 미니 프로젝트 ←──────────┘
                                                    (역할 정의 1회 되감기)
                                                              │
                                    3.1 배포 → 3.2 L1 → 3.3 L2 → 3.4 L3
```
