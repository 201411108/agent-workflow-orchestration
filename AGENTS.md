# Repository Codex Instructions

이 저장소에는 두 흐름이 공존한다. 워크플로 자체를 개발하는 흐름(레이어 1)과,
npm 설치 후 사용자 프로젝트에서 동작하는 흐름(레이어 2)이다. 섞지 않는다.
전체 설명과 경로별 레이어 표는 `CLAUDE.md`에 있으며 도구와 무관하게 동일하게 적용한다.

## 레이어 1 — 이 저장소를 개발할 때

### 세션 시작

1. `docs/development/ROADMAP.md`의 **현재 상태** — 지금 단계와 다음 작업
2. `docs/development/DEVLOG.md`의 최근 2~3개 항목 — git에 남지 않는 맥락.
   "미해결" 항목은 사용자 확인 대기 중이므로 기정사실로 취급하지 않는다
3. `docs/development/DESIGN_DECISIONS.md` — 확정된 전제. 다시 논쟁하지 않는다

### 작업 중

- ROADMAP의 `다음 작업` 하나만 수행한다. 여러 작업을 묶지 않는다.
- 완료 기준을 전부 만족했을 때만 체크박스를 채운다. 부분 완료는 미완료다.
- 설계 결정을 바꾸려면 `DESIGN_DECISIONS.md`를 먼저 갱신하고 로드맵과 구현을 조정한다.
- 레이어 2 파일(`skills/`, `adapters/`, `templates/`, `payloads/`, `bin/`,
  `agent-workflow.manifest.json`)을 고치면 `npm run check`를 반드시 통과시킨다.
- 기존 SSoT와 적용되는 저장소 문서를 역할 산출물보다 우선한다. 역할 계약을 바꿀 때는
  `agent-workflow.manifest.json`과 관련 문서의 일관성을 확인한다.

### 세션 종료

`DEVLOG.md` 항목 추가와 `ROADMAP.md` 현재 상태 갱신을 코드 변경과 같은 커밋에 포함한다.
중간에 멈출 때도 반드시 쓴다. 왜 멈췄는지가 다음 세션이 가장 알고 싶은 정보다.

## 레이어 2 — 제품 오케스트레이션

제품 역할 정의는 `skills/`, `payloads/`, `adapters/`, `agent-workflow.manifest.json`에
있으며 npm 설치 시 소비자 프로젝트에 배포된다.

**이 저장소는 자신에게 그것을 설치하지 않는다.** 2026-09-20에 루트의 사본
(`.codex/agents/*.toml`, `.agents/skills/feature-orchestrator/`)을 제거했다.
근거는 D10이고, 경위는 ROADMAP 1.0에 있다. 따라서 이 저장소에서 `$feature-orchestrator`나
planner/designer/developer custom agent를 호출하지 않는다. 제품 검증은 Phase 2에서
별도 미니 프로젝트로 수행한다.

이 저장소에서 `doctor --target codex`를 실행하면 Codex 역할 파일이 없다고 보고하는데,
정상이다. 이 저장소는 소비자 설치 대상이 아니다.

## 공통 저장소 작업 규칙

- `.agent-workflow/state.json`, `current-work.md` 같은 수동 상태 파일을 레이어 2의
  SSoT로 간주하지 않는다. 역할 인계, 최종 응답, 기존 SSoT 문서에 결정과 결과를 기록한다.
  (레이어 1의 상태는 `docs/development/`가 담당하며 이 규칙의 대상이 아니다.)
- 현재 체크아웃된 작업 브랜치를 그대로 사용한다. 작업을 이유로 새 브랜치를 만들거나
  다른 브랜치로 전환하지 않는다.
- 기존 미커밋 변경은 사용자 작업으로 취급해 보존한다. stash, reset, restore,
  checkout, 삭제 또는 덮어쓰기를 하지 않는다.
- 커밋할 때는 현재 작업 범위의 파일만 경로를 명시해 stage하고 기존 사용자 변경을
  포함하지 않는다.
- 검증은 실제 실행한 명령과 결과만 보고하며, 실행하지 못한 검사는 미검증으로
  명시한다.
