#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const semver = require("semver");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "skills");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
const ADAPTERS_DIR = path.join(ROOT_DIR, "adapters");
const MANIFEST_PATH = path.join(ROOT_DIR, "agent-workflow.manifest.json");
const STATE_DIRNAME = ".agent-workflow";
const WORKFLOW_FILENAME = "workflow.json";
const LOCAL_STATE_SUBDIR = ".local";
const STATE_FILENAME = "state.json";
const GLOBAL_STATE_SUBDIR = ".agent-workflow";
const CANONICAL_SPECS_SUBDIR = "specs";
const WORK_ITEMS_SUBDIR = "work-items";
const LEGACY_STATE_PATH = path.join(STATE_DIRNAME, STATE_FILENAME);
const LEGACY_SPECS_DIRS = {
  cursor: ".cursor/specs",
  codex: ".codex/specs",
  claude: ".claude/specs",
};
const SPECS_SUBDIRS = ["features", "changes", "decisions"];
const FEATURE_DOC_TEMPLATES = [
  ["articulate.md", "articulate-template.md"],
  ["designs.md", "designs-template.md"],
  ["specs.md", "development-spec-template.md"],
];
const TARGETS = ["cursor", "codex", "claude"];
const WORK_PHASES = [
  "articulate",
  "design",
  "architecture",
  "specification",
  "implementation",
  "review",
  "verification",
  "done",
];
const WORK_STATUSES = ["active", "blocked", "complete"];
const PHASE_ROLES = {
  articulate: ["role-planner", "role-developer"],
  design: ["role-designer", "role-developer"],
  architecture: ["role-architect", "role-developer"],
  specification: ["role-developer", "role-reviewer"],
  implementation: ["role-developer", "role-reviewer"],
  review: ["role-reviewer", null],
  verification: ["role-reviewer", null],
  done: [null, null],
};
const UPDATE_CHECK_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_FAILURE_TTL_MS = 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 800;

const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("help");
const command = showHelp ? "help" : args.find((arg) => !arg.startsWith("-")) || "install";
const force = args.includes("--force");
const global = args.includes("--global");
const dryRun = args.includes("--dry-run");
const target = getArgValue("--target") || "cursor";
const featureName = getArgValue("--name");
const linkedFeature = getArgValue("--feature");
const sourceTarget = getArgValue("--from");
const phase = getArgValue("--phase");
const selectedRole = getArgValue("--role");
const selectedNextRole = getArgValue("--next-role");
const selectedStatus = getArgValue("--status");
const cwd = process.cwd();

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function loadManifest() {
  return readJson(MANIFEST_PATH);
}

function loadAdapter(targetName) {
  if (!TARGETS.includes(targetName)) {
    console.error(`  Unknown target: ${targetName}`);
    console.error(`  Supported targets: ${TARGETS.join(", ")}`);
    process.exit(1);
  }
  return readJson(path.join(ADAPTERS_DIR, `${targetName}.json`));
}

function loadAllAdapters() {
  return TARGETS.map(loadAdapter);
}

function getProjectStatePath(projectRoot = cwd) {
  return path.join(projectRoot, STATE_DIRNAME, LOCAL_STATE_SUBDIR, STATE_FILENAME);
}

function getLegacyProjectStatePath(projectRoot = cwd) {
  return path.join(projectRoot, LEGACY_STATE_PATH);
}

function getWorkflowPath(projectRoot = cwd) {
  return path.join(projectRoot, STATE_DIRNAME, WORKFLOW_FILENAME);
}

function getDefaultWorkflow() {
  return {
    schemaVersion: 2,
    specsRoot: `${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`,
    continuity: {
      storage: "local",
    },
    migrations: [],
  };
}

function fail(message) {
  console.error(`  ${message}`);
  process.exit(1);
}

