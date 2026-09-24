<!-- BEGIN agent-workflow-orchestration:codex -->
## Codex role orchestration

- Prefer the `role-orchestrator` skill for new features, complex requests, and UI/UX changes.
- It computes the assignment from each role's declarations. Do not follow a fixed role chain.
- Available custom agents: `role-analyst`, `role-researcher`, `role-planner`, `role-designer`, `role-architect`, `role-qa`, `role-developer`, `role-reviewer`, `role-releaser`.
- Pass compressed decisions, assumptions, risks, open questions, and unverified items between roles instead of the full conversation.
- Do not delegate simple questions, file reads, or trivial edits unnecessarily.
- The main agent must review, integrate, and verify subagent work.
- Wait for every active role to finish before writing the final result.
- Keep the current checked-out branch; orchestration is not a reason to create or switch branches.
- Preserve existing sources of truth, commit rules, and verification requirements.
<!-- END agent-workflow-orchestration:codex -->
