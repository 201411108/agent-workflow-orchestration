#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "skills");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
const ADAPTERS_DIR = path.join(ROOT_DIR, "adapters");
const MANIFEST_PATH = path.join(ROOT_DIR, "agent-workflow.manifest.json");
const STATE_DIRNAME = ".agent-workflow";
const WORKFLOW_FILENAME = "workflow.json";
const LOCAL_STATE_SUBDIR = ".local";
const STATE_FILENAME = "state.json";
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
  articulate: ["role-planner", "role-designer"],
  design: ["role-designer", "role-architect"],
  architecture: ["role-architect", "role-developer"],
  specification: ["role-developer", "role-reviewer"],
  implementation: ["role-developer", "role-reviewer"],
  review: ["role-reviewer", "role-developer"],
  verification: ["role-reviewer", null],
  done: [null, null],
};

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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function getCanonicalSpecsPath(projectRoot = cwd) {
  return path.join(projectRoot, STATE_DIRNAME, CANONICAL_SPECS_SUBDIR);
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

function loadWorkflow(projectRoot = cwd) {
  const workflowPath = getWorkflowPath(projectRoot);
  if (!fs.existsSync(workflowPath)) {
    return getDefaultWorkflow();
  }
  return readJson(workflowPath);
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
    fs.appendFileSync(ignorePath, `${LOCAL_STATE_SUBDIR}/\n`);
  }
  return loadWorkflow(projectRoot);
}

function loadProjectState(projectRoot = cwd) {
  const statePath = getProjectStatePath(projectRoot);
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (!fs.existsSync(statePath) && fs.existsSync(legacyPath)) {
    const legacy = readJson(legacyPath);
    return {
      installedTargets: legacy.installedTargets || (legacy.activeTarget ? [legacy.activeTarget] : []),
      packageVersion: legacy.packageVersion || loadManifest().version,
      legacyActiveTarget: legacy.activeTarget || null,
    };
  }
  if (!fs.existsSync(statePath)) {
    return {
      installedTargets: [],
      packageVersion: loadManifest().version,
    };
  }
  return readJson(statePath);
}

function saveProjectState(state, projectRoot = cwd) {
  if (global) {
    return;
  }
  writeJson(getProjectStatePath(projectRoot), state);
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (fs.existsSync(legacyPath)) {
    fs.rmSync(legacyPath, { force: true });
  }
}