function resolveProjectRelativePath(relativePath, label, projectRoot = cwd) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    fail(`${label} must be a non-empty project-relative path.`);
  }
  if (path.isAbsolute(relativePath)) {
    fail(`${label} must be project-relative, not absolute: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(`${label} must stay inside the project: ${relativePath}`);
  }
  return resolvedPath;
}

function getProjectRelativePath(filePath, projectRoot = cwd) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function validateWorkflow(workflow, projectRoot = cwd) {
  if (!workflow || typeof workflow !== "object") {
    fail(`${STATE_DIRNAME}/${WORKFLOW_FILENAME} must contain a JSON object.`);
  }
  resolveProjectRelativePath(workflow.specsRoot, "workflow.json specsRoot", projectRoot);
  const storage = workflow.continuity && workflow.continuity.storage;
  if (storage !== "local" && storage !== "project") {
    fail('workflow.json continuity.storage must be either "local" or "project".');
  }
  return workflow;
}

function loadWorkflow(projectRoot = cwd) {
  const workflowPath = getWorkflowPath(projectRoot);
  if (!fs.existsSync(workflowPath)) {
    return validateWorkflow(getDefaultWorkflow(), projectRoot);
  }
  return validateWorkflow(readJson(workflowPath), projectRoot);
}

function getSpecsPath(workflow = loadWorkflow(), projectRoot = cwd) {
  return resolveProjectRelativePath(workflow.specsRoot, "workflow.json specsRoot", projectRoot);
}

function ensureWorkflow(projectRoot = cwd) {
  const workflowPath = getWorkflowPath(projectRoot);
  if (!fs.existsSync(workflowPath)) {
    writeJson(workflowPath, getDefaultWorkflow());
  }
  const ignorePath = path.join(projectRoot, STATE_DIRNAME, ".gitignore");
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, `${LOCAL_STATE_SUBDIR}/\n`);
  } else if (!readText(ignorePath).split(/\r?\n/).includes(`${LOCAL_STATE_SUBDIR}/`)) {
    const contents = readText(ignorePath);
    fs.appendFileSync(ignorePath, `${contents.endsWith("\n") ? "" : "\n"}${LOCAL_STATE_SUBDIR}/\n`);
  }
  return loadWorkflow(projectRoot);
}

function getGlobalStatePath() {
  return path.join(os.homedir(), GLOBAL_STATE_SUBDIR, STATE_FILENAME);
}

function getInstallStatePath(projectRoot = cwd) {
  return global ? getGlobalStatePath() : getProjectStatePath(projectRoot);
}

function emptyInstallState() {
  return {
    schemaVersion: 2,
    installedTargets: [],
    packageVersion: loadManifest().version,
    targets: {},
  };
}

function loadInstallState(projectRoot = cwd) {
  const statePath = getInstallStatePath(projectRoot);
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (!global && !fs.existsSync(statePath) && fs.existsSync(legacyPath)) {
    const legacy = readJson(legacyPath);
    return {
      schemaVersion: 1,
      installedTargets: legacy.installedTargets || (legacy.activeTarget ? [legacy.activeTarget] : []),
      packageVersion: legacy.packageVersion || loadManifest().version,
      legacyActiveTarget: legacy.activeTarget || null,
      targets: {},
    };
  }
  if (!fs.existsSync(statePath)) {
    return emptyInstallState();
  }
  const state = readJson(statePath);
  state.installedTargets = Array.isArray(state.installedTargets) ? state.installedTargets : [];
  state.targets = state.targets && typeof state.targets === "object" ? state.targets : {};
  return state;
}

function loadProjectState(projectRoot = cwd) {
  return loadInstallState(projectRoot);
}

function saveInstallState(state, projectRoot = cwd) {
  writeJson(getInstallStatePath(projectRoot), state);
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (!global && fs.existsSync(legacyPath)) {
    fs.rmSync(legacyPath, { force: true });
  }
}

function removeInstallState(projectRoot = cwd) {
  const statePath = getInstallStatePath(projectRoot);
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (!global && fs.existsSync(legacyPath)) {
    fs.rmSync(legacyPath, { force: true });
  }
}

function getTargetPaths(adapter, projectRoot = cwd) {
  if (global) {
    return {
      skillsDir: path.join(os.homedir(), adapter.globalPaths.skillsDir),
      specsDir: path.join(os.homedir(), adapter.globalPaths.specsDir),
    };
  }
  return {
    skillsDir: path.join(projectRoot, adapter.projectPaths.skillsDir),
    specsDir: getSpecsPath(loadWorkflow(projectRoot), projectRoot),
  };
}

function getScopeLabel(adapter) {
  if (global) {
    return `global (~/${adapter.globalPaths.skillsDir})`;
  }
  return `project (${cwd})`;
}

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!force && fs.existsSync(filePath)) {
    return false;
  }
  fs.writeFileSync(filePath, contents);
  return true;
}

function renderTemplate(templateName, replacements) {
  let contents = readText(path.join(TEMPLATES_DIR, templateName));
  for (const [token, value] of Object.entries(replacements)) {
    contents = contents.split(token).join(value);
  }
  return contents;
}

function validateFeatureName(name) {
  if (!name) {
    console.error("  Missing required option: --name {feature-slug}");
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(name)) {
    console.error(`  Invalid feature name: ${name}`);
    console.error("  Use letters, numbers, dots, underscores, or hyphens. Do not include path separators.");
    process.exit(1);
  }
  return name;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirIfEmpty(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function parseSkill(skillName) {
  const skillFile = path.join(SOURCE_DIR, skillName, "SKILL.md");
  const contents = readText(skillFile);
  const match = contents.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`invalid frontmatter in ${skillFile}`);
  }
  return {
    raw: contents,
    frontmatter: match[1],
    body: match[2],
  };
}

function renderTargetRoleFile(adapter, skillName, projectRoot = cwd) {
  const parsed = parseSkill(skillName);
  const workflow = global ? getDefaultWorkflow() : loadWorkflow(projectRoot);
  const specsRoot = workflow.specsRoot.split(path.sep).join("/");
  const replaceSpecsRoot = (contents) => contents.split(`${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`).join(specsRoot);
  if (adapter.target === "cursor") {
    return replaceSpecsRoot(parsed.raw);
  }

  const manifest = loadManifest();
  const role = manifest.skills.find((entry) => entry.name === skillName);
  const title = role ? role.name : skillName;
  const requiredOutputs = role ? role.requiredOutputs.join(", ") : "";
  const requiredTools = role ? role.requiredTools.join(", ") : "";
  const optionalTools = role ? role.optionalTools.join(", ") : "";
  const headerLabel = adapter.fileName === "CLAUDE.md" ? "Claude Role Contract" : "Codex Role Contract";

  return replaceSpecsRoot([
    `# ${headerLabel}: ${title}`,
    "",
    `Target: ${adapter.label}`,
    `Source: skills/${skillName}/SKILL.md`,
    "",
    "## Contract Summary",
    "",
    `- required_outputs: ${requiredOutputs}`,
    `- required_tools: ${requiredTools}`,
    `- optional_tools: ${optionalTools}`,
    "",
    "## Source Frontmatter",
    "",
    "```yaml",
    parsed.frontmatter,
    "```",
    "",
    parsed.body,
  ].join("\n"));
}

function getManagedRoleFiles(adapter, projectRoot = cwd) {
  const paths = getTargetPaths(adapter, projectRoot);
  return loadManifest().skills.map((role) => {
    const relativePath = path.join(role.name, adapter.fileName);
    return {
      roleName: role.name,
      relativePath,
      filePath: path.join(paths.skillsDir, relativePath),
      contents: renderTargetRoleFile(adapter, role.name, projectRoot),
    };
  });
}

function getTargetState(state, targetName) {
  return state.targets && state.targets[targetName] ? state.targets[targetName] : null;
}

function setTargetState(state, targetName, files, installedVersion = loadManifest().version) {
  const installed = new Set(state.installedTargets || []);
  installed.add(targetName);
  state.schemaVersion = 2;
  state.installedTargets = Array.from(installed);
  state.packageVersion = loadManifest().version;
  state.targets = state.targets || {};
  state.targets[targetName] = {
    installedVersion,
    files,
  };
}

function removeTargetState(state, targetName, projectRoot = cwd) {
  const installed = new Set(state.installedTargets || []);
  installed.delete(targetName);
  state.installedTargets = Array.from(installed);
  if (state.targets) {
    delete state.targets[targetName];
  }
  state.schemaVersion = 2;
  state.packageVersion = loadManifest().version;
  if (state.installedTargets.length === 0) {
    removeInstallState(projectRoot);
  } else {
    saveInstallState(state, projectRoot);
  }
}

