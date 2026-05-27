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
const STATE_FILENAME = "state.json";
const SPECS_SUBDIRS = ["features", "changes", "decisions"];
const FEATURE_DOC_TEMPLATES = [
  ["articulate.md", "articulate-template.md"],
  ["designs.md", "designs-template.md"],
  ["specs.md", "development-spec-template.md"],
];
const TARGETS = ["cursor", "codex", "claude"];

const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("help");
const command = showHelp ? "help" : args.find((arg) => !arg.startsWith("-")) || "install";
const force = args.includes("--force");
const global = args.includes("--global");
const target = getArgValue("--target") || "cursor";
const featureName = getArgValue("--name");
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
  return path.join(projectRoot, STATE_DIRNAME, STATE_FILENAME);
}

function loadProjectState(projectRoot = cwd) {
  const statePath = getProjectStatePath(projectRoot);
  if (!fs.existsSync(statePath)) {
    return {
      activeTarget: null,
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
}

function removeProjectState(projectRoot = cwd) {
  const statePath = getProjectStatePath(projectRoot);
  if (fs.existsSync(statePath)) {
    fs.rmSync(path.dirname(statePath), { recursive: true, force: true });
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
    specsDir: path.join(projectRoot, adapter.projectPaths.specsDir),
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

function ensureProjectTargetAllowed(nextTarget, projectRoot = cwd) {
  if (global) {
    return;
  }
  const state = loadProjectState(projectRoot);
  if (state.activeTarget && state.activeTarget !== nextTarget && !force) {
    console.error(`  Active target is ${state.activeTarget}.`);
    console.error(`  Use --target ${state.activeTarget} or pass --force to switch to ${nextTarget}.`);
    process.exit(1);
  }
}

function removeTargetArtifacts(targetName, projectRoot = cwd) {
  const adapter = loadAdapter(targetName);
  const paths = getTargetPaths(adapter, projectRoot);
  const targetRoot = path.dirname(paths.skillsDir);
  rmDirSync(targetRoot);
}

function updateProjectState(targetName, addTarget, projectRoot = cwd) {
  if (global) {
    return;
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
    activeTarget: addTarget ? targetName : installedTargets[0] || null,
    installedTargets,
    packageVersion: loadManifest().version,
  };
  if (!nextState.activeTarget && installedTargets.length === 0) {
    removeProjectState(projectRoot);
    return;
  }
  saveProjectState(nextState, projectRoot);
}

function install() {
  const adapter = loadAdapter(target);
  const paths = getTargetPaths(adapter);
  const manifest = loadManifest();
  const currentState = loadProjectState();

  ensureProjectTargetAllowed(adapter.target);

  if (!global && force && currentState.activeTarget && currentState.activeTarget !== adapter.target) {
    removeTargetArtifacts(currentState.activeTarget);
    updateProjectState(currentState.activeTarget, false);
  }

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
    console.log(`  [state] activeTarget=${state.activeTarget || "-"} installed=${(state.installedTargets || []).join(",") || "-"}`);
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
  const currentState = loadProjectState();

  if (global) {
    console.error("  init does not support --global. Use a project directory.");
    process.exit(1);
  }

  ensureProjectTargetAllowed(adapter.target);

  if (force && currentState.activeTarget && currentState.activeTarget !== adapter.target) {
    removeTargetArtifacts(currentState.activeTarget);
    updateProjectState(currentState.activeTarget, false);
  }

  console.log(`\n  ${adapter.label} Specs Init\n`);
  console.log(`  Project: ${cwd}`);
  console.log(`  Target: ${adapter.target}\n`);

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

  updateProjectState(adapter.target, true);

  console.log(`  [created] ${adapter.projectPaths.specsDir}`);
  console.log("  [created] example docs");
  console.log("\n  Done. Target-specific specs are ready.\n");
}

function feature() {
  const adapter = loadAdapter(target);
  const paths = getTargetPaths(adapter);
  const currentState = loadProjectState();
  const safeName = validateFeatureName(featureName);

  if (global) {
    console.error("  feature does not support --global. Use a project directory.");
    process.exit(1);
  }

  ensureProjectTargetAllowed(adapter.target);

  if (force && currentState.activeTarget && currentState.activeTarget !== adapter.target) {
    removeTargetArtifacts(currentState.activeTarget);
    updateProjectState(currentState.activeTarget, false);
  }

  console.log(`\n  ${adapter.label} Feature Scaffold\n`);
  console.log(`  Project: ${cwd}`);
  console.log(`  Target: ${adapter.target}`);
  console.log(`  Feature: ${safeName}\n`);

  ensureSpecsSubdirs(paths);
  if (!fs.existsSync(path.join(paths.specsDir, "README.md"))) {
    writeFileIfChanged(path.join(paths.specsDir, "README.md"), renderSpecsReadme(adapter));
  }

  const result = writeFeatureDocs(paths, safeName);

  updateProjectState(adapter.target, true);

  console.log(`  [created] ${path.relative(cwd, result.featureDir)}`);
  console.log(`  Done: ${result.created} written, ${result.skipped} skipped.`);
  if (result.skipped > 0 && !force) {
    console.log("  Tip: Use --force to overwrite existing feature docs.");
  }
  console.log();
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
  const state = global ? null : loadProjectState();
  const paths = getTargetPaths(adapter);

  findings.push({
    label: `${adapter.projectPaths.skillsDir}`,
    ok: fs.existsSync(paths.skillsDir),
    detail: fs.existsSync(paths.skillsDir) ? "present" : "missing (run install)",
  });
  findings.push({
    label: `${adapter.projectPaths.specsDir}`,
    ok: fs.existsSync(paths.specsDir),
    detail: fs.existsSync(paths.specsDir) ? "present" : "missing (run init)",
  });

  if (!global) {
    findings.push({
      label: "active target state",
      ok: !state.activeTarget || state.activeTarget === adapter.target,
      detail: state.activeTarget
        ? `activeTarget=${state.activeTarget}`
        : "not initialized",
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
    init       Initialize target-specific specs docs
    feature    Create articulate/designs/specs docs for one feature
    list       Show installation status for one or all targets
    validate   Validate core roles, adapters, and package metadata
    doctor     Inspect the current project for target-specific readiness

  Options:
    --target   cursor | codex | claude (default: cursor)
    --name     Feature slug for the feature command
    --global   Install to the target's global home directory
    --force    Overwrite existing files or switch active target
    --help     Show this help message

  Examples:
    npx @hankim.dev/agent-workflow-orchestration install --target cursor
    npx @hankim.dev/agent-workflow-orchestration install --target codex
    npx @hankim.dev/agent-workflow-orchestration init --target claude
    npx @hankim.dev/agent-workflow-orchestration feature --target cursor --name user-onboarding
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
