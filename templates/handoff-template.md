# Handoff: {work-id}

> Feature: `{feature-name}`
> Last updated: {YYYY-MM-DD}

## Envelope

각 역할이 반환할 때마다 아래 블록을 갱신한다. 형식은 7개 역할이 동일하며
기계 판정의 기준이 된다.

```yaml
from: <role-name>
work_id: {work-id}
status: complete | blocked
produced: []
facts_confirmed:
  - claim: <확인된 사실>
    source: <파일 경로>:<줄 번호>
assumptions:
  - claim: <검증되지 않은 전제>
    risk: high | medium | low
blocking_questions: []
needs: []
out_of_scope: []
```

규칙:

- 위 블록은 형식 예시다. `<...>` 안의 내용을 그대로 옮기지 않는다.
  각 목록은 비어 있어도 된다. 빈 목록은 정직한 답이고, 복사한 예시는 거짓이다.
- `source` 없는 주장은 `facts_confirmed`가 아니라 `assumptions`로 간다.
- `source`는 파일 경로(`src/x.js:42`), URL, 또는 검색 범위(`glob:**/package.json`)다.
  검색 범위는 "없음을 확인한 사실"의 출처로 쓴다.
  아직 만들지 않은 파일은 출처가 아니다.
- `needs`의 각 항목은 어휘 토큰 하나다. 설명을 붙이지 않는다.
- `out_of_scope`는 비울 수 있으나 생략할 수 없다.
- `blocking_questions` 또는 `needs`가 비어 있지 않으면 `status: blocked`다.
- `needs`의 어휘: `product-intent`, `ui-decision`, `code-evidence`,
  `external-evidence`, `contract-decision`, `implementation`, `verification`,
  `acceptance-criteria`.
- 다음 역할을 지명하지 않는다. 배정은 오케스트레이터가 한다.

## Confirmed Decisions

- [다음 역할이 다시 논의하지 않아야 할 결정]

## Next Agent Reading Order

1. `.agent-workflow/specs/features/{feature-name}/articulate.md`
2. `.agent-workflow/specs/features/{feature-name}/designs.md`
3. `.agent-workflow/specs/features/{feature-name}/specs.md`

## Notes

- [다음 역할이 보존해야 할 것, 또는 이어서 할 일]