function hashManagedFiles(managedFiles) {
  const hashes = {};
  for (const managedFile of managedFiles) {
    if (fs.existsSync(managedFile.filePath)) {
      hashes[managedFile.relativePath] = sha256(fs.readFileSync(managedFile.filePath));
    }
  }
  return hashes;
}

function findManagedFileConflicts(managedFiles, targetState) {
  const recordedFiles = targetState && targetState.files ? targetState.files : {};
  const conflicts = [];
  for (const managedFile of managedFiles) {
    const recordedHash = recordedFiles[managedFile.relativePath];
    const exists = fs.existsSync(managedFile.filePath);
    const currentHash = exists ? sha256(fs.readFileSync(managedFile.filePath)) : null;
    if (!recordedHash && !exists) {
      continue;
    }
    if (!recordedHash || currentHash !== recordedHash) {
      conflicts.push({
        filePath: managedFile.filePath,
        reason: !recordedHash ? "ownership hash is missing" : exists ? "file was modified" : "file is missing",
      });
    }
  }
  return conflicts;
}

function printConflicts(conflicts, action) {
  for (const conflict of conflicts) {
    console.error(`  [conflict] ${path.relative(cwd, conflict.filePath)} (${conflict.reason})`);
  }
  console.error(`\n  ${action} aborted without changes. Re-run with --force to replace package-owned role files.\n`);
}

