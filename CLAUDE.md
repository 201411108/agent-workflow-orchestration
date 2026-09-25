# Claude Code 작업 지침

이 저장소는 AI 에이전트용 역할 워크플로를 만들어 npm으로 배포하는 패키지다.
따라서 "워크플로를 개발하는 흐름"과 "배포된 사용자에게 제공되는 흐름"이 동시에
존재한다. **이 둘을 절대 섞지 않는다.**

## 두 레이어

| | 레이어 1 — 개발 | 레이어 2 — 제품 |
|---|---|---|
| 무엇 | 이 저장소에서 워크플로 자체를 만드는 흐름 | npm 설치 후 사용자 프로젝트에서 동작하는 것 |
| 에이전트 | Claude Code (너) | 소비자의 Cursor / Codex / Claude + 역할들 |
| 진입점 | `CLAUDE.md`, `AGENTS.md` | 설치 시 생성되는 `.claude/skills/`, `.agents/skills/`, `.cursor/skills/` |
| 상태 저장 | `docs/development/ROADMAP.md`, `DEVLOG.md` | `.agent-workflow/` |
| 변경 주기 | 매 세션 | 릴리스 단위 |

**레이어 1은 레이어 2를 사용하지 않는다.** 제품 역할(`role-planner` 등)을 이 저장소의
개발에 쓰지 않는다. 이유는 [DESIGN_DECISIONS.md D10](./docs/development/DESIGN_DECISIONS.md)에 있다.
요약하면, 자기가 서 있는 바닥을 리팩터링하게 되어 실패 원인을 분리할 수 없다.
제품 검증은 Phase 2에서 별도 미니 프로젝트로 한다.

2026-09-20에 루트의 레이어 2 사본(`.codex/agents/*.toml`,
`.agents/skills/feature-orchestrator/`)을 제거해 이 규칙을 관철했다.

### 경로별 레이어

| 경로 | 레이어 | 고칠 때 |
|---|---|---|
| `docs/development/` | 1 | 개발 계획·이력 |
| `CLAUDE.md`, `AGENTS.md` | 1 | 개발 진입점 |
| `skills/`, `adapters/`, `templates/`, `payloads/` | 2 | **제품 변경. 릴리스 영향 있음** |
| `agent-workflow.manifest.json`, `bin/`, `scripts/` | 2 | 동일 |
| 루트 `.codex/config.toml` | 1 (잔여) | 레이어 2 사본은 2026-09-20 제거됨(ROADMAP 1.0, A안). config만 보존 |

레이어 2 파일을 고칠 때는 `npm run check`를 반드시 통과시킨다.

**배포 경계는 `package.json`의 `files`가 정한다.** 레이어 1 파일이 거기 들어가면
소비자에게 개발 문서가 배포된다. `npm run check:package`가 양방향으로 검사하므로
`files`를 고칠 때는 그 검사를 통과시킨다.

## 세션 시작 절차

새 세션은 아래 순서로 읽고 시작한다. 이 순서를 지키면 맥락이 끊기지 않는다.

1. `docs/development/ROADMAP.md`의 **현재 상태** — 지금 어느 단계이고 다음 작업이 무엇인지
2. `docs/development/DEVLOG.md`의 **최근 2~3개 항목** — git에 남지 않는 맥락.
   왜 멈췄는지, 무엇을 시도하다 버렸는지, 사용자 확인을 기다리는 가정이 무엇인지
3. `docs/development/DESIGN_DECISIONS.md` — **확정된 전제. 다시 논쟁하지 않는다**
4. `git log --oneline -10`과 `git status` — 코드 상태
5. 필요하면 `npm run check`로 현재 저장소가 정상인지 확인

착수할 작업의 검증 방법과 임계값은 `docs/development/VERIFICATION.md`에서 확인한다.

DEVLOG의 "미해결" 항목은 **사용자 확인을 기다리는 것**이다. 기정사실로 취급하지 않는다.

## 작업 중 규칙

- ROADMAP의 `다음 작업` 하나만 수행한다. 여러 작업을 묶지 않는다.
- 완료 기준을 전부 만족했을 때만 체크박스를 채운다. 부분 완료는 미완료다.
- 설계 결정을 바꿔야 하면 `DESIGN_DECISIONS.md`를 먼저 고치고, 그 다음 로드맵과 구현을
  조정한다. 로드맵만 고치고 결정을 남겨두지 않는다.
- 검증은 실제로 실행한 명령과 결과만 기록한다. 실행하지 못한 검사는 미검증으로 남긴다.
- 기존 미커밋 변경은 사용자 작업으로 취급해 보존한다. stash, reset, restore, checkout으로
  덮어쓰지 않는다.
- 현재 체크아웃된 브랜치를 그대로 쓴다. 작업을 이유로 브랜치를 만들거나 전환하지 않는다.

## 세션 종료 절차

작업을 끝내거나 중간에 멈출 때 **반드시** 아래를 수행한다. 이것이 다음 세션의 입력이다.

1. `docs/development/DEVLOG.md`에 항목 추가 (형식은 그 문서 상단 참조)
2. `docs/development/ROADMAP.md`의 체크박스와 **현재 상태** 갱신
3. 1, 2를 코드 변경과 **같은 커밋**에 포함한다

중간에 멈추는 경우에도 DEVLOG를 쓴다. 오히려 그때가 더 중요하다 —
왜 멈췄는지가 다음 세션이 가장 알고 싶은 정보다.

## 참고

- 제품 구조와 사용법: `README.md`
- 단계별 검증 방법과 임계값: `docs/development/VERIFICATION.md`
- 기존 Codex 구성 이력: `docs/operations/CODEX_ORCHESTRATION.md`
- Codex용 동일 지침: `AGENTS.md`
