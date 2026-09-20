# 하네스 네이티브 기능 대조표

ROADMAP 1.1의 산출물. 우리가 설계한 것(D2~D6, D14)이 Claude Code와 Codex의 네이티브
기능과 중복인지, 보완인지, 충돌인지 판정한다. 판정 결과를 따른다 (D13).

**조사일: 2026-09-20.** 모든 항목에 출처를 남긴다. 출처 없는 칸은 `미확인`으로 표시한다.

## 출처

| # | 문서 | URL |
|---|---|---|
| C1 | Claude Code — Skills | https://code.claude.com/docs/en/skills |
| C2 | Claude Code — Subagents | https://code.claude.com/docs/en/sub-agents |
| X1 | Codex — Subagents | https://learn.chatgpt.com/docs/agent-configuration/subagents |
| X2 | Codex — Config Reference | https://learn.chatgpt.com/docs/config-file/config-reference |
| X3 | Codex — Build skills | https://learn.chatgpt.com/docs/build-skills |

---

## 1. 역할과 스킬의 네이티브 단위

| | Claude Code | Codex |
|---|---|---|
| 스킬 경로 | `.claude/skills/<name>/SKILL.md` (C1) | `.agents/skills/<name>/SKILL.md` (X3) |
| 스킬 개인 경로 | `~/.claude/skills/<name>/SKILL.md` (C1) | `~/.agents/skills/<name>/SKILL.md` (X3) |
| 파일명 | **`SKILL.md` 고정** (C1) | **`SKILL.md` 고정** (X3) |
| 역할(에이전트) 경로 | `.claude/agents/<name>.md` (C2) | `.codex/agents/<name>.toml` (X1) |
| 역할 개인 경로 | `~/.claude/agents/` (C2) | `~/.codex/agents/` (X1) |
| 역할 파일 형식 | Markdown + YAML frontmatter (C2) | TOML (X1) |

**D14의 역할/스킬 구분은 두 하네스 모두에 네이티브로 존재한다.** 역할은 에이전트,
스킬은 스킬이며 저장 위치와 형식이 다르다.

### ⚠️ 확정된 결함: `adapters/claude.json`

현재 어댑터는 `skillsDir: ".claude/skills"` + `fileName: "CLAUDE.md"`로
`.claude/skills/role-planner/CLAUDE.md`를 생성한다.

C1은 스킬 파일명이 `SKILL.md`로 고정이라고 명시한다. 따라서 **현재 Claude 타깃은
설치되어도 스킬로 탐색되지 않는다.** 두 가지가 동시에 틀렸다.

1. 파일명이 `SKILL.md`가 아니다
2. 역할을 스킬 경로에 두고 있다. 역할은 `.claude/agents/`에 속한다

Codex 타깃의 경로(`.agents/skills/`, `.codex/agents/`)는 정확하다.

---

## 2. 역할별 도구 제한

| | Claude Code (C2) | Codex (X1) |
|---|---|---|
| 허용 목록 | `tools: Read, Grep, Glob` | 없음. `sandbox_mode`로 대체 |
| 차단 목록 | `disallowedTools: Write, Edit` | 없음 |
| 쓰기 권한 | `permissionMode` | `sandbox_mode: read-only \| workspace-write` |
| MCP 제한 | `mcpServers`, `disallowedTools: mcp__<server>` | `mcp_servers` |
| 하위 에이전트 제한 | `tools: Agent(worker, researcher)` | 미확인 |

Claude는 `disallowedTools`를 먼저 적용하고 남은 풀에 `tools`를 해소한다 (C2).

**판정: 네이티브.** `mutationPolicy`는 Claude `permissionMode`/`tools`,
Codex `sandbox_mode`로 렌더링한다. 우리가 런타임 강제 장치를 만들 필요가 없다.

---

## 3. 역할별 스킬 바인딩 (1.5의 핵심 질문)