function writeManagedFilesAtomically(managedFiles) {
  const prepared = [];
  try {
    for (const managedFile of managedFiles) {
      fs.mkdirSync(path.dirname(managedFile.filePath), { recursive: true });
      const temporaryPath = `${managedFile.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temporaryPath, managedFile.contents);
      prepared.push({ ...managedFile, temporaryPath });
    }
    for (const managedFile of prepared) {
      fs.renameSync(managedFile.temporaryPath, managedFile.filePath);
    }
  } catch (error) {
    for (const managedFile of prepared) {
      if (fs.existsSync(managedFile.temporaryPath)) {
        fs.rmSync(managedFile.temporaryPath, { force: true });
      }
    }
    throw error;
  }
}

function install() {
  const adapter = loadAdapter(target);
  if (!global) {
    ensureWorkflow();
  }
  const paths = getTargetPaths(adapter);
  const managedFiles = getManagedRoleFiles(adapter);
  const state = loadInstallState();
  const existingTargetState = getTargetState(state, adapter.target);

  console.log(`\n  ${adapter.label} Installer\n`);
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log(`  Target: ${adapter.target}\n`);

  let installed = 0;
  let skipped = 0;
  const pending = [];

  for (const managedFile of managedFiles) {
    if (fs.existsSync(managedFile.filePath) && !force) {
      console.log(`  [skip] ${managedFile.roleName} (${adapter.fileName} already exists)`);
      skipped++;
      continue;
    }
    pending.push(managedFile);
  }

  writeManagedFilesAtomically(pending);
  for (const managedFile of pending) {
    console.log(`  [installed] ${managedFile.roleName}`);
    installed++;
  }

  const files = existingTargetState && existingTargetState.files ? { ...existingTargetState.files } : {};
  for (const managedFile of pending) {
    files[managedFile.relativePath] = sha256(managedFile.contents);
  }
  const wasRecorded = (state.installedTargets || []).includes(adapter.target);
  const installedVersion =
    force || !wasRecorded
      ? loadManifest().version
      : (existingTargetState && existingTargetState.installedVersion) || state.packageVersion;
  setTargetState(state, adapter.target, files, installedVersion);
  saveInstallState(state);

  console.log(`\n  Done: ${installed} installed, ${skipped} skipped.`);
  console.log(`  Role files were written to ${paths.skillsDir}\n`);
}

function update() {
  if (global && !args.includes("--target")) {
    fail("update --global requires --target <target>.");
  }
  if (!global) {
    ensureWorkflow();
  }
  const state = loadInstallState();
  const targetsToUpdate = args.includes("--target") ? [target] : state.installedTargets || [];
  if (targetsToUpdate.length === 0) {
    fail("No installed targets were recorded. Run install first.");
  }

  const batches = [];
  const conflicts = [];
  for (const targetName of targetsToUpdate) {
    if (!TARGETS.includes(targetName)) {
      fail(`Unknown target in installation state: ${targetName}`);
    }
    if (!(state.installedTargets || []).includes(targetName) && !force) {
      fail(`Target is not recorded as installed: ${targetName}`);
    }
    const adapter = loadAdapter(targetName);
    const managedFiles = getManagedRoleFiles(adapter);
    if (!force) {
      conflicts.push(...findManagedFileConflicts(managedFiles, getTargetState(state, targetName)));
    }
    batches.push({ adapter, managedFiles });
  }

  if (conflicts.length > 0) {
    printConflicts(conflicts, "Update");
    process.exit(1);
  }

  console.log("\n  Agent Workflow Update\n");
  writeManagedFilesAtomically(batches.flatMap((batch) => batch.managedFiles));
  for (const batch of batches) {
    setTargetState(state, batch.adapter.target, hashManagedFiles(batch.managedFiles));
    console.log(`  [updated] ${batch.adapter.target}: ${batch.managedFiles.length} role file(s)`);
  }
  saveInstallState(state);
  console.log(`\n  Done: ${batches.length} target(s) updated to ${loadManifest().version}.\n`);
}

function uninstall() {
  const adapter = loadAdapter(target);
  const paths = getTargetPaths(adapter);
  const managedFiles = getManagedRoleFiles(adapter);
  const state = loadInstallState();
  const hasManagedFiles = managedFiles.some((managedFile) => fs.existsSync(managedFile.filePath));
  const targetState = getTargetState(state, adapter.target);
  const conflicts = force || (!targetState && !hasManagedFiles)
    ? []
    : findManagedFileConflicts(managedFiles, targetState);

  console.log(`\n  ${adapter.label} Uninstaller\n`);
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log(`  Target: ${adapter.target}\n`);

  if (conflicts.length > 0) {
    printConflicts(conflicts, "Uninstall");
    process.exit(1);
  }

  let removed = 0;
  for (const managedFile of managedFiles) {
    if (fs.existsSync(managedFile.filePath)) {
      fs.rmSync(managedFile.filePath, { force: true });
      removeDirIfEmpty(path.dirname(managedFile.filePath));
      console.log(`  [removed] ${managedFile.roleName}`);
      removed++;
    } else {
      console.log(`  [not found] ${managedFile.roleName}`);
    }
  }

  removeDirIfEmpty(paths.skillsDir);
  removeTargetState(state, adapter.target);

  console.log(`\n  Done: ${removed} roles removed.\n`);
}

function list() {
  const manifest = loadManifest();
  const adapters = target && args.includes("--target") ? [loadAdapter(target)] : loadAllAdapters();

  console.log("\n  Agent Workflow Targets\n");
  if (!global) {
    const state = loadProjectState();
    const workflow = loadWorkflow();
    const workItemCount = getWorkItemRoots()
      .map((workItemsDir) =>
        fs.existsSync(workItemsDir)
          ? fs.readdirSync(workItemsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
          : 0
      )
      .reduce((total, count) => total + count, 0);
    console.log(`  [state] installed=${(state.installedTargets || []).join(",") || "-"}`);
    console.log(`  [workflow] specs=${workflow.specsRoot} continuity=${workflow.continuity.storage} work-items=${workItemCount}`);
    console.log();
  }

  for (const adapter of adapters) {
    const projectPaths = getTargetPaths(adapter);
    console.log(`  [${adapter.target}] ${adapter.label}`);
    console.log(`    skills: ${projectPaths.skillsDir}`);
    console.log(`    specs: ${projectPaths.specsDir}`);
    for (const role of manifest.skills) {
      const roleFile = path.join(projectPaths.skillsDir, role.name, adapter.fileName);
      const status = fs.existsSync(roleFile) ? "installed" : "-";
      console.log(`    ${role.name} (${status})`);
    }
    console.log();
  }
}

function renderSpecsReadme(adapter, workflow = loadWorkflow()) {
  return renderTemplate("specs-readme.md", {
    "{{SPECS_PATH}}": workflow.specsRoot,
    "{{TARGET_LABEL}}": adapter.label,
    "{{TARGET_NAME}}": adapter.target,
  });
}

function ensureSpecsSubdirs(paths) {
  fs.mkdirSync(paths.specsDir, { recursive: true });
  for (const sub of SPECS_SUBDIRS) {
    const subDir = path.join(paths.specsDir, sub);
    fs.mkdirSync(subDir, { recursive: true });
    writeFileIfChanged(path.join(subDir, ".gitkeep"), "");
  }
}

function writeFeatureDocs(paths, name) {
  const safeName = validateFeatureName(name);
  const featureDir = path.join(paths.specsDir, "features", safeName);
  let created = 0;
  let skipped = 0;

  for (const [fileName, templateName] of FEATURE_DOC_TEMPLATES) {
    const didWrite = writeFileIfChanged(
      path.join(featureDir, fileName),
      renderTemplate(templateName, {
        "{feature-name}": safeName,
      })
    );
    if (didWrite) {
      created++;
    } else {
      skipped++;
    }
  }

  return { featureDir, created, skipped };
}

function init() {
  const adapter = loadAdapter(target);

  if (global) {
    console.error("  init does not support --global. Use a project directory.");
    process.exit(1);
  }

  const workflow = ensureWorkflow();
  const paths = getTargetPaths(adapter);
  if (args.includes("--target")) {
    console.log("  [deprecated] --target is ignored by init; specs are shared across all targets.");
  }

  console.log("\n  Shared Workflow Specs Init\n");
  console.log(`  Project: ${cwd}`);
  console.log(`  Specs: ${path.relative(cwd, paths.specsDir)}\n`);

  if (fs.existsSync(paths.specsDir) && !force) {
    console.log(`  [skip] ${workflow.specsRoot} already exists.`);
    console.log("  Tip: Use --force to reinitialize.\n");
    return;
  }

  ensureSpecsSubdirs(paths);

  writeFileIfChanged(path.join(paths.specsDir, "README.md"), renderSpecsReadme(adapter, workflow));
  writeFeatureDocs(paths, "_example-feature");
  writeFileIfChanged(
    path.join(paths.specsDir, "changes", "_example-change.md"),
    readText(path.join(TEMPLATES_DIR, "change-template.md"))
  );
  writeFileIfChanged(
    path.join(paths.specsDir, "decisions", "000-example-decision.md"),
    readText(path.join(TEMPLATES_DIR, "decision-template.md"))
  );

  console.log(`  [created] ${path.relative(cwd, paths.specsDir)}`);
  console.log("  [created] example docs");
  console.log("\n  Done. Shared workflow specs are ready.\n");
}

function feature() {
  const adapter = loadAdapter(target);
  const safeName = validateFeatureName(featureName);

  if (global) {
    console.error("  feature does not support --global. Use a project directory.");
    process.exit(1);
  }

  const workflow = ensureWorkflow();
  const paths = getTargetPaths(adapter);
  if (args.includes("--target")) {
    console.log("  [deprecated] --target is ignored by feature; specs are shared across all targets.");
  }

  console.log("\n  Shared Workflow Feature Scaffold\n");
  console.log(`  Project: ${cwd}`);
  console.log(`  Feature: ${safeName}\n`);

  ensureSpecsSubdirs(paths);
  if (!fs.existsSync(path.join(paths.specsDir, "README.md"))) {
    writeFileIfChanged(path.join(paths.specsDir, "README.md"), renderSpecsReadme(adapter, workflow));
  }

  const result = writeFeatureDocs(paths, safeName);

  console.log(`  [created] ${path.relative(cwd, result.featureDir)}`);
  console.log(`  Done: ${result.created} written, ${result.skipped} skipped.`);
  if (result.skipped > 0 && !force) {
    console.log("  Tip: Use --force to overwrite existing feature docs.");
  }
  console.log();
}

function getWorkItemsPath(workflow = loadWorkflow(), projectRoot = cwd) {
  const storage = workflow.continuity && workflow.continuity.storage === "project" ? "project" : "local";
  return storage === "project"
    ? path.join(projectRoot, STATE_DIRNAME, WORK_ITEMS_SUBDIR)
    : path.join(projectRoot, STATE_DIRNAME, LOCAL_STATE_SUBDIR, WORK_ITEMS_SUBDIR);
}

function getWorkItemPath(name, projectRoot = cwd) {
  const safeName = validateFeatureName(name);
  return path.join(getWorkItemsPath(loadWorkflow(projectRoot), projectRoot), safeName);
}

function getWorkItemRoots(projectRoot = cwd) {
  return [
    path.join(projectRoot, STATE_DIRNAME, LOCAL_STATE_SUBDIR, WORK_ITEMS_SUBDIR),
    path.join(projectRoot, STATE_DIRNAME, WORK_ITEMS_SUBDIR),
  ];
}

function findWorkItem(name, projectRoot = cwd) {
  const safeName = validateFeatureName(name);
  const matches = getWorkItemRoots(projectRoot)
    .map((rootDir) => path.join(rootDir, safeName))
    .filter((itemDir) => fs.existsSync(path.join(itemDir, "work.json")));
  if (matches.length > 1) {
    console.error(`  Work item id is ambiguous: ${safeName}`);
    for (const itemDir of matches) {
      console.error(`  [conflict] ${path.relative(projectRoot, path.join(itemDir, "work.json"))}`);
    }
    console.error("\n  Keep only one copy before continuing.\n");
    process.exit(1);
  }
  return matches.length === 1 ? matches[0] : null;
}

function collectFiles(rootDir, currentDir = rootDir, files = []) {
  if (!fs.existsSync(currentDir)) {
    return files;
  }
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const filePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(rootDir, filePath, files);
    } else {
      files.push(path.relative(rootDir, filePath));
    }
  }
  return files.sort();
}

function importLegacySpecs() {
  if (global) {
    console.error("  import does not support --global. Use a project directory.");
    process.exit(1);
  }
  if (!sourceTarget || !TARGETS.includes(sourceTarget)) {
    console.error(`  Missing or invalid --from target. Supported targets: ${TARGETS.join(", ")}`);
    process.exit(1);
  }

  const sourceDir = path.join(cwd, LEGACY_SPECS_DIRS[sourceTarget]);
  const workflow = loadWorkflow();
  const destinationDir = getSpecsPath(workflow);
  if (!fs.existsSync(sourceDir)) {
    console.error(`  Legacy specs source not found: ${path.relative(cwd, sourceDir)}`);
    process.exit(1);
  }

  const files = collectFiles(sourceDir);
  const conflicts = [];
  const pending = [];
  const skipped = [];
  for (const relativePath of files) {
    const sourceFile = path.join(sourceDir, relativePath);
    const destinationFile = path.join(destinationDir, relativePath);
    if (!fs.existsSync(destinationFile)) {
      pending.push(relativePath);
    } else if (readText(sourceFile) === readText(destinationFile)) {
      skipped.push(relativePath);
    } else {
      conflicts.push(relativePath);
    }
  }

  console.log("\n  Legacy Specs Import\n");
  console.log(`  Source: ${path.relative(cwd, sourceDir)}`);
  console.log(`  Destination: ${path.relative(cwd, destinationDir)}\n`);

  if (conflicts.length > 0) {
    for (const relativePath of conflicts) {
      console.error(`  [conflict] ${relativePath}`);
    }
    console.error("\n  Import aborted. Existing and legacy documents were left unchanged.\n");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`  [dry-run] ${pending.length} file(s) to copy, ${skipped.length} unchanged file(s) to skip.\n`);
    return;
  }

  ensureWorkflow();
  for (const relativePath of pending) {
    const sourceFile = path.join(sourceDir, relativePath);
    const destinationFile = path.join(destinationDir, relativePath);
    fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
    fs.copyFileSync(sourceFile, destinationFile);
  }

  const migrations = Array.isArray(workflow.migrations) ? workflow.migrations : [];
  migrations.push({
    source: LEGACY_SPECS_DIRS[sourceTarget],
    destination: workflow.specsRoot,
    importedAt: new Date().toISOString(),
  });
  workflow.migrations = migrations;
  writeJson(getWorkflowPath(), workflow);
  console.log(`  Done: ${pending.length} copied, ${skipped.length} skipped. Legacy source preserved.\n`);
}

function loadWorkItem(name) {
  const itemDir = findWorkItem(name);
  if (!itemDir) {
    console.error(`  Work item not found: ${name}`);
    process.exit(1);
  }
  const itemPath = path.join(itemDir, "work.json");
  return { itemDir, itemPath, item: readJson(itemPath) };
}

function normalizeNextRole(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (value === "none") {
    return null;
  }
  if (!loadManifest().skills.some((entry) => entry.name === value)) {
    fail(`Unknown next role: ${value}`);
  }
  return value;
}

function resolveWorkDocumentPath(item, documentPath) {
  if (item.schemaVersion === 1) {
    return resolveProjectRelativePath(path.join(STATE_DIRNAME, documentPath), "schema v1 work document");
  }
  return resolveProjectRelativePath(documentPath, "work document");
}

function work() {
  if (global) {
    console.error("  work does not support --global. Use a project directory.");
    process.exit(1);
  }
  const safeName = validateFeatureName(featureName);
  const safeFeature = validateFeatureName(linkedFeature);
  const workflow = ensureWorkflow();
  const specsDir = getSpecsPath(workflow);
  const featureDir = path.join(specsDir, "features", safeFeature);
  if (!fs.existsSync(featureDir)) {
    console.error(`  Feature not found in shared specs: ${safeFeature}`);
    console.error(`  Run feature --name ${safeFeature} first.`);
    process.exit(1);
  }

  const existingItemDir = findWorkItem(safeName);
  const itemDir = existingItemDir || getWorkItemPath(safeName);
  const workPath = path.join(itemDir, "work.json");
  if (fs.existsSync(workPath) && !force) {
    console.error(`  Work item already exists: ${safeName}. Use --force to overwrite.`);
    process.exit(1);
  }

  const documents = {
    articulate: getProjectRelativePath(path.join(featureDir, "articulate.md")),
    designs: getProjectRelativePath(path.join(featureDir, "designs.md")),
    specs: getProjectRelativePath(path.join(featureDir, "specs.md")),
  };
  const now = new Date();
  const creationDate = now.toISOString().slice(0, 10);
  const item = {
    schemaVersion: 2,
    id: safeName,
    feature: safeFeature,
    phase: "articulate",
    status: "active",
    activeRole: "role-planner",
    nextRole: normalizeNextRole(selectedNextRole, "role-developer"),
    pendingTasks: [],
    blockers: [],
    documents,
    updatedAt: now.toISOString(),
  };

  fs.mkdirSync(itemDir, { recursive: true });
  writeJson(workPath, item);
  writeFileIfChanged(
    path.join(itemDir, "handoff.md"),
    renderTemplate("handoff-template.md", {
      "{work-id}": safeName,
      "{feature-name}": safeFeature,
      "{YYYY-MM-DD}": creationDate,
    })
  );
  writeFileIfChanged(
    path.join(itemDir, "verification.md"),
    renderTemplate("verification-template.md", {
      "{work-id}": safeName,
      "{feature-name}": safeFeature,
      "{YYYY-MM-DD}": creationDate,
    })
  );

  console.log("\n  Workflow Work Item\n");
  console.log(`  [created] ${path.relative(cwd, itemDir)}`);
  console.log("  Phase: articulate");
  console.log(`  Next role: ${item.nextRole || "-"}\n`);
}

function advance() {
  const safeName = validateFeatureName(featureName);
  if (!phase || !WORK_PHASES.includes(phase)) {
    console.error(`  Missing or invalid --phase. Supported phases: ${WORK_PHASES.join(", ")}`);
    process.exit(1);
  }
  if (selectedStatus && !WORK_STATUSES.includes(selectedStatus)) {
    console.error(`  Invalid --status. Supported statuses: ${WORK_STATUSES.join(", ")}`);
    process.exit(1);
  }
  if (selectedRole && !loadManifest().skills.some((entry) => entry.name === selectedRole)) {
    console.error(`  Unknown role: ${selectedRole}`);
    process.exit(1);
  }
  normalizeNextRole(selectedNextRole, null);

  const { itemPath, item } = loadWorkItem(safeName);
  const defaultRoles = PHASE_ROLES[phase];
  item.phase = phase;
  item.status = selectedStatus || (phase === "done" ? "complete" : "active");
  item.activeRole = selectedRole || defaultRoles[0];
  item.nextRole = normalizeNextRole(selectedNextRole, defaultRoles[1]);
  item.updatedAt = new Date().toISOString();
  writeJson(itemPath, item);

  console.log("\n  Workflow Advance\n");
  console.log(`  Work item: ${safeName}`);
  console.log(`  Phase: ${item.phase}`);
  console.log(`  Status: ${item.status}`);
  console.log(`  Active role: ${item.activeRole || "-"}`);
  console.log(`  Next role: ${item.nextRole || "-"}\n`);
}

function resume() {
  const safeName = validateFeatureName(featureName);
  const { itemDir, itemPath, item } = loadWorkItem(safeName);
  console.log("\n  Workflow Resume Packet\n");
  console.log(`  Work item: ${item.id}`);
  console.log(`  Work file: ${path.relative(cwd, itemPath)}`);
  console.log(`  Feature: ${item.feature}`);
  console.log(`  Phase: ${item.phase}`);
  console.log(`  Status: ${item.status}`);
  console.log(`  Active role: ${item.activeRole || "-"}`);
  console.log(`  Next role: ${item.nextRole || "-"}`);
  console.log(`  Updated at: ${item.updatedAt || "-"}`);
  console.log("  Pending tasks:");
  if ((item.pendingTasks || []).length === 0) {
    console.log("  - none");
  } else {
    for (const task of item.pendingTasks) {
      console.log(`  - ${typeof task === "string" ? task : JSON.stringify(task)}`);
    }
  }
  console.log("  Blockers:");
  if ((item.blockers || []).length === 0) {
    console.log("  - none");
  } else {
    for (const blocker of item.blockers) {
      console.log(`  - ${typeof blocker === "string" ? blocker : JSON.stringify(blocker)}`);
    }
  }
  console.log("\n  Read first:");
  for (const documentPath of Object.values(item.documents || {})) {
    console.log(`  - ${path.relative(cwd, resolveWorkDocumentPath(item, documentPath))}`);
  }
  console.log(`  - ${path.relative(cwd, path.join(itemDir, "handoff.md"))}`);
  console.log(`  - ${path.relative(cwd, path.join(itemDir, "verification.md"))}\n`);
}

function validateSkill(skillName, manifestEntry) {
  const skillFile = path.join(SOURCE_DIR, skillName, "SKILL.md");
  const failures = [];

  if (!fs.existsSync(skillFile)) {
    failures.push(`missing file: skills/${skillName}/SKILL.md`);
    return failures;
  }

  const contents = readText(skillFile);
  const requiredTokens = [
    `name: ${skillName}`,
    "inputs:",
    "outputs:",
    "required_tools:",
    "fallbacks:",
    "## Inputs",
    "## Outputs",
  ];

  for (const token of requiredTokens) {
    if (!contents.includes(token)) {
      failures.push(`skills/${skillName}/SKILL.md missing token: ${token}`);
    }
  }

  if (manifestEntry) {
    if (!["none", "docs-only", "implementation"].includes(manifestEntry.mutationPolicy)) {
      failures.push(`manifest role ${skillName} has invalid mutationPolicy`);
    }
    if (!contents.includes(`mutation_policy: ${manifestEntry.mutationPolicy}`)) {
      failures.push(`skills/${skillName}/SKILL.md missing mutation policy: ${manifestEntry.mutationPolicy}`);
    }
    for (const output of manifestEntry.requiredOutputs) {
      if (!contents.includes(output)) {
        failures.push(`skills/${skillName}/SKILL.md missing required output key: ${output}`);
      }
    }
  }

  return failures;
}

function validateAdapter(adapter, manifest) {
  const failures = [];

  if (!adapter.fileName || !adapter.projectPaths || !adapter.projectPaths.skillsDir || !adapter.projectPaths.specsDir) {
    failures.push(`adapter ${adapter.target} is missing required path metadata`);
  }

  for (const role of manifest.skills) {
    const rendered = renderTargetRoleFile(adapter, role.name);
    for (const output of role.requiredOutputs) {
      if (!rendered.includes(output)) {
        failures.push(`adapter ${adapter.target} render for ${role.name} missing output key: ${output}`);
      }
    }
    if (adapter.target === "cursor" && !rendered.includes("name:")) {
      failures.push(`adapter ${adapter.target} render for ${role.name} must preserve source frontmatter`);
    }
    if (adapter.target === "codex" && !rendered.includes("Codex Role Contract")) {
      failures.push(`adapter ${adapter.target} render for ${role.name} missing Codex header`);
    }
    if (adapter.target === "claude" && !rendered.includes("Claude Role Contract")) {
      failures.push(`adapter ${adapter.target} render for ${role.name} missing Claude header`);
    }
  }

  return failures;
}

function validate() {
  console.log("\n  Agent Workflow Validation\n");

  const failures = [];
  const manifest = loadManifest();

  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    failures.push("agent-workflow.manifest.json must declare at least one role");
  }

  for (const role of manifest.skills) {
    if (!Array.isArray(role.handoffInputs) || !Array.isArray(role.handoffOutputs)) {
      failures.push(`manifest role ${role.name} must declare handoffInputs and handoffOutputs`);
    } else {
      for (const output of role.handoffOutputs) {
        if (!role.requiredOutputs.includes(output)) {
          failures.push(`manifest role ${role.name} handoff output is not a required output: ${output}`);
        }
      }
    }
    failures.push(...validateSkill(role.name, role));
  }

  for (const adapter of loadAllAdapters()) {
    failures.push(...validateAdapter(adapter, manifest));
  }

  const packageJson = readJson(path.join(ROOT_DIR, "package.json"));
  if (packageJson.version !== manifest.version) {
    failures.push(
      `package.json version (${packageJson.version}) must match manifest version (${manifest.version})`
    );
  }
  for (const requiredEntry of ["templates/", "skills/", "agent-workflow.manifest.json", "adapters/"]) {
    if (!packageJson.files.includes(requiredEntry)) {
      failures.push(`package.json files must include "${requiredEntry}"`);
    }
  }

  for (const templateName of [
    "articulate-template.md",
    "designs-template.md",
    "development-spec-template.md",
    "specs-readme.md",
    "change-template.md",
    "decision-template.md",
    "handoff-template.md",
    "verification-template.md",
  ]) {
    if (!fs.existsSync(path.join(TEMPLATES_DIR, templateName))) {
      failures.push(`missing template: templates/${templateName}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`  [fail] ${failure}`);
    }
    console.error(`\n  Validation failed: ${failures.length} issue(s).\n`);
    process.exit(1);
  }

  console.log("  [ok] core roles, adapters, and package metadata are consistent.\n");
}

