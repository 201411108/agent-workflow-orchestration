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


---

## 9. 실제 하네스 로드 검증 (2026-09-20)

1.2 배포 결과를 실제 CLI로 확인했다. 검증 프로젝트에 두 타깃을 설치한 뒤
각 하네스에 자기가 보는 역할 목록을 묻는 방식이다.

환경: Claude Code 2.1.267, codex-cli 0.154.0

### Claude — 통과

```
AGENTS: claude, Explore, general-purpose, Plan, role-architect, role-designer,
        role-developer, role-planner, role-researcher, role-reviewer, statusline-setup
SKILLS: role-orchestrator, dataviz, update-config, ...
```

서브에이전트 6개와 오케스트레이터 스킬이 전부 로드된다. **1.2 이전 레이아웃
(`.claude/skills/<role>/CLAUDE.md`)이었다면 하나도 나타나지 않는다.**

### Codex — 스킬 통과, 에이전트는 trust 게이트에 막힘

```
AGENTS: NONE
SKILLS: ..., role-orchestrator, ...
```

`role-orchestrator` 스킬은 로드된다. `.agents/skills/`는 `.codex/` 밖이라
trust 게이트의 영향을 받지 않는다.

custom agent 6개가 보이지 않는 원인을 다음 순서로 좁혔다.

1. 프로젝트 `.codex/config.toml`에 `model_reasoning_effort = "low"`를 추가해도
   세션 헤더는 `reasoning effort: high` — **config.toml도 로드되지 않는다**
2. 대조군으로 `-c model_reasoning_effort="low"`를 주면 헤더가 `low`로 바뀐다 —
   `-c` 플래그 자체는 정상 동작한다
3. `~/.codex/config.toml`에 `[projects."<path>"] trust_level = "trusted"` 항목들이
   존재하고, 검증 디렉터리는 그 목록에 없다
4. 공식 문서(X1): *"Project-scoped agent files only load when the project is trusted.
   Untrusted projects skip the `.codex/` layer entirely."*

**결론: `.codex/` 레이어 전체(config + agents)가 프로젝트 trust 뒤에 있다.
우리 파일의 결함이 아니다.** `-c`로는 trust를 부여할 수 없어(2) 모델 호출 없이는
최종 확인이 불가능하다.

### 생성된 TOML 정적 검증 — 통과

trust가 부여되면 파싱될 수 있는 상태인지 `tomllib`으로 확인했다.

| 파일 | 필수 키 | sandbox_mode |
|---|---|---|
| role-architect.toml | OK | read-only |
| role-designer.toml | OK | workspace-write |
| role-developer.toml | OK | workspace-write |
| role-planner.toml | OK | workspace-write |
| role-researcher.toml | OK | read-only |
| role-reviewer.toml | OK | read-only |

6개 전부 `name`/`description`/`developer_instructions`를 갖추고 파싱되며
`sandbox_mode`가 `mutationPolicy`와 일치한다. `config.toml`도 파싱된다.

### 검증으로 발견한 버그

`payloads/codex/AGENTS.block.md`가 구 이름을 참조하고 있었다.
`$feature-orchestrator`와 `planner`/`designer`/`developer` custom agent를 안내해
설치된 `AGENTS.md`가 존재하지 않는 이름을 가리켰다. 1.2에서 놓친 부분이며
수정하고 `validate`에 "모든 역할 이름이 블록에 등장하는가" 검사를 추가했다.

### trust 의미론 확정 (2026-09-20 추가 실측)

doctor 검사를 만들기 위해 trust 동작을 대조군으로 확정했다.

| 실험 | 프로젝트 `.codex/config.toml`의 `model_reasoning_effort = "low"` 반영 |
|---|---|
| untrusted 디렉터리 | ❌ 헤더 `high` |
| **trusted 저장소 루트** | ✅ 헤더 `low` |
| **trusted 경로의 하위 디렉터리** | ✅ 헤더 `low` — **상속된다** |
| 대조군 `-c model_reasoning_effort="low"` | ✅ 헤더 `low` (플래그 자체는 정상) |

두 가지가 확정됐다.

1. **`.codex/` 레이어 전체가 프로젝트 trust 뒤에 있다.** config와 agents 모두.
   앞 절의 `AGENTS: NONE`은 우리 파일 결함이 아니다
2. **trust는 하위 디렉터리로 상속된다.** 따라서 신뢰 판정은 정확한 경로 일치가 아니라
   조상 경로까지 거슬러 확인해야 한다

trust 정보는 `$CODEX_HOME/config.toml`(기본 `~/.codex/config.toml`)의
`[projects."<path>"]` 섹션에 `trust_level = "trusted"`로 기록된다.
`-c` 오버라이드로는 trust를 부여할 수 없다.

### Codex 최종 확인 (2026-09-24)

프로젝트 trust를 갖춘 상태에서 다시 확인했다. trust는 상위 경로에서 상속되므로
이미 신뢰된 경로 아래에 검증 프로젝트를 만들었다.

```
AGENTS: role-analyst, role-researcher, role-planner, role-designer,
        role-architect, role-qa, role-developer, role-reviewer, role-releaser
SKILLS: ..., role-orchestrator, ...
```

**custom agent 9개와 오케스트레이터 스킬이 전부 노출된다.** trust 가설이 확증됐다.
신뢰되지 않으면 `NONE`, 신뢰되면 9개 전부다.

배정도 실제로 동작한다. "기획부터 시작해줘" 요청에 오케스트레이터가 `role-planner`만
활성화하고 designer/developer를 **명시적 이유와 함께 제외**했다. 과잉 위임이 없었다.
`articulate.md`가 실제 내용으로 작성됐고 `app.js`는 건드리지 않았다.

### ⚠️ Codex 경로에서 발견한 계약 공백

**오케스트레이터가 채워진 핸드오프 봉투를 산출하지 않았다.** 출력에 `from: role-*`로
시작하는 블록이 3개 있었지만 전부 계약 안의 **템플릿 텍스트**였고, 플레이스홀더가
그대로였다. 실제로 채워진 봉투는 0개다.

오케스트레이터의 4개 출력 블록(`task_classification`, `active_roles`,
`role_handoff_blocks`, `final_summary`)은 정상 산출됐다. 봉투만 빠졌다.

Claude 경로에서는 R6이 5/5로 봉투를 산출한다. 따라서 Codex 경로 고유 문제이거나
오케스트레이터 고유 문제다. 1회 실행으로는 계약 결함인지 모델 변동인지 구분할 수 없다.

### 하네스 커버리지 공백

`tests/eval/run.js`는 `claude` CLI만 구동한다. **Codex 경로의 계약 준수는 자동
검증되지 않는다.** 위 발견도 수동 실행으로 찾았다. 하네스를 Codex로 확장하기 전까지
Codex 준수는 미검증으로 취급한다.

### 제품에 미치는 영향

Codex 타깃은 **소비자의 trust 승인에 하드 의존**한다. README에 이미 안내가 있지만,
`doctor`가 trust 상태를 확인하지 못한다. 설치는 성공했는데 역할이 안 보이는 상황에서
원인을 짚어주지 못하므로 개선 후보다.