| | Claude Code | Codex |
|---|---|---|
| 방식 | 서브에이전트 frontmatter `skills:` (C2) | `[[skills.config]]`의 `enabled`/`path` (X1, X2) |
| 의미 | "시작 시 컨텍스트에 preload할 스킬" | 스킬별 활성/비활성 + 경로 지정 |
| 에이전트 직접 바인딩 | ✅ 지원 | ⚠️ 직접 지원 없음. agent config layer로 달성 (X3) |
| 카탈로그 예산 | 미확인 | `skills.max_context_tokens` (기본 컨텍스트의 2%, 최대 10,000) (X2) |

**판정: 네이티브.** 1.5의 `skills` 키는 프롬프트 지시로 격하되지 않는다.
Claude는 `skills:` frontmatter로 직접 렌더링하고, Codex는 custom agent TOML의
`[[skills.config]]`에 `enabled = false`로 비활성 목록을 렌더링한다(허용 목록의 여집합).

Codex 스킬은 `agents/openai.yaml`로 자신이 쓸 MCP/도구 의존성을 선언할 수 있다 (X3).

---

## 4. 위임과 디스패치 (D2)

| | Claude Code | Codex |
|---|---|---|
| 자동 위임 | `description` 기반 자동 선택 (C2) | `AGENTS.md`/스킬 지시 기반 (X1) |
| 명시 호출 | `@"name (agent)"`, 자연어 지명, `--agent` (C2) | 프롬프트로 spawn 지시 (X1) |
| 프로그램 제어 | Agent 도구 | `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent` (X2) |
| 호출 가능 대상 제한 | `tools: Agent(a, b)` (C2) | 미확인 |

**판정: 보완.** 네이티브가 제공하는 것은 "누구에게 넘길까"의 선택이고, D2가 더하는 것은
**"아직 없는 산출물"을 기준으로 한 순서 계산과 재계산**이다. 네이티브 위임을 대체하지
않고 그 위에 얹는다. Codex의 `spawn_agent`/`wait_agent`는 디스패처를 직접 구현할 수
있는 네이티브 수단이다.

---

## 5. 병렬 실행 (D3)

| | Claude Code | Codex |
|---|---|---|
| 병렬 지원 | ✅ (C2) | ✅ "모든 결과가 준비될 때까지 대기 후 통합 응답" (X1) |
| 동시성 상한 | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (기본 20) (C2) | `agents.max_concurrent_threads_per_session` (X2) |

**판정: 네이티브.** D3의 `mutationPolicy` 기반 병렬 판정은 유지하되, 스케줄러와
동시성 상한은 우리가 만들지 않는다. 현재 payload의 `max_concurrent_threads_per_session = 3`은
그대로 유효하다.

---

## 6. 에이전트 간 대화와 컨텍스트 전달 (D4, D5)

Claude 비-fork 서브에이전트가 받는 것 (C2):

1. 자기 시스템 프롬프트 + 환경 정보
2. **task message — 부모가 작성한 위임 프롬프트**
3. `CLAUDE.md` 계층 전체 (`omitClaudeMd: true`로 제외 가능)
4. 부모 세션 시작 시점의 git status
5. `skills:`에 선언된 스킬의 전체 내용
6. 형제 에이전트 명단

**받지 못하는 것**: 대화 이력, 이전에 호출된 스킬, 메인이 읽은 파일, 부모의 자동 메모리.

**D4 판정: 네이티브.** 서브에이전트가 대화 이력을 못 보고 결과만 부모로 반환하므로
**에이전트 간 직접 대화가 구조적으로 불가능하다.** D4는 우리가 강제할 규칙이 아니라
하네스가 이미 강제하는 구조다. Codex의 `send_input`/`wait_agent`도 부모 경유 구조다.

**D5 판정: 보완.** 구조화된 컨텍스트를 넘기는 네이티브 경로가 없다. 전달 수단은
task message 하나뿐이므로, **핸드오프 스키마는 우리가 정의해야 한다.** D5는 유지한다.

---