function doctor() {
  const adapter = loadAdapter(target);
  const findings = [];
  const packageJsonPath = path.join(cwd, "package.json");
  const workflow = global ? null : loadWorkflow();
  const paths = getTargetPaths(adapter);

  findings.push({
    label: `${adapter.projectPaths.skillsDir}`,
    ok: fs.existsSync(paths.skillsDir),
    detail: fs.existsSync(paths.skillsDir) ? "present" : "missing (run install)",
  });
  findings.push({
    label: workflow ? workflow.specsRoot : `${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`,
    ok: fs.existsSync(paths.specsDir),
    detail: fs.existsSync(paths.specsDir) ? "present" : "missing (run init)",
  });

  if (!global) {
    findings.push({
      label: "workflow configuration",
      ok: fs.existsSync(getWorkflowPath()),
      detail: fs.existsSync(getWorkflowPath())
        ? `continuity=${workflow.continuity.storage}`
        : "missing (run init)",
    });
    const importedSources = new Set((workflow.migrations || []).map((migration) => migration.source));
    const legacyDirs = TARGETS
      .map((targetName) => LEGACY_SPECS_DIRS[targetName])
      .filter((relativePath) => fs.existsSync(path.join(cwd, relativePath)) && !importedSources.has(relativePath));
    findings.push({
      label: "legacy specs import",
      ok: legacyDirs.length === 0,
      detail: legacyDirs.length === 0
        ? "not needed"
        : `available: ${legacyDirs.join(", ")} (run import --from <target>)`,
    });
  }

  if (fs.existsSync(packageJsonPath)) {
    const packageJson = readJson(packageJsonPath);
    const scripts = packageJson.scripts || {};
    findings.push({ label: "lint script", ok: Boolean(scripts.lint), detail: scripts.lint || "not found" });
    findings.push({ label: "test script", ok: Boolean(scripts.test), detail: scripts.test || "not found" });
    findings.push({
      label: "typecheck script",
      ok: Boolean(scripts.typecheck),
      detail: scripts.typecheck || "not found",
    });
  } else {
    findings.push({ label: "package.json", ok: false, detail: "missing" });
  }

  console.log(`\n  ${adapter.label} Doctor\n`);
  console.log(`  Project: ${cwd}`);
  console.log(`  Target: ${adapter.target}\n`);

  let warnings = 0;
  for (const finding of findings) {
    const mark = finding.ok ? "ok" : "warn";
    console.log(`  [${mark}] ${finding.label}: ${finding.detail}`);
    if (!finding.ok) {
      warnings++;
    }
  }

  console.log(
    warnings === 0
      ? "\n  Doctor completed with no major issues.\n"
      : "\n  Doctor completed with warnings. This target can run in degraded mode.\n"
  );
}

