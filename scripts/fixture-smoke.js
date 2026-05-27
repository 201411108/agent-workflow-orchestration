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
  run(["init", "--target", target], rootDir);
  const feature = run(["feature", "--target", target, "--name", "user-onboarding"], rootDir);
  const rerun = run(["feature", "--target", target, "--name", "user-onboarding"], rootDir);
  run(["doctor", "--target", target], rootDir);

  assertExists(path.join(rootDir, targetDir, "skills", "role-orchestrator", roleFileName));
  assertExists(path.join(rootDir, targetDir, "specs", "README.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "_example-feature", "articulate.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "_example-feature", "designs.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "_example-feature", "specs.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "user-onboarding", "articulate.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "user-onboarding", "designs.md"));
  assertExists(path.join(rootDir, targetDir, "specs", "features", "user-onboarding", "specs.md"));
  assertNotExists(path.join(rootDir, targetDir, "specs", "features", "_example-feature.md"));
  assertExists(path.join(rootDir, ".agent-workflow", "state.json"));
  assertIncludes(feature.stdout, "3 written, 0 skipped");
  assertIncludes(rerun.stdout, "0 written, 3 skipped");

  run(["uninstall", "--target", target], rootDir);
}

const cursorFixture = makeFixture();
const codexFixture = makeFixture();
const claudeFixture = makeFixture();
const conflictFixture = makeFixture();

try {
  smokeTarget("cursor", cursorFixture, "SKILL.md", ".cursor");
  smokeTarget("codex", codexFixture, "AGENT.md", ".codex");
  smokeTarget("claude", claudeFixture, "CLAUDE.md", ".claude");

  run(["install", "--target", "cursor"], conflictFixture);
  const conflict = run(["install", "--target", "codex"], conflictFixture, true);
  assertIncludes(conflict.stderr || conflict.stdout, "Active target is cursor");
  run(["install", "--target", "codex", "--force"], conflictFixture);
  const statePath = path.join(conflictFixture, ".agent-workflow", "state.json");
  assertExists(statePath);
  assertJsonField(statePath, "activeTarget", "codex");
  assertJsonField(statePath, "installedTargets", ["codex"]);
  if (fs.existsSync(path.join(conflictFixture, ".cursor"))) {
    throw new Error("cursor target artifacts should be removed after force switching to codex");
  }
  assertExists(path.join(conflictFixture, ".codex", "skills", "role-orchestrator", "AGENT.md"));

  const invalidFeature = run(["feature", "--target", "codex", "--name", "../bad"], conflictFixture, true);
  assertIncludes(invalidFeature.stderr || invalidFeature.stdout, "Invalid feature name");

  console.log("Fixture smoke test passed.");
} finally {
  cleanup(cursorFixture);
  cleanup(codexFixture);
  cleanup(claudeFixture);
  cleanup(conflictFixture);
}