function removeProjectState(projectRoot = cwd) {
  const statePath = getProjectStatePath(projectRoot);
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
  const legacyPath = getLegacyProjectStatePath(projectRoot);
  if (fs.existsSync(legacyPath)) {
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
    specsDir: getCanonicalSpecsPath(projectRoot),
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
    contents = contents.replaceAll(token, value);
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

function rmDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

function renderTargetRoleFile(adapter, skillName) {
  const parsed = parseSkill(skillName);
  if (adapter.target === "cursor") {
    return parsed.raw;
  }

  const manifest = loadManifest();
  const role = manifest.skills.find((entry) => entry.name === skillName);
  const title = role ? role.name : skillName;
  const requiredOutputs = role ? role.requiredOutputs.join(", ") : "";
  const requiredTools = role ? role.requiredTools.join(", ") : "";
  const optionalTools = role ? role.optionalTools.join(", ") : "";
  const headerLabel = adapter.fileName === "CLAUDE.md" ? "Claude Role Contract" : "Codex Role Contract";

  return [
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
  ].join("\n");
}

function updateProjectState(targetName, addTarget, projectRoot = cwd) {
  if (global) {
    return;
  }
  if (addTarget) {
    ensureWorkflow(projectRoot);
  }
  const state = loadProjectState(projectRoot);
  const installed = new Set(state.installedTargets || []);
  if (addTarget) {
    installed.add(targetName);
  } else {
    installed.delete(targetName);
  }
  const installedTargets = Array.from(installed);
  const nextState = {
    installedTargets,
    packageVersion: loadManifest().version,
  };
  if (installedTargets.length === 0) {
    removeProjectState(projectRoot);
    return;
  }
  saveProjectState(nextState, projectRoot);
}

function install() {
  const adapter = loadAdapter(target);
  const paths = getTargetPaths(adapter);
  const manifest = loadManifest();

  console.log(`\n  ${adapter.label} Installer\n`);
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log(`  Target: ${adapter.target}\n`);

  fs.mkdirSync(paths.skillsDir, { recursive: true });

  let installed = 0;
  let skipped = 0;

  for (const role of manifest.skills) {
    const roleDir = path.join(paths.skillsDir, role.name);
    const roleFile = path.join(roleDir, adapter.fileName);

    if (fs.existsSync(roleFile) && !force) {
      console.log(`  [skip] ${role.name} (${adapter.fileName} already exists)`);
      skipped++;
      continue;
    }

    if (force) {
      rmDirSync(roleDir);
    }

    writeFileIfChanged(roleFile, renderTargetRoleFile(adapter, role.name));
    console.log(`  [installed] ${role.name}`);
    installed++;
  }

  if (!global) {
    updateProjectState(adapter.target, true);
  }

  console.log(`\n  Done: ${installed} installed, ${skipped} skipped.`);
  console.log(`  Role files were written to ${paths.skillsDir}\n`);
}

function uninstall() {
  const adapter = loadAdapter(target);
  const paths = getTargetPaths(adapter);
  const manifest = loadManifest();

  console.log(`\n  ${adapter.label} Uninstaller\n`);
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log(`  Target: ${adapter.target}\n`);

  let removed = 0;

  for (const role of manifest.skills) {
    const roleDir = path.join(paths.skillsDir, role.name);
    if (fs.existsSync(roleDir)) {
      rmDirSync(roleDir);
      console.log(`  [removed] ${role.name}`);
      removed++;
    } else {
      console.log(`  [not found] ${role.name}`);
    }
  }

  if (fs.existsSync(paths.skillsDir) && fs.readdirSync(paths.skillsDir).length === 0) {
    rmDirSync(paths.skillsDir);
  }

  if (!global) {
    updateProjectState(adapter.target, false);
  }

  console.log(`\n  Done: ${removed} roles removed.\n`);
}

function list() {
  const manifest = loadManifest();
  const adapters = target && args.includes("--target") ? [loadAdapter(target)] : loadAllAdapters();

  console.log("\n  Agent Workflow Targets\n");
  if (!global) {
    const state = loadProjectState();
    const workflow = loadWorkflow();
    const workItemsDir = getWorkItemsPath(workflow);
    const workItemCount = fs.existsSync(workItemsDir)
      ? fs.readdirSync(workItemsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
      : 0;
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

function renderSpecsReadme(adapter) {
  return renderTemplate("specs-readme.md", {
    "{{SPECS_PATH}}": adapter.projectPaths.specsDir,
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
  const paths = getTargetPaths(adapter);

  if (global) {
    console.error("  init does not support --global. Use a project directory.");
    process.exit(1);
  }

  ensureWorkflow();
  if (args.includes("--target")) {
    console.log("  [deprecated] --target is ignored by init; specs are shared across all targets.");
  }

  console.log("\n  Shared Workflow Specs Init\n");
  console.log(`  Project: ${cwd}`);
  console.log(`  Specs: ${path.relative(cwd, paths.specsDir)}\n`);

  if (fs.existsSync(paths.specsDir) && !force) {
    console.log(`  [skip] ${adapter.projectPaths.specsDir} already exists.`);
    console.log("  Tip: Use --force to reinitialize.\n");
    return;
  }

  ensureSpecsSubdirs(paths);

  writeFileIfChanged(path.join(paths.specsDir, "README.md"), renderSpecsReadme(adapter));
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
  const paths = getTargetPaths(adapter);
  const safeName = validateFeatureName(featureName);

  if (global) {
    console.error("  feature does not support --global. Use a project directory.");
    process.exit(1);
  }

  ensureWorkflow();
  if (args.includes("--target")) {
    console.log("  [deprecated] --target is ignored by feature; specs are shared across all targets.");
  }

  console.log("\n  Shared Workflow Feature Scaffold\n");
  console.log(`  Project: ${cwd}`);
  console.log(`  Feature: ${safeName}\n`);

  ensureSpecsSubdirs(paths);
  if (!fs.existsSync(path.join(paths.specsDir, "README.md"))) {
    writeFileIfChanged(path.join(paths.specsDir, "README.md"), renderSpecsReadme(adapter));
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
  const destinationDir = getCanonicalSpecsPath();
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

  const workflow = loadWorkflow();
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
  const itemDir = getWorkItemPath(name);
  const itemPath = path.join(itemDir, "work.json");
  if (!fs.existsSync(itemPath)) {
    console.error(`  Work item not found: ${name}`);
    process.exit(1);
  }
  return { itemDir, itemPath, item: readJson(itemPath) };
}

function work() {
  if (global) {
    console.error("  work does not support --global. Use a project directory.");
    process.exit(1);
  }
  const safeName = validateFeatureName(featureName);
  const safeFeature = validateFeatureName(linkedFeature);
  ensureWorkflow();
  const featureDir = path.join(getCanonicalSpecsPath(), "features", safeFeature);
  if (!fs.existsSync(featureDir)) {
    console.error(`  Feature not found in shared specs: ${safeFeature}`);
    console.error(`  Run feature --name ${safeFeature} first.`);
    process.exit(1);
  }

  const itemDir = getWorkItemPath(safeName);
  const workPath = path.join(itemDir, "work.json");
  if (fs.existsSync(workPath) && !force) {
    console.error(`  Work item already exists: ${safeName}. Use --force to overwrite.`);
    process.exit(1);
  }

  const documents = {
    articulate: `specs/features/${safeFeature}/articulate.md`,
    designs: `specs/features/${safeFeature}/designs.md`,
    specs: `specs/features/${safeFeature}/specs.md`,
  };
  const item = {
    schemaVersion: 1,
    id: safeName,
    feature: safeFeature,
    phase: "articulate",
    status: "active",
    activeRole: "role-planner",
    nextRole: "role-designer",
    pendingTasks: [],
    blockers: [],
    documents,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(itemDir, { recursive: true });
  writeJson(workPath, item);
  writeFileIfChanged(
    path.join(itemDir, "handoff.md"),
    renderTemplate("handoff-template.md", { "{work-id}": safeName, "{feature-name}": safeFeature })
  );
  writeFileIfChanged(
    path.join(itemDir, "verification.md"),
    renderTemplate("verification-template.md", { "{work-id}": safeName, "{feature-name}": safeFeature })
  );

  console.log("\n  Workflow Work Item\n");
  console.log(`  [created] ${path.relative(cwd, itemDir)}`);
  console.log("  Phase: articulate");
  console.log("  Next role: role-designer\n");
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

  const { itemPath, item } = loadWorkItem(safeName);
  const defaultRoles = PHASE_ROLES[phase];
  item.phase = phase;
  item.status = selectedStatus || (phase === "done" ? "complete" : "active");
  item.activeRole = selectedRole || defaultRoles[0];
  item.nextRole = defaultRoles[1];
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
  const { itemDir, item } = loadWorkItem(safeName);
  console.log("\n  Workflow Resume Packet\n");
  console.log(`  Work item: ${item.id}`);
  console.log(`  Feature: ${item.feature}`);
  console.log(`  Phase: ${item.phase}`);
  console.log(`  Status: ${item.status}`);
  console.log(`  Active role: ${item.activeRole || "-"}`);
  console.log(`  Next role: ${item.nextRole || "-"}`);
  console.log(`  Pending tasks: ${(item.pendingTasks || []).length}`);
  console.log(`  Blockers: ${(item.blockers || []).length}`);
  console.log("\n  Read first:");
  for (const documentPath of Object.values(item.documents || {})) {
    console.log(`  - ${path.join(STATE_DIRNAME, documentPath)}`);
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
    label: `${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`,
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

function help() {
  console.log(`
  agent-workflow-orchestration <command> [options]

  Commands:
    install    Install role files for a target adapter
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
    --status   active | blocked | complete for the advance command
    --dry-run  Preview legacy import without writing
    --global   Install to the target's global home directory
    --force    Overwrite package-owned generated files
    --help     Show this help message

  Examples:
    npx @hankim.dev/agent-workflow-orchestration install --target cursor
    npx @hankim.dev/agent-workflow-orchestration install --target codex
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
