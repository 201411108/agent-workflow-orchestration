const fs = require("fs");
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

function smokeTarget(target, rootDir, roleFileName, targetDir) {
  run(["install", "--target", target], rootDir);
  run(["init"], rootDir);
  const feature = run(["feature", "--name", "user-onboarding"], rootDir);
  const rerun = run(["feature", "--name", "user-onboarding"], rootDir);
  run(["doctor", "--target", target], rootDir);

  assertExists(path.join(rootDir, targetDir, "skills", "role-orchestrator", roleFileName));
  assertExists(path.join(rootDir, targetDir, "skills", "role-reviewer", roleFileName));
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
  assertNotExists(path.join(rootDir, targetDir, "specs"));
  assertExists(path.join(rootDir, ".agent-workflow", ".local", "state.json"));
  assertIncludes(feature.stdout, "3 written, 0 skipped");
  assertIncludes(rerun.stdout, "0 written, 3 skipped");

  run(["uninstall", "--target", target], rootDir);
  assertExists(path.join(rootDir, ".agent-workflow", "specs", "features", "user-onboarding", "specs.md"));
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

try {
  smokeTarget("cursor", cursorFixture, "SKILL.md", ".cursor");
  smokeTarget("codex", codexFixture, "AGENT.md", ".codex");
  smokeTarget("claude", claudeFixture, "CLAUDE.md", ".claude");

  run(["install", "--target", "cursor"], multiTargetFixture);
  run(["init"], multiTargetFixture);
  run(["feature", "--name", "shared-feature"], multiTargetFixture);
  const userTargetFile = path.join(multiTargetFixture, ".cursor", "user-rules.md");
  fs.writeFileSync(userTargetFile, "keep me\n");
  const roleSidecar = path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "notes.md");
  fs.writeFileSync(roleSidecar, "keep role notes\n");
  run(["install", "--target", "codex"], multiTargetFixture);
  run(["install", "--target", "cursor", "--force"], multiTargetFixture);
  const statePath = path.join(multiTargetFixture, ".agent-workflow", ".local", "state.json");
  assertExists(statePath);
  assertJsonField(statePath, "installedTargets", ["cursor", "codex"]);
  assertExists(userTargetFile);
  assertExists(roleSidecar);
  assertExists(path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(multiTargetFixture, ".codex", "skills", "role-orchestrator", "AGENT.md"));
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
    Object.keys(migratedState.targets.cursor.files).length !== 7
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
  assertIncludes(
    fs.readFileSync(path.join(customSpecsFixture, ".codex", "skills", "role-orchestrator", "AGENT.md"), "utf8"),
    "docs/agent-specs/features"
  );
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
}