function getUpdateCachePath() {
  if (process.env.AGENT_WORKFLOW_UPDATE_CACHE_DIR) {
    return path.join(process.env.AGENT_WORKFLOW_UPDATE_CACHE_DIR, "update-check.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "agent-workflow-orchestration", "update-check.json");
  }
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "agent-workflow-orchestration", "update-check.json");
  }
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "agent-workflow-orchestration", "update-check.json");
}

function getUpdateCheckNow() {
  const configured = Number(process.env.AGENT_WORKFLOW_UPDATE_CHECK_NOW);
  return Number.isFinite(configured) && configured > 0 ? configured : Date.now();
}

function readUpdateCache(cachePath) {
  try {
    return readJson(cachePath);
  } catch (error) {
    return {};
  }
}

function requestLatestVersion(registryUrl) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(registryUrl);
    } catch (error) {
      reject(error);
      return;
    }
    const client = parsedUrl.protocol === "http:" ? http : https;
    const request = client.get(
      parsedUrl,
      { headers: { accept: "application/json", "user-agent": `${loadManifest().name}/${loadManifest().version}` } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 256 * 1024) {
            request.destroy(new Error("registry response was too large"));
          }
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`registry returned HTTP ${response.statusCode}`));
            return;
          }
          try {
            const metadata = JSON.parse(body);
            const latest = metadata["dist-tags"] && metadata["dist-tags"].latest;
            if (!semver.valid(latest)) {
              reject(new Error("registry latest version was invalid"));
              return;
            }
            resolve(latest);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.setTimeout(UPDATE_CHECK_TIMEOUT_MS, () => {
      request.destroy(new Error("registry request timed out"));
    });
    request.on("error", reject);
  });
}

