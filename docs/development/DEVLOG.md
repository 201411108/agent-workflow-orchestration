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
