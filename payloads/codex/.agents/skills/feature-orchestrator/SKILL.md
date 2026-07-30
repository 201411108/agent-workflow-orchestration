---
name: feature-orchestrator
description: >-
  Classifies new features, complex changes, UI/UX work, requirements
  structuring, planning reviews, design reviews, and multi-part bug fixes or
  refactors, then delegates only the required work to the planner, designer,
  and developer project custom agents.
---

# Feature Orchestrator

Classify the request and use the smallest effective role chain. Skip this skill
and role delegation for simple questions, file reads, and trivial single-file
edits.

## Routing

| Request | Active roles |
|---|---|
| New feature with UI | `planner → designer → developer` |
| New feature without UI | `planner → developer` |
| UI/UX improvement | `designer → developer` |
| Bug fix or refactor | `developer` |
| Planning review | `planner` |
| Design review | `designer` |
| Complex request | Only the roles required by the request |
| Simple question, file read, or trivial edit | Delegation may be skipped |

Before delegation, tell the user the request classification and active roles in
one concise line. Wait for prerequisite roles to finish before starting a
dependent role.

Pass only a compressed handoff between roles:

```markdown
### Role handoff
- Goal:
- Verified facts:
- Decisions:
- Assumptions:
- Risks:
- Open questions:
- Unverified items:
- Input for the next role:
```

The main agent must review and integrate every role result, verify the actual
changes, and wait for all active roles before writing the final response. If a
selected custom agent cannot run, report `status: degraded`, the unavailable
role, the missing review, and the resulting limitation. Do not silently imitate
a successful delegation with ordinary reasoning.