## 7. 경계 조건 (D6)

| D6 항목 | Claude Code | Codex | 판정 |
|---|---|---|---|
| `maxSteps` | `maxTurns` (C2) | 미확인 | 네이티브(Claude) |
| 동시성 상한 | 환경변수 (C2) | `max_concurrent_threads_per_session` (X2) | 네이티브 |
| `maxReentry` | 없음 | 없음 | 우리 구현 |
| `noProgressLimit` | 없음 | 없음 | 우리 구현 |
| `out_of_scope` 위반 감지 | 없음 | 없음 | 우리 구현 |
| 수명주기 훅 | `SubagentStart/Stop`, `PreToolUse/PostToolUse` (C2) | 미확인 | 드라이버 연결점 |

**판정: 부분 네이티브.** `maxSteps`는 `maxTurns`에 위임하고, 나머지 셋은 Phase 3.2
드라이버가 구현한다. Claude의 수명주기 훅이 드라이버의 관측 지점이 될 수 있다.

---

## 8. Phase 3 관련 네이티브 기능

1.1의 범위는 아니지만 조사 중 확인되어 기록한다. Phase 3 설계 시 재확인한다.

| 우리 계획 | 네이티브 | 출처 |
|---|---|---|
| D9 작업별 worktree 격리 (3.3) | `isolation: worktree` | C2 |
| 역할별 영속 상태 | `memory: user \| project \| local` | C2 |
| 백그라운드 실행 | `background: true` | C2 |
| 역할별 모델/추론 강도 | `model`, `effort` / `model`, `model_reasoning_effort` | C2, X1 |

**D9의 worktree 격리를 직접 만들 필요가 없다.** Phase 3.3의 범위가 줄어든다.

---

## 판정 요약

| 결정 | 판정 | 행동 |
|---|---|---|
| D2 의존성 디스패치 | **보완** | 네이티브 위임 위에 산출물 의존성 계산만 얹는다 |
| D3 병렬 = mutationPolicy | **네이티브** | 판정 규칙은 유지, 스케줄러·상한은 네이티브에 위임 |
| D4 직접 대화 금지 | **네이티브** | 하네스가 이미 강제. `blocking_questions` 필드만 추가 |
| D5 핸드오프 스키마 | **보완** | 유지. 전달 수단은 task message |
| D6 경계 조건 | **부분** | `maxSteps`는 `maxTurns`로, 나머지는 드라이버 |
| D14 스킬 바인딩 | **네이티브** | `skills:` / `[[skills.config]]`로 렌더링 |

**충돌 판정 없음.** 따라서 D2~D6, D14를 수정할 필요는 없다.
다만 D3, D4, D14에서 우리가 만들 범위가 줄었고, 아래가 새로 필요해졌다.

## 1.2 이후에 반영할 것

1. **Claude 타깃을 역할=서브에이전트로 재구성한다.** `.claude/agents/<role>.md`.
   현재 `.claude/skills/<role>/CLAUDE.md`는 로드되지 않는다
2. **어댑터 스키마를 바꾼다.** `fileName` 단일 값으로는 부족하다. 타깃마다
   역할 경로와 스킬 경로가 분리되고 파일 형식도 다르다(Markdown/TOML)
3. **`mutationPolicy` → 네이티브 권한 키 렌더링 표**를 만든다
   (Claude `permissionMode`/`tools`, Codex `sandbox_mode`)
4. **`.codex/config.toml` 재검토.** X2에 따르면 `features.multi_agent`와
   `agents.enabled`는 기본값이 `true`다. 현재 payload의 config는
   `max_concurrent_threads_per_session = 3`만 실질적 의미를 가진다

## 미확인 항목

- Codex의 역할별 도구 허용 목록 (sandbox_mode 외에 세분화 수단이 있는가)
- Codex의 하위 에이전트 spawn 대상 제한
- Codex의 턴 수 상한에 해당하는 키
- Claude 스킬 카탈로그의 토큰 예산 상한
