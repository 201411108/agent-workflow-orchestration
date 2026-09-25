---
expect_fail: [sources_exist]
---
```yaml
from: role-architect
work_id: none
status: complete
produced: [architecture_assessment]
facts_confirmed:
  - claim: 존재하지 않는 파일을 근거로 댔다
    source: src/does-not-exist.ts:12
assumptions: []
blocking_questions: []
needs: []
out_of_scope: []
```
