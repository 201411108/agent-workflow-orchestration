const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const cli = path.join(root, "bin", "cli.js");

function run(args, cwd, expectFailure = false, env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_WORKFLOW_NO_UPDATE_CHECK: "1",
      ...env,
    },
  });

  if (!expectFailure && result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`command failed: ${args.join(" ")}`);
  }

  if (expectFailure && result.status === 0) {
    throw new Error(`command unexpectedly succeeded: ${args.join(" ")}`);
  }

  return result;
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing expected path: ${filePath}`);
  }
}

function assertNotExists(filePath) {
  if (fs.existsSync(filePath)) {
    throw new Error(`unexpected path exists: ${filePath}`);
  }
}

function assertIncludes(text, token) {
  if (!text.includes(token)) {
    throw new Error(`expected output to include "${token}"`);
  }
}

function assertNotIncludes(text, token) {
  if (text.includes(token)) {
    throw new Error(`expected output not to include "${token}"`);
  }
}

function assertJsonField(filePath, field, expectedValue) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (JSON.stringify(parsed[field]) !== JSON.stringify(expectedValue)) {
    throw new Error(`expected ${field} in ${filePath} to equal ${JSON.stringify(expectedValue)}`);
  }
}

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-orchestration-"));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function smokeTarget(target, rootDir, orchestratorPath, rolePath) {
  run(["install", "--target", target], rootDir);
  run(["init"], rootDir);
  const feature = run(["feature", "--name", "user-onboarding"], rootDir);
  const rerun = run(["feature", "--name", "user-onboarding"], rootDir);
  run(["doctor", "--target", target], rootDir);

  assertExists(path.join(rootDir, ...orchestratorPath));
  assertExists(path.join(rootDir, ...rolePath));
  assertExists(path.join(rootDir, ".agent-workflow", "workflow.json"));
  assertJsonField(path.join(rootDir, ".agent-workflow", "workflow.json"), "schemaVersion", 2);
  assertJsonField(path.join(rootDir, ".agent-workflow", "workflow.json"), "specsRoot", ".agent-workflow/specs");
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "README.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "_example-feature", "articulate.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "_example-feature", "designs.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "_example-feature", "specs.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "user-onboarding", "articulate.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "user-onboarding", "designs.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "user-onboarding", "specs.md"));
  assertNotExists(path.join(rootDir, orchestratorPath[0], "specs"));
  assertExists(path.join(rootDir, ".agent-workflow", ".local", "state.json"));
  assertIncludes(feature.stdout, "3 written, 0 skipped");
  assertIncludes(rerun.stdout, "0 written, 3 skipped");

  run(["uninstall", "--target", target], rootDir);
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "user-onboarding", "specs.md"));
}

function smokeCodex(rootDir) {
  fs.writeFileSync(path.join(rootDir, "AGENTS.md"), "# Consumer guidance\n");
  fs.mkdirSync(path.join(rootDir, ".codex"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, ".codex", "config.toml"),
    "# keep this comment\nmodel = \"consumer-model\"\n\n[agents]\nmax_concurrent_threads_per_session = 5\n"
  );

  run(["install", "--target", "codex"], rootDir);
  run(["install", "--target", "codex"], rootDir);
  run(["update", "--target", "codex"], rootDir);
  const doctor = run(["doctor", "--target", "codex"], rootDir);

  assertExists(path.join(rootDir, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  for (const roleName of ["planner", "designer", "developer", "researcher", "architect", "reviewer", "analyst", "qa", "releaser"]) {
    assertExists(path.join(rootDir, ".codex", "agents", `role-${roleName}.toml`));
  }
  const plannerAgent = fs.readFileSync(
    path.join(rootDir, ".codex", "agents", "role-planner.toml"),
    "utf8"
  );
  assertIncludes(plannerAgent, 'name = "role-planner"');
  assertIncludes(plannerAgent, "developer_instructions =");
  const researcherAgent = fs.readFileSync(
    path.join(rootDir, ".codex", "agents", "role-researcher.toml"),
    "utf8"
  );
  assertIncludes(researcherAgent, 'sandbox_mode = "read-only"');
  // 1.5 도구 바인딩: Codex는 역할별 허용 목록이 없고 web_search만 제어 가능하다.
  // 1.8에서 외부 조사 경계가 analyst로 옮겨갔다. researcher는 저장소 내부만 본다.
  assertIncludes(researcherAgent, "web_search = false");
  const analystAgent = fs.readFileSync(
    path.join(rootDir, ".codex", "agents", "role-analyst.toml"),
    "utf8"
  );
  assertIncludes(analystAgent, "web_search = true");
  assertIncludes(analystAgent, 'sandbox_mode = "read-only"');
  const reviewerAgent = fs.readFileSync(
    path.join(rootDir, ".codex", "agents", "role-reviewer.toml"),
    "utf8"
  );
  assertIncludes(reviewerAgent, "web_search = false");
  assertIncludes(researcherAgent, "## Tools");
  assertNotIncludes(researcherAgent, "사용 가능:");
  const config = fs.readFileSync(path.join(rootDir, ".codex", "config.toml"), "utf8");
  assertIncludes(config, "# keep this comment");
  assertIncludes(config, 'model = "consumer-model"');
  assertIncludes(config, "max_concurrent_threads_per_session = 5");
  assertIncludes(config, "multi_agent = true");
  assertIncludes(config, "enabled = true");
  const guidance = fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8");
  assertIncludes(guidance, "# Consumer guidance");
  assertIncludes(guidance, "<!-- BEGIN agent-workflow-orchestration:codex -->");
  assertIncludes(doctor.stdout, "multi-agent settings present");

  // 프로젝트 trust: .codex/ 레이어 전체가 이 게이트 뒤에 있다.
  // 신뢰 정보를 읽을 수 없거나 신뢰되지 않으면 doctor가 경고해야 한다.
  const untrustedHome = path.join(rootDir, "codex-home-untrusted");
  fs.mkdirSync(untrustedHome, { recursive: true });
  fs.writeFileSync(path.join(untrustedHome, "config.toml"), '[projects."/somewhere/else"]\ntrust_level = "trusted"\n');
  const untrustedDoctor = run(["doctor", "--target", "codex"], rootDir, false, { CODEX_HOME: untrustedHome });
  assertIncludes(untrustedDoctor.stdout, "[warn] codex project trust");
  assertIncludes(untrustedDoctor.stdout, "not trusted");

  // 상위 경로가 신뢰되면 하위 디렉터리가 상속한다 (2026-09-20 실측).
  const trustedHome = path.join(rootDir, "codex-home-trusted");
  fs.mkdirSync(trustedHome, { recursive: true });
  fs.writeFileSync(
    path.join(trustedHome, "config.toml"),
    `[projects."${fs.realpathSync(rootDir)}"]\ntrust_level = "trusted"\n`
  );
  const trustedDoctor = run(["doctor", "--target", "codex"], rootDir, false, { CODEX_HOME: trustedHome });
  assertIncludes(trustedDoctor.stdout, "[ok] codex project trust");

  // 신뢰 정보를 아예 읽을 수 없는 경우도 경고한다.
  const missingHome = path.join(rootDir, "codex-home-missing");
  const missingDoctor = run(["doctor", "--target", "codex"], rootDir, false, { CODEX_HOME: missingHome });
  assertIncludes(missingDoctor.stdout, "[warn] codex project trust");
  assertIncludes(missingDoctor.stdout, "cannot read");

  fs.rmSync(untrustedHome, { recursive: true, force: true });
  fs.rmSync(trustedHome, { recursive: true, force: true });

  const state = JSON.parse(
    fs.readFileSync(path.join(rootDir, ".agent-workflow", ".local", "state.json"), "utf8")
  );
  if (
    state.schemaVersion !== 3 ||
    Object.keys(state.targets.codex.files).length !== 10 ||
    state.targets.codex.shared.config.addedKeys.length !== 2
  ) {
    throw new Error("Codex install state must record full-file and shared-key ownership");
  }

  run(["uninstall", "--target", "codex"], rootDir);
  assertNotExists(path.join(rootDir, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  assertNotExists(path.join(rootDir, ".codex", "agents", "role-planner.toml"));
  const remainingConfig = fs.readFileSync(path.join(rootDir, ".codex", "config.toml"), "utf8");
  assertIncludes(remainingConfig, "# keep this comment");
  assertIncludes(remainingConfig, 'model = "consumer-model"');
  assertIncludes(remainingConfig, "max_concurrent_threads_per_session = 5");
  assertNotIncludes(remainingConfig, "multi_agent = true");
  assertNotIncludes(remainingConfig, "enabled = true");
  const remainingGuidance = fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8");
  assertIncludes(remainingGuidance, "# Consumer guidance");
  assertNotIncludes(remainingGuidance, "<!-- BEGIN agent-workflow-orchestration:codex -->");
}

const cursorFixture = makeFixture();
const codexFixture = makeFixture();
const claudeFixture = makeFixture();
const multiTargetFixture = makeFixture();
const importFixture = makeFixture();
const conflictFixture = makeFixture();
const continuityFixture = makeFixture();
const safetyFixture = makeFixture();
const legacyFixture = makeFixture();
const customSpecsFixture = makeFixture();
const invalidAbsoluteFixture = makeFixture();
const invalidTraversalFixture = makeFixture();
const ignoreFixture = makeFixture();
const globalFixture = makeFixture();
const codexLegacyFixture = makeFixture();
const codexConflictFixture = makeFixture();
const codexDottedFixture = makeFixture();
const codexOwnedFileConflictFixture = makeFixture();
const claudeLegacyFixture = makeFixture();
const cursorLegacyKeyFixture = makeFixture();
const toolBindingFixture = makeFixture();

try {
  smokeTarget(
    "cursor",
    cursorFixture,
    [".cursor", "skills", "role-orchestrator", "SKILL.md"],
    [".cursor", "skills", "role-reviewer", "SKILL.md"]
  );
  smokeCodex(codexFixture);
  smokeTarget(
    "claude",
    claudeFixture,
    [".claude", "skills", "role-orchestrator", "SKILL.md"],
    [".claude", "agents", "role-reviewer.md"]
  );

  // 1.5 도구 바인딩: 서브에이전트 tools 허용 목록이 역할 선언에서 도출되어야 한다.
  run(["install", "--target", "claude"], toolBindingFixture);
  const researcherAgentFile = fs.readFileSync(
    path.join(toolBindingFixture, ".claude", "agents", "role-researcher.md"),
    "utf8"
  );
  // 1.8: 외부 조사는 analyst의 일이다. researcher는 저장소 내부만 본다.
  assertIncludes(researcherAgentFile, "tools: Read, Glob, Grep");
  assertNotIncludes(researcherAgentFile, "WebSearch");
  const analystAgentFile = fs.readFileSync(
    path.join(toolBindingFixture, ".claude", "agents", "role-analyst.md"),
    "utf8"
  );
  assertIncludes(analystAgentFile, "WebSearch");
  assertNotIncludes(analystAgentFile, "Write, Edit");
  const developerAgentFile = fs.readFileSync(
    path.join(toolBindingFixture, ".claude", "agents", "role-developer.md"),
    "utf8"
  );
  // 쓰기 도구는 file_edit를 선언한 역할에만 붙는다.
  assertIncludes(developerAgentFile, "Write, Edit");
  assertNotIncludes(researcherAgentFile, "Write, Edit");
  // 도구 가용성은 표로 알려주고 조건문을 남기지 않는다.
  assertIncludes(researcherAgentFile, "## Tools");
  assertNotIncludes(researcherAgentFile, "사용 가능:");
  assertNotIncludes(developerAgentFile, "사용 불가");

  run(["install", "--target", "cursor"], multiTargetFixture);
  run(["init"], multiTargetFixture);
  run(["feature", "--name", "shared-feature"], multiTargetFixture);
  const userTargetFile = path.join(multiTargetFixture, ".cursor", "user-rules.md");
  fs.writeFileSync(userTargetFile, "keep me\n");
  const roleSidecar = path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "notes.md");
  fs.writeFileSync(roleSidecar, "keep role notes\n");
  run(["install", "--target", "codex"], multiTargetFixture);
  run(["install", "--target", "cursor", "--force"], multiTargetFixture);
  run(["update"], multiTargetFixture);
  const statePath = path.join(multiTargetFixture, ".agent-workflow", ".local", "state.json");
  assertExists(statePath);
  assertJsonField(statePath, "installedTargets", ["cursor", "codex"]);
  assertExists(userTargetFile);
  assertExists(roleSidecar);
  assertExists(path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(multiTargetFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(multiTargetFixture, ".agent-workflow", "specs", "features", "shared-feature", "specs.md"));
  run(["uninstall", "--target", "cursor"], multiTargetFixture);
  assertExists(userTargetFile);
  assertExists(roleSidecar);
  assertNotExists(path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(multiTargetFixture, ".agent-workflow", "specs", "features", "shared-feature", "specs.md"));

  const legacySource = path.join(importFixture, ".cursor", "specs", "features", "legacy-feature");
  fs.mkdirSync(legacySource, { recursive: true });
  fs.writeFileSync(path.join(legacySource, "articulate.md"), "# Legacy intent\n");
  const dryImport = run(["import", "--from", "cursor", "--dry-run"], importFixture);
  assertIncludes(dryImport.stdout, "[dry-run] 1 file(s) to copy");
  run(["import", "--from", "cursor"], importFixture);
  assertExists(path.join(importFixture, ".cursor", "specs", "features", "legacy-feature", "articulate.md"));
  assertExists(path.join(importFixture, ".agent-workflow", "specs", "features", "legacy-feature", "articulate.md"));
  const importDoctor = run(["doctor", "--target", "cursor"], importFixture);
  assertIncludes(importDoctor.stdout, "legacy specs import: not needed");

  const conflictSource = path.join(conflictFixture, ".cursor", "specs", "features", "legacy-feature");
  const conflictDestination = path.join(conflictFixture, ".agent-workflow", "specs", "features", "legacy-feature");
  fs.mkdirSync(conflictSource, { recursive: true });
  fs.mkdirSync(conflictDestination, { recursive: true });
  fs.writeFileSync(path.join(conflictSource, "articulate.md"), "# Source\n");
  fs.writeFileSync(path.join(conflictDestination, "articulate.md"), "# Destination\n");
  const conflict = run(["import", "--from", "cursor"], conflictFixture, true);
  assertIncludes(conflict.stderr || conflict.stdout, "[conflict] features/legacy-feature/articulate.md");
  assertIncludes(fs.readFileSync(path.join(conflictDestination, "articulate.md"), "utf8"), "# Destination");

  run(["init"], continuityFixture);
  run(["feature", "--name", "continuity"], continuityFixture);
  run(["work", "--name", "continuity-mvp", "--feature", "continuity"], continuityFixture);
  assertExists(path.join(continuityFixture, ".agent-workflow", ".local", "work-items", "continuity-mvp", "work.json"));
  const initialItem = JSON.parse(
    fs.readFileSync(
      path.join(continuityFixture, ".agent-workflow", ".local", "work-items", "continuity-mvp", "work.json"),
      "utf8"
    )
  );
  if (initialItem.schemaVersion !== 2 || initialItem.nextRole !== "role-developer") {
    throw new Error("new work items must use schema v2 and default to role-developer");
  }
  const handoff = fs.readFileSync(
    path.join(continuityFixture, ".agent-workflow", ".local", "work-items", "continuity-mvp", "handoff.md"),
    "utf8"
  );
  assertNotIncludes(handoff, "{YYYY-MM-DD}");
  assertNotIncludes(
    fs.readFileSync(
      path.join(continuityFixture, ".agent-workflow", ".local", "work-items", "continuity-mvp", "verification.md"),
      "utf8"
    ),
    "{YYYY-MM-DD}"
  );
  run(
    [
      "advance",
      "--name",
      "continuity-mvp",
      "--phase",
      "implementation",
      "--role",
      "role-developer",
      "--next-role",
      "none",
    ],
    continuityFixture
  );
  const resume = run(["resume", "--name", "continuity-mvp"], continuityFixture);
  assertIncludes(resume.stdout, "Phase: implementation");
  assertIncludes(resume.stdout, "Next role: -");
  assertIncludes(resume.stdout, "Work file: .agent-workflow/.local/work-items/continuity-mvp/work.json");
  assertIncludes(resume.stdout, "Updated at:");

  const workflowPath = path.join(continuityFixture, ".agent-workflow", "workflow.json");
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  workflow.continuity.storage = "project";
  fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
  run(["advance", "--name", "continuity-mvp", "--phase", "review"], continuityFixture);
  run(["work", "--name", "continuity-mvp", "--feature", "continuity", "--force"], continuityFixture);
  assertExists(
    path.join(continuityFixture, ".agent-workflow", ".local", "work-items", "continuity-mvp", "work.json")
  );
  assertNotExists(path.join(continuityFixture, ".agent-workflow", "work-items", "continuity-mvp", "work.json"));
  const switchedResume = run(["resume", "--name", "continuity-mvp"], continuityFixture);
  assertIncludes(switchedResume.stdout, ".agent-workflow/.local/work-items/continuity-mvp/work.json");
  run(["work", "--name", "shared-work", "--feature", "continuity"], continuityFixture);
  assertExists(path.join(continuityFixture, ".agent-workflow", "work-items", "shared-work", "work.json"));

  const localItemPath = path.join(
    continuityFixture,
    ".agent-workflow",
    ".local",
    "work-items",
    "continuity-mvp",
    "work.json"
  );
  const localItem = JSON.parse(fs.readFileSync(localItemPath, "utf8"));
  localItem.pendingTasks = ["finish API tests"];
  localItem.blockers = ["waiting for fixture"];
  localItem.schemaVersion = 1;
  localItem.documents = {
    articulate: "specs/features/continuity/articulate.md",
  };
  fs.writeFileSync(localItemPath, `${JSON.stringify(localItem, null, 2)}\n`);
  const legacyResume = run(["resume", "--name", "continuity-mvp"], continuityFixture);
  assertIncludes(legacyResume.stdout, "finish API tests");
  assertIncludes(legacyResume.stdout, "waiting for fixture");
  assertIncludes(legacyResume.stdout, ".agent-workflow/specs/features/continuity/articulate.md");

  const duplicateDir = path.join(continuityFixture, ".agent-workflow", "work-items", "continuity-mvp");
  fs.mkdirSync(duplicateDir, { recursive: true });
  fs.copyFileSync(localItemPath, path.join(duplicateDir, "work.json"));
  const duplicate = run(["resume", "--name", "continuity-mvp"], continuityFixture, true);
  assertIncludes(duplicate.stderr || duplicate.stdout, ".agent-workflow/.local/work-items/continuity-mvp/work.json");
  assertIncludes(duplicate.stderr || duplicate.stdout, ".agent-workflow/work-items/continuity-mvp/work.json");

  const invalidFeature = run(["feature", "--name", "../bad"], continuityFixture, true);
  assertIncludes(invalidFeature.stderr || invalidFeature.stdout, "Invalid feature name");

  run(["install", "--target", "cursor"], safetyFixture);
  const safetyRole = path.join(safetyFixture, ".cursor", "skills", "role-developer", "SKILL.md");
  const untouchedRole = path.join(safetyFixture, ".cursor", "skills", "role-reviewer", "SKILL.md");
  const safetyState = path.join(safetyFixture, ".agent-workflow", ".local", "state.json");
  const untouchedBefore = fs.readFileSync(untouchedRole, "utf8");
  const stateBefore = fs.readFileSync(safetyState, "utf8");
  fs.appendFileSync(safetyRole, "\nuser edit\n");
  const updateConflict = run(["update"], safetyFixture, true);
  assertIncludes(updateConflict.stderr || updateConflict.stdout, "[conflict]");
  assertIncludes(fs.readFileSync(safetyRole, "utf8"), "user edit");
  if (fs.readFileSync(untouchedRole, "utf8") !== untouchedBefore || fs.readFileSync(safetyState, "utf8") !== stateBefore) {
    throw new Error("a conflicted update must not change any role file or installation state");
  }
  const safetySidecar = path.join(safetyFixture, ".cursor", "skills", "role-developer", "local-notes.md");
  fs.writeFileSync(safetySidecar, "preserve\n");
  run(["update", "--force"], safetyFixture);
  assertNotIncludes(fs.readFileSync(safetyRole, "utf8"), "user edit");
  assertExists(safetySidecar);
  fs.rmSync(untouchedRole);
  const stateBeforeMissingConflict = fs.readFileSync(safetyState, "utf8");
  const missingConflict = run(["update"], safetyFixture, true);
  assertIncludes(missingConflict.stderr || missingConflict.stdout, "file is missing");
  assertExists(safetyRole);
  if (fs.readFileSync(safetyState, "utf8") !== stateBeforeMissingConflict) {
    throw new Error("a missing-file conflict must leave installation state unchanged");
  }
  run(["update", "--force"], safetyFixture);
  assertExists(untouchedRole);
  fs.appendFileSync(safetyRole, "\nsecond user edit\n");
  run(["uninstall", "--target", "cursor"], safetyFixture, true);
  assertExists(safetyRole);
  assertExists(untouchedRole);
  run(["uninstall", "--target", "cursor", "--force"], safetyFixture);
  assertNotExists(safetyRole);
  assertExists(safetySidecar);

  run(["install", "--target", "cursor"], legacyFixture);
  const legacyStatePath = path.join(legacyFixture, ".agent-workflow", ".local", "state.json");
  fs.writeFileSync(
    legacyStatePath,
    `${JSON.stringify({ installedTargets: ["cursor"], packageVersion: "1.0.0" }, null, 2)}\n`
  );
  const legacyUpdate = run(["update"], legacyFixture, true);
  assertIncludes(legacyUpdate.stderr || legacyUpdate.stdout, "ownership hash is missing");
  run(["update", "--force"], legacyFixture);
  const migratedState = JSON.parse(fs.readFileSync(legacyStatePath, "utf8"));
  if (
    migratedState.targets.cursor.installedVersion !== "1.1.0" ||
    Object.keys(migratedState.targets.cursor.files).length !== 10
  ) {
    throw new Error("forced legacy update must record v1.1.0 ownership hashes");
  }
  run(["update"], legacyFixture);

  fs.mkdirSync(path.join(customSpecsFixture, ".agent-workflow"), { recursive: true });
  fs.writeFileSync(
    path.join(customSpecsFixture, ".agent-workflow", "workflow.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      specsRoot: "docs/agent-specs",
      continuity: { storage: "local" },
      migrations: [],
    }, null, 2)}\n`
  );
  run(["init"], customSpecsFixture);
  run(["feature", "--name", "custom-root"], customSpecsFixture);
  const customLegacySource = path.join(customSpecsFixture, ".cursor", "specs", "features", "imported");
  fs.mkdirSync(customLegacySource, { recursive: true });
  fs.writeFileSync(path.join(customLegacySource, "articulate.md"), "# Imported\n");
  run(["import", "--from", "cursor"], customSpecsFixture);
  assertExists(path.join(customSpecsFixture, "docs", "agent-specs", "features", "imported", "articulate.md"));
  run(["work", "--name", "custom-work", "--feature", "custom-root"], customSpecsFixture);
  const customResume = run(["resume", "--name", "custom-work"], customSpecsFixture);
  assertIncludes(customResume.stdout, "docs/agent-specs/features/custom-root/articulate.md");
  run(["install", "--target", "codex"], customSpecsFixture);
  assertExists(path.join(customSpecsFixture, "docs", "agent-specs", "features", "custom-root", "specs.md"));
  assertExists(path.join(customSpecsFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  const customDoctor = run(["doctor", "--target", "codex"], customSpecsFixture);
  assertIncludes(customDoctor.stdout, "docs/agent-specs: present");

  fs.mkdirSync(path.join(invalidAbsoluteFixture, ".agent-workflow"), { recursive: true });
  fs.writeFileSync(
    path.join(invalidAbsoluteFixture, ".agent-workflow", "workflow.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      specsRoot: path.join(invalidAbsoluteFixture, "specs"),
      continuity: { storage: "local" },
    })}\n`
  );
  assertIncludes(
    run(["init"], invalidAbsoluteFixture, true).stderr,
    "must be project-relative"
  );

  fs.mkdirSync(path.join(invalidTraversalFixture, ".agent-workflow"), { recursive: true });
  fs.writeFileSync(
    path.join(invalidTraversalFixture, ".agent-workflow", "workflow.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      specsRoot: "../outside",
      continuity: { storage: "local" },
    })}\n`
  );
  assertIncludes(run(["feature", "--name", "bad-root"], invalidTraversalFixture, true).stderr, "must stay inside");

  fs.mkdirSync(path.join(ignoreFixture, ".agent-workflow"), { recursive: true });
  fs.writeFileSync(path.join(ignoreFixture, ".agent-workflow", ".gitignore"), "custom-rule");
  run(["init"], ignoreFixture);
  if (fs.readFileSync(path.join(ignoreFixture, ".agent-workflow", ".gitignore"), "utf8") !== "custom-rule\n.local/\n") {
    throw new Error("ensureWorkflow must add .local/ on a new line");
  }

  run(["update", "--global", "--target", "cursor", "--force"], globalFixture, false, {
    HOME: globalFixture,
  });
  assertExists(path.join(globalFixture, ".cursor", "skills", "role-planner", "SKILL.md"));
  assertExists(path.join(globalFixture, ".agent-workflow", "state.json"));
  run(["uninstall", "--global", "--target", "cursor"], globalFixture, false, {
    HOME: globalFixture,
  });
  run(["install", "--global", "--target", "codex"], globalFixture, false, {
    HOME: globalFixture,
  });
  assertExists(path.join(globalFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(globalFixture, ".codex", "agents", "role-planner.toml"));
  assertExists(path.join(globalFixture, ".codex", "config.toml"));
  assertExists(path.join(globalFixture, ".codex", "AGENTS.md"));
  run(["uninstall", "--global", "--target", "codex"], globalFixture, false, {
    HOME: globalFixture,
  });
  assertNotExists(path.join(globalFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  assertNotExists(path.join(globalFixture, ".codex", "agents", "role-planner.toml"));
  assertNotExists(path.join(globalFixture, ".codex", "config.toml"));
  assertNotExists(path.join(globalFixture, ".codex", "AGENTS.md"));

  const legacyRoleDir = path.join(codexLegacyFixture, ".codex", "skills", "role-planner");
  fs.mkdirSync(legacyRoleDir, { recursive: true });
  const legacyRolePath = path.join(legacyRoleDir, "AGENT.md");
  const legacyContents = "# legacy package-owned Codex role\n";
  fs.writeFileSync(legacyRolePath, legacyContents);
  fs.writeFileSync(path.join(legacyRoleDir, "notes.md"), "keep this sidecar\n");
  fs.mkdirSync(path.join(codexLegacyFixture, ".agent-workflow", ".local"), { recursive: true });
  fs.writeFileSync(
    path.join(codexLegacyFixture, ".agent-workflow", ".local", "state.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      installedTargets: ["codex"],
      packageVersion: "1.0.0",
      targets: {
        codex: {
          installedVersion: "1.0.0",
          files: {
            "role-planner/AGENT.md": crypto.createHash("sha256").update(legacyContents).digest("hex"),
          },
        },
      },
    }, null, 2)}\n`
  );
  run(["update", "--target", "codex"], codexLegacyFixture);
  assertNotExists(legacyRolePath);
  assertExists(path.join(legacyRoleDir, "notes.md"));
  assertExists(path.join(codexLegacyFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));

  // 1.1.0 → 1.2.0 경로 이동: 구 claude 레이아웃을 합성해 마이그레이션을 검증한다.
  // 구 배포는 .claude/skills/<role>/CLAUDE.md 였고 state 키는 <role>/CLAUDE.md 였다.
  const legacyClaudeFiles = {};
  for (const roleName of ["role-orchestrator", "role-planner", "role-reviewer"]) {
    const dir = path.join(claudeLegacyFixture, ".claude", "skills", roleName);
    fs.mkdirSync(dir, { recursive: true });
    const contents = `# legacy claude role: ${roleName}\n`;
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), contents);
    legacyClaudeFiles[`${roleName}/CLAUDE.md`] = crypto.createHash("sha256").update(contents).digest("hex");
  }
  // 사용자가 수정한 구 파일은 해시가 어긋나므로 제거되면 안 된다.
  const editedLegacy = path.join(claudeLegacyFixture, ".claude", "skills", "role-reviewer", "CLAUDE.md");
  fs.writeFileSync(editedLegacy, "# legacy claude role: role-reviewer\nmy own note\n");
  const legacySidecar = path.join(claudeLegacyFixture, ".claude", "skills", "role-planner", "notes.md");
  fs.writeFileSync(legacySidecar, "keep this sidecar\n");
  fs.mkdirSync(path.join(claudeLegacyFixture, ".agent-workflow", ".local"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeLegacyFixture, ".agent-workflow", ".local", "state.json"),
    `${JSON.stringify({
      schemaVersion: 3,
      installedTargets: ["claude"],
      packageVersion: "1.1.0",
      targets: { claude: { installedVersion: "1.1.0", files: legacyClaudeFiles } },
    }, null, 2)}\n`
  );
  const claudeMigration = run(["update", "--target", "claude"], claudeLegacyFixture);
  // 새 레이아웃이 생성된다.
  assertExists(path.join(claudeLegacyFixture, ".claude", "agents", "role-planner.md"));
  assertExists(path.join(claudeLegacyFixture, ".claude", "skills", "role-orchestrator", "SKILL.md"));
  // 소유권이 증명된 구 파일은 남지 않는다.
  assertNotExists(path.join(claudeLegacyFixture, ".claude", "skills", "role-planner", "CLAUDE.md"));
  assertNotExists(path.join(claudeLegacyFixture, ".claude", "skills", "role-orchestrator", "CLAUDE.md"));
  // 수정된 구 파일은 보존되고 경로가 보고된다.
  assertExists(editedLegacy);
  assertIncludes(claudeMigration.stdout, "[kept]");
  assertIncludes(claudeMigration.stdout, "role-reviewer/CLAUDE.md");
  assertIncludes(claudeMigration.stdout, "[migrated] claude");
  assertExists(legacySidecar);

  // 경로는 그대로인데 state 키 형식만 바뀐 경우(cursor)도 소유권이 유지되어야 한다.
  // 폴백이 없으면 기존 설치본이 update를 전혀 하지 못한다.
  const cursorRoleDir = path.join(cursorLegacyKeyFixture, ".cursor", "skills", "role-planner");
  fs.mkdirSync(cursorRoleDir, { recursive: true });
  const cursorLegacyContents = "# legacy cursor role\n";
  fs.writeFileSync(path.join(cursorRoleDir, "SKILL.md"), cursorLegacyContents);
  fs.mkdirSync(path.join(cursorLegacyKeyFixture, ".agent-workflow", ".local"), { recursive: true });
  fs.writeFileSync(
    path.join(cursorLegacyKeyFixture, ".agent-workflow", ".local", "state.json"),
    `${JSON.stringify({
      schemaVersion: 3,
      installedTargets: ["cursor"],
      packageVersion: "1.1.0",
      targets: {
        cursor: {
          installedVersion: "1.1.0",
          files: {
            "role-planner/SKILL.md": crypto.createHash("sha256").update(cursorLegacyContents).digest("hex"),
          },
        },
      },
    }, null, 2)}\n`
  );
  run(["update", "--target", "cursor"], cursorLegacyKeyFixture);
  assertExists(path.join(cursorRoleDir, "SKILL.md"));
  const cursorLegacyState = JSON.parse(
    fs.readFileSync(path.join(cursorLegacyKeyFixture, ".agent-workflow", ".local", "state.json"), "utf8")
  );
  if (!cursorLegacyState.targets.cursor.files[".cursor/skills/role-planner/SKILL.md"]) {
    throw new Error("cursor state must be rewritten with project-relative keys after migration");
  }

  fs.mkdirSync(path.join(codexConflictFixture, ".codex"), { recursive: true });
  const conflictingConfig = "[features]\nmulti_agent = false\n";
  fs.writeFileSync(path.join(codexConflictFixture, ".codex", "config.toml"), conflictingConfig);
  const configConflict = run(["install", "--target", "codex"], codexConflictFixture, true);
  assertIncludes(configConflict.stderr || configConflict.stdout, "incompatible TOML value");
  assertNotExists(path.join(codexConflictFixture, ".agents", "skills", "role-orchestrator", "SKILL.md"));
  if (fs.readFileSync(path.join(codexConflictFixture, ".codex", "config.toml"), "utf8") !== conflictingConfig) {
    throw new Error("Codex shared-file preflight conflict must not change config.toml");
  }

  const inlineConfig = "features = { multi_agent = true }\n";
  fs.writeFileSync(path.join(codexConflictFixture, ".codex", "config.toml"), inlineConfig);
  const inlineConflict = run(["install", "--target", "codex"], codexConflictFixture, true);
  assertIncludes(inlineConflict.stderr || inlineConflict.stdout, "managed TOML namespace is already defined");
  if (fs.readFileSync(path.join(codexConflictFixture, ".codex", "config.toml"), "utf8") !== inlineConfig) {
    throw new Error("Codex inline-table conflict must preserve config.toml");
  }

  const insufficientThreadsConfig =
    "[features]\nmulti_agent = true\n\n[agents]\nenabled = true\nmax_concurrent_threads_per_session = 2\n";
  fs.writeFileSync(path.join(codexConflictFixture, ".codex", "config.toml"), insufficientThreadsConfig);
  const threadConflict = run(["install", "--target", "codex"], codexConflictFixture, true);
  assertIncludes(threadConflict.stderr || threadConflict.stdout, "incompatible TOML value");

  fs.writeFileSync(
    path.join(codexConflictFixture, ".codex", "config.toml"),
    "[features]\nmulti_agent = true\n"
  );
  run(["install", "--target", "codex"], codexConflictFixture);
  const managedGuidancePath = path.join(codexConflictFixture, "AGENTS.md");
  fs.writeFileSync(
    managedGuidancePath,
    fs.readFileSync(managedGuidancePath, "utf8").replace(
      "## Codex role orchestration",
      "## User-modified Codex role orchestration"
    )
  );
  const guidanceConflict = run(["uninstall", "--target", "codex", "--force"], codexConflictFixture, true);
  assertIncludes(guidanceConflict.stderr || guidanceConflict.stdout, "managed AGENTS.md block was modified");
  assertExists(path.join(codexConflictFixture, ".codex", "agents", "role-planner.toml"));

  fs.mkdirSync(path.join(codexDottedFixture, ".codex"), { recursive: true });
  fs.writeFileSync(
    path.join(codexDottedFixture, ".codex", "config.toml"),
    "features.multi_agent = true\r\nagents.enabled = true\r\n# preserve CRLF\r\n"
  );
  fs.writeFileSync(path.join(codexDottedFixture, "AGENTS.md"), "# Consumer guidance\r\n");
  run(["install", "--target", "codex"], codexDottedFixture);
  const dottedConfig = fs.readFileSync(path.join(codexDottedFixture, ".codex", "config.toml"), "utf8");
  assertIncludes(dottedConfig, "agents.max_concurrent_threads_per_session = 3\r\n");
  if (/(^|[^\r])\n/.test(dottedConfig)) {
    throw new Error("Codex config merge must preserve CRLF line endings");
  }
  const dottedGuidance = fs.readFileSync(path.join(codexDottedFixture, "AGENTS.md"), "utf8");
  if (/(^|[^\r])\n/.test(dottedGuidance)) {
    throw new Error("Codex AGENTS.md merge must preserve CRLF line endings");
  }
  run(["uninstall", "--target", "codex"], codexDottedFixture);
  const remainingDottedConfig = fs.readFileSync(
    path.join(codexDottedFixture, ".codex", "config.toml"),
    "utf8"
  );
  assertIncludes(remainingDottedConfig, "features.multi_agent = true\r\n");
  assertIncludes(remainingDottedConfig, "agents.enabled = true\r\n");
  assertNotIncludes(remainingDottedConfig, "max_concurrent_threads_per_session");

  fs.mkdirSync(path.join(codexOwnedFileConflictFixture, ".codex", "agents"), { recursive: true });
  const userPlanner = "# consumer-owned planner\n";
  fs.writeFileSync(path.join(codexOwnedFileConflictFixture, ".codex", "agents", "role-planner.toml"), userPlanner);
  const ownedFileConflict = run(["install", "--target", "codex"], codexOwnedFileConflictFixture, true);
  assertIncludes(ownedFileConflict.stderr || ownedFileConflict.stdout, "file exists without package ownership");
  if (
    fs.readFileSync(path.join(codexOwnedFileConflictFixture, ".codex", "agents", "role-planner.toml"), "utf8") !==
    userPlanner
  ) {
    throw new Error("Codex full-file conflict must preserve consumer content");
  }
  assertNotExists(path.join(codexOwnedFileConflictFixture, ".codex", "config.toml"));
  assertNotExists(path.join(codexOwnedFileConflictFixture, "AGENTS.md"));

  console.log("Fixture smoke test passed.");
} finally {
  cleanup(cursorFixture);
  cleanup(codexFixture);
  cleanup(claudeFixture);
  cleanup(multiTargetFixture);
  cleanup(importFixture);
  cleanup(conflictFixture);
  cleanup(continuityFixture);
  cleanup(safetyFixture);
  cleanup(legacyFixture);
  cleanup(customSpecsFixture);
  cleanup(invalidAbsoluteFixture);
  cleanup(invalidTraversalFixture);
  cleanup(ignoreFixture);
  cleanup(globalFixture);
  cleanup(codexLegacyFixture);
  cleanup(codexConflictFixture);
  cleanup(codexDottedFixture);
  cleanup(codexOwnedFileConflictFixture);
  cleanup(claudeLegacyFixture);
  cleanup(cursorLegacyKeyFixture);
  cleanup(toolBindingFixture);
}
