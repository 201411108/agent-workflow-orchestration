---
expect_pass_all: true
---
## 기획 Driver 결과

(생략)

```yaml
from: role-planner
work_id: none
status: complete
produced: [articulate_doc]
facts_confirmed:
  - claim: 패키지 이름이 선언되어 있다
    source: package.json
  - claim: 역할 계약이 7개다
    source: agent-workflow.manifest.json:1
assumptions:
  - claim: 사용자는 한국어 문서를 선호한다
    risk: low
blocking_questions: []
needs: []
out_of_scope:
  - bin/cli.js 는 읽기만 했다
```