function updateCheckEnabled() {
  if (process.env.AGENT_WORKFLOW_NO_UPDATE_CHECK === "1" || process.env.NO_UPDATE_NOTIFIER === "1") {
    return false;
  }
  if (process.env.CI) {
    return false;
  }
  return Boolean(process.stdout.isTTY) || process.env.AGENT_WORKFLOW_FORCE_UPDATE_CHECK === "1";
}

async function maybeCheckForUpdate() {
  if (!updateCheckEnabled()) {
    return;
  }
  const cachePath = getUpdateCachePath();
  const cache = readUpdateCache(cachePath);
  const now = getUpdateCheckNow();
  const ttl = cache.failed ? UPDATE_CHECK_FAILURE_TTL_MS : UPDATE_CHECK_SUCCESS_TTL_MS;
  let latest = cache.latest;
  if (cache.failed && cache.checkedAt && now - cache.checkedAt < ttl) {
    return;
  }
  if (!cache.checkedAt || now - cache.checkedAt >= ttl) {
    const packageName = loadManifest().name;
    const registryUrl =
      process.env.AGENT_WORKFLOW_REGISTRY_URL ||
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    try {
      latest = await requestLatestVersion(registryUrl);
      cache.latest = latest;
      cache.failed = false;
      cache.checkedAt = now;
    } catch (error) {
      cache.failed = true;
      cache.checkedAt = now;
      try {
        writeJson(cachePath, cache);
      } catch (writeError) {
        // Update checks must never affect command success.
      }
      return;
    }
  }

  const current = loadManifest().version;
  if (
    semver.valid(current) &&
    semver.valid(latest) &&
    semver.gt(latest, current) &&
    (!cache.notifiedAt || now - cache.notifiedAt >= UPDATE_CHECK_SUCCESS_TTL_MS)
  ) {
    console.error(`\n  Update available: ${current} → ${latest}`);
    console.error(`  Run: npx ${loadManifest().name}@latest update\n`);
    cache.notifiedAt = now;
  }
  try {
    writeJson(cachePath, cache);
  } catch (error) {
    // Update checks must never affect command success.
  }
}

