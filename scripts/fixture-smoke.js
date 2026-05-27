const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const cli = path.join(root, "bin", "cli.js");

function run(args, cwd, expectFailure = false) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
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

try {
  smokeTarget("cursor", cursorFixture, "SKILL.md", ".cursor");
  smokeTarget("codex", codexFixture, "AGENT.md", ".codex");
  smokeTarget("claude", claudeFixture, "CLAUDE.md", ".claude");

  run(["install", "--target", "cursor"], multiTargetFixture);
  run(["init"], multiTargetFixture);
  run(["feature", "--name", "shared-feature"], multiTargetFixture);
  const userTargetFile = path.join(multiTargetFixture, ".cursor", "user-rules.md");
  fs.writeFileSync(userTargetFile, "keep me\n");
  run(["install", "--target", "codex"], multiTargetFixture);
  run(["install", "--target", "cursor", "--force"], multiTargetFixture);
  const statePath = path.join(multiTargetFixture, ".agent-workflow", ".local", "state.json");
  assertExists(statePath);
  assertJsonField(statePath, "installedTargets", ["cursor", "codex"]);
  assertExists(userTargetFile);
  assertExists(path.join(multiTargetFixture, ".cursor", "skills", "role-orchestrator", "SKILL.md"));
  assertExists(path.join(multiTargetFixture, ".codex", "skills", "role-orchestrator", "AGENT.md"));
  assertExists(path.join(multiTargetFixture, ".agent-workflow", "specs", "features", "shared-feature", "specs.md"));
  run(["uninstall", "--target", "cursor"], multiTargetFixture);
  assertExists(userTargetFile);
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
  run(["advance", "--name", "continuity-mvp", "--phase", "implementation", "--role", "role-developer"], continuityFixture);
  const resume = run(["resume", "--name", "continuity-mvp"], continuityFixture);
  assertIncludes(resume.stdout, "Phase: implementation");
  assertIncludes(resume.stdout, "Next role: role-reviewer");

  const workflowPath = path.join(continuityFixture, ".agent-workflow", "workflow.json");
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  workflow.continuity.storage = "project";
  fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
  run(["work", "--name", "shared-work", "--feature", "continuity"], continuityFixture);
  assertExists(path.join(continuityFixture, ".agent-workflow", "work-items", "shared-work", "work.json"));

  const invalidFeature = run(["feature", "--name", "../bad"], continuityFixture, true);
  assertIncludes(invalidFeature.stderr || invalidFeature.stdout, "Invalid feature name");

  console.log("Fixture smoke test passed.");
} finally {
  cleanup(cursorFixture);
  cleanup(codexFixture);
  cleanup(claudeFixture);
  cleanup(multiTargetFixture);
  cleanup(importFixture);
  cleanup(conflictFixture);
  cleanup(continuityFixture);
}