function help() {
  console.log(`
  agent-workflow-orchestration <command> [options]

  Commands:
    install    Install role files for a target adapter
    update     Safely update recorded role files for installed targets
    uninstall  Remove installed role files for a target adapter
    init       Initialize shared workflow specs docs
    feature    Create articulate/designs/specs docs in shared specs
    import     Copy legacy target specs into shared specs without overwriting conflicts
    work       Create a resumable work item linked to a feature
    advance    Update the phase and role for a work item
    resume     Print a model-neutral resume packet for a work item
    list       Show installation status for one or all targets
    validate   Validate core roles, adapters, and package metadata
    doctor     Inspect the current project for target-specific readiness

  Options:
    --target   cursor | codex | claude (default: cursor)
    --name     Feature slug or work item id
    --feature  Feature slug for the work command
    --from     Legacy specs source target for the import command
    --phase    Work phase for the advance command
    --role     Active role override for the advance command
    --next-role  Next role override for work/advance (role name or none)
    --status   active | blocked | complete for the advance command
    --dry-run  Preview legacy import without writing
    --global   Install to the target's global home directory
    --force    Overwrite package-owned generated files
    --help     Show this help message

  Examples:
    npx @hankim.dev/agent-workflow-orchestration install --target cursor
    npx @hankim.dev/agent-workflow-orchestration install --target codex
    npx @hankim.dev/agent-workflow-orchestration update
    npx @hankim.dev/agent-workflow-orchestration init
    npx @hankim.dev/agent-workflow-orchestration feature --name user-onboarding
    npx @hankim.dev/agent-workflow-orchestration import --from cursor
    npx @hankim.dev/agent-workflow-orchestration work --name implement-onboarding --feature user-onboarding
    npx @hankim.dev/agent-workflow-orchestration resume --name implement-onboarding
    npx @hankim.dev/agent-workflow-orchestration doctor --target codex
    npx @hankim.dev/agent-workflow-orchestration validate
  `);
}

switch (command) {
  case "install":
    install();
    break;
  case "update":
    update();
    break;
  case "uninstall":
    uninstall();
    break;
  case "init":
    init();
    break;
  case "feature":
    feature();
    break;
  case "import":
    importLegacySpecs();
    break;
  case "work":
    work();
    break;
  case "advance":
    advance();
    break;
  case "resume":
    resume();
    break;
  case "list":
    list();
    break;
  case "validate":
    validate();
    break;
  case "doctor":
    doctor();
    break;
  case "--help":
  case "help":
    help();
    break;
  default:
    console.error(`  Unknown command: ${command}`);
    help();
    process.exit(1);
}

maybeCheckForUpdate().catch(() => {
  // Update checks must never affect command success.
});
