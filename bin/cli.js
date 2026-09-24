#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const semver = require("semver");
const {
  mergeConfig,
  mergeGuidance,
  removeManagedConfig,
  removeManagedGuidance,
} = require("./codex-managed");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "skills");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
// 모든 역할이 같은 형식으로 반환하는 핸드오프 봉투의 필수 필드.
// 1.6 검증 하네스가 이 필드들로 계약 준수를 기계 판정한다.
// D16의 능력 어휘. 역할 계약의 "필요한 것", 핸드오프 needs, 역할 capabilities가
// 모두 이 어휘를 공유해야 오케스트레이터가 반환된 needs를 역할로 해소할 수 있다.
const CAPABILITY_VOCABULARY = [
  "product-intent",
  "ui-decision",
  "code-evidence",
  "external-evidence",
  "contract-decision",
  "implementation",
  "verification",
  "acceptance-criteria",
];

const HANDOFF_ENVELOPE_FIELDS = [
  "from:",
  "status:",
  "produced:",
  "facts_confirmed:",
  "assumptions:",
  "blocking_questions:",
  "needs:",
  "out_of_scope:",
];
const ADAPTERS_DIR = path.join(ROOT_DIR, "adapters");
const CODEX_PAYLOAD_DIR = path.join(ROOT_DIR, "payloads", "codex");
const KNOWN_CODEX_V1_LEGACY_HASHES = {
  "role-designer/AGENT.md": "0ffc735b3e899ae11b7422a005c11846ffdab8cf2402d4539dfde30da5cadc22",
  "role-developer/AGENT.md": "6847b7b2162aeff3a2007125d4383016d35ff5b918b7b674f201bf56584bb518",
  "role-orchestrator/AGENT.md": "7d64905f91a4be61244012118d57db22b514e8a75b0c8c11914c71fae86baa1b",
  "role-planner/AGENT.md": "b48b0d362eeb04ceac8fa7205ff28b04286e9c5ff57fcf8c3302acfd6ff2fac1",
};
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
  const manifest = readJson(MANIFEST_PATH);
  // 1.5에서 최상위 키를 skills -> roles로 바꿨다. 구 키를 가진 파일도 읽는다.
  const legacyRoles = manifest["skills"];
  const roles = Array.isArray(manifest.roles) ? manifest.roles : legacyRoles;
  manifest.roles = Array.isArray(roles) ? roles : [];
  // 1.7에서 handoffInputs/handoffOutputs를 consumes/produces로 바꿨다.
  // 구 키를 가진 파일도 읽는다.
  for (const role of manifest.roles) {
    if (!Array.isArray(role.consumes) && Array.isArray(role["handoffInputs"])) {
      role.consumes = role["handoffInputs"];
    }
    if (!Array.isArray(role.produces) && Array.isArray(role["handoffOutputs"])) {
      role.produces = role["handoffOutputs"];
    }
    if (!Array.isArray(role.capabilities)) {
      role.capabilities = [];
    }
  }
  if (!Array.isArray(manifest.environmentInputs)) {
    manifest.environmentInputs = ["user_request", "workflow_state"];
  }
  // 외부 소비자를 위한 별칭. 이 파일의 코드는 roles만 쓴다.
  manifest["skills"] = manifest.roles;
  return manifest;
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
  const scopeRoot = global ? os.homedir() : projectRoot;
  const configuredPaths = global ? adapter.globalPaths : adapter.projectPaths;
  if (global) {
    return {
      rolesDir: path.join(scopeRoot, configuredPaths.rolesDir || configuredPaths.skillsDir),
      skillsDir: path.join(scopeRoot, configuredPaths.skillsDir),
      agentsDir: configuredPaths.agentsDir ? path.join(scopeRoot, configuredPaths.agentsDir) : null,
      configFile: configuredPaths.configFile ? path.join(scopeRoot, configuredPaths.configFile) : null,
      guidanceFile: configuredPaths.guidanceFile ? path.join(scopeRoot, configuredPaths.guidanceFile) : null,
      specsDir: path.join(scopeRoot, configuredPaths.specsDir),
    };
  }
  return {
    rolesDir: path.join(scopeRoot, configuredPaths.rolesDir || configuredPaths.skillsDir),
    skillsDir: path.join(scopeRoot, configuredPaths.skillsDir),
    agentsDir: configuredPaths.agentsDir ? path.join(scopeRoot, configuredPaths.agentsDir) : null,
    configFile: configuredPaths.configFile ? path.join(scopeRoot, configuredPaths.configFile) : null,
    guidanceFile: configuredPaths.guidanceFile ? path.join(scopeRoot, configuredPaths.guidanceFile) : null,
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

function readFrontmatterField(frontmatter, field) {
  const lines = frontmatter.split("\n");
  const startIndex = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (startIndex === -1) {
    return "";
  }
  const inlineValue = lines[startIndex].slice(field.length + 1).trim();
  if (inlineValue && inlineValue !== ">-" && inlineValue !== ">" && inlineValue !== "|") {
    return inlineValue;
  }
  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (!/^\s/.test(lines[index]) || lines[index].trim() === "") {
      break;
    }
    collected.push(lines[index].trim());
  }
  return collected.join(" ");
}

// 역할이 선언한 추상 도구를 타깃의 실제 도구로 해석한다.
// 매핑이 없는 도구는 unavailable로 분리해 조건문 대신 사실로 렌더링한다.
function resolveRoleTools(adapter, role) {
  const declared = [...(role.requiredTools || []), ...(role.optionalTools || [])];
  if (!adapter.tools) {
    return { supported: false, granted: [], unavailable: [], declared };
  }
  const granted = [];
  const unavailable = [];
  for (const abstractName of declared) {
    const native = adapter.tools[abstractName];
    if (!native) {
      unavailable.push(abstractName);
      continue;
    }
    for (const piece of String(native).split(",").map((part) => part.trim()).filter(Boolean)) {
      if (!granted.includes(piece)) {
        granted.push(piece);
      }
    }
  }
  return { supported: true, granted, unavailable, declared };
}

function renderToolsSection(adapter, role) {
  const resolved = resolveRoleTools(adapter, role);
  if (!resolved.supported) {
    return [];
  }
  const required = new Set(role.requiredTools || []);
  const rows = resolved.declared.map((abstractName) => {
    const native = adapter.tools[abstractName];
    return `| \`${abstractName}\` | ${native || "없음"} | ${
      required.has(abstractName) ? "필수" : "선택"
    } |`;
  });
  return [
    "## Tools",
    "",
    `도구 정책: \`${role.toolPolicy || "deny-by-default"}\`. 아래 표에 없는 도구는 쓰지 않는다.`,
    "매핑이 \"없음\"인 항목은 이 타깃에 대응 수단이 없다는 뜻이며, `## Fallback Rules`를 따른다.",
    "",
    "| 계약상 도구 | 이 타깃의 도구 | 구분 |",
    "|-------------|----------------|------|",
    ...rows,
    "",
  ];
}

function getRolePermissions(adapter, mutationPolicy) {
  const table = adapter.permissions || {};
  return table[mutationPolicy] || {};
}

function renderContractSummary(role) {
  // capabilities / produces / consumes는 오케스트레이터가 의존성 해소로 배정할 때
  // 읽는 선언이다. 배포 파일에 실려 있지 않으면 1.7의 디스패치가 성립하지 않는다.
  return [
    "## Contract Summary",
    "",
    `- mutation_policy: ${role.mutationPolicy}`,
    `- capabilities: ${(role.capabilities || []).join(", ") || "없음"}`,
    `- produces: ${(role.produces || []).join(", ") || "없음"}`,
    `- consumes: ${(role.consumes || []).join(", ") || "없음"} (전제)`,
    `- optional_consumes: ${(role.optionalConsumes || []).join(", ") || "없음"} (있으면 사용)`,
    `- required_outputs: ${role.requiredOutputs.join(", ")}`,
    `- required_tools: ${role.requiredTools.join(", ")}`,
    `- optional_tools: ${role.optionalTools.join(", ")}`,
    "",
  ];
}

function escapeTomlBasic(value) {
  return value.split("\\").join("\\\\").split('"').join('\\"');
}

function renderTargetRoleFile(adapter, skillName, projectRoot = cwd) {
  const parsed = parseSkill(skillName);
  const workflow = global ? getDefaultWorkflow() : loadWorkflow(projectRoot);
  const specsRoot = workflow.specsRoot.split(path.sep).join("/");
  const replaceSpecsRoot = (contents) => contents.split(`${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`).join(specsRoot);

  const format = adapter.roleFormat || "passthrough";
  if (format === "passthrough") {
    return replaceSpecsRoot(parsed.raw);
  }

  const manifest = loadManifest();
  const role = manifest.roles.find((entry) => entry.name === skillName);
  if (!role) {
    throw new Error(`role not found in manifest: ${skillName}`);
  }
  const description = readFrontmatterField(parsed.frontmatter, "description");
  const permissions = getRolePermissions(adapter, role.mutationPolicy);

  if (format === "toml") {
    const instructions = replaceSpecsRoot(
      [...renderContractSummary(role), ...renderToolsSection(adapter, role), parsed.body].join("\n")
    ).split('"""').join('\\"\\"\\"');
    const lines = [
      `name = "${escapeTomlBasic(role.name)}"`,
      `description = "${escapeTomlBasic(description)}"`,
    ];
    for (const key of Object.keys(permissions)) {
      lines.push(`${key} = "${escapeTomlBasic(permissions[key])}"`);
    }
    // Codex는 역할별 도구 허용 목록이 없다. 제어 가능한 것은 web_search 뿐이다.
    const codexTools = resolveRoleTools(adapter, role);
    if (codexTools.supported) {
      lines.push(`web_search = ${codexTools.granted.includes("web_search")}`);
    }
    lines.push('developer_instructions = """', instructions, '"""', "");
    return lines.join("\n");
  }

  // markdown-frontmatter (Claude subagent)
  const frontmatterLines = [`name: ${role.name}`, `description: ${description}`];
  for (const key of Object.keys(permissions)) {
    frontmatterLines.push(`${key}: ${permissions[key]}`);
  }
  // toolPolicy: deny-by-default. 허용 목록은 역할 선언에서 도출한다.
  const resolvedTools = resolveRoleTools(adapter, role);
  if (resolvedTools.supported && resolvedTools.granted.length > 0) {
    frontmatterLines.push(`tools: ${resolvedTools.granted.join(", ")}`);
  }
  return replaceSpecsRoot(
    [
      "---",
      ...frontmatterLines,
      "---",
      "",
      `# ${adapter.label}: ${role.name}`,
      "",
      `Contract: ${loadManifest().name} · ${skillName} (패키지 제공, 이 프로젝트의 파일 아님)`,
      "",
      ...renderContractSummary(role),
      ...renderToolsSection(adapter, role),
      parsed.body,
    ].join("\n")
  );
}

function renderLegacyCodexRoleFile(skillName, projectRoot = cwd) {
  // 1.0.x가 생성한 .codex/skills/<role>/AGENT.md의 렌더링을 그대로 보존한다.
  // 레거시 소유권 증명에만 쓰이며 새 배포에는 사용하지 않는다.
  const parsed = parseSkill(skillName);
  const workflow = global ? getDefaultWorkflow() : loadWorkflow(projectRoot);
  const specsRoot = workflow.specsRoot.split(path.sep).join("/");
  const role = loadManifest().roles.find((entry) => entry.name === skillName);
  const title = role ? role.name : skillName;
  return [
    `# Codex Role Contract: ${title}`,
    "",
    "Target: Codex Adapter",
    `Contract: ${loadManifest().name} · ${skillName} (패키지 제공, 이 프로젝트의 파일 아님)`,
    "",
    "## Contract Summary",
    "",
    `- required_outputs: ${role ? role.requiredOutputs.join(", ") : ""}`,
    `- required_tools: ${role ? role.requiredTools.join(", ") : ""}`,
    `- optional_tools: ${role ? role.optionalTools.join(", ") : ""}`,
    "",
    "## Source Frontmatter",
    "",
    "```yaml",
    parsed.frontmatter,
    "```",
    "",
    parsed.body,
  ]
    .join("\n")
    .split(`${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`)
    .join(specsRoot);
}

// 오케스트레이터는 전체 역할의 선언을 읽어 배정한다. 자기 선언만으로는
// 의존성 해소가 불가능하므로 명부를 렌더링에 주입한다.
// 이것은 "요청 유형 -> 역할 순서" 표가 아니라 역할이 무엇을 할 수 있고
// 무엇을 필요로 하는지의 선언이다.
function renderRoleRoster(manifest, orchestratorName) {
  const rows = manifest.roles
    .filter(function (role) {
      return role.name !== orchestratorName;
    })
    .map(function (role) {
      return [
        "| `" + role.name + "`",
        (role.capabilities || []).join(", ") || "-",
        (role.produces || []).join(", ") || "-",
        (role.consumes || []).join(", ") || "-",
        (role.optionalConsumes || []).join(", ") || "-",
        role.mutationPolicy + " |",
      ].join(" | ");
    });
  return [
    "## Role Roster",
    "",
    "배정은 이 선언에서 계산한다. 아래는 역할이 무엇을 할 수 있고 무엇을 필요로 하는지이며,",
    "요청 유형을 역할 순서로 바꾸는 표가 아니다.",
    "",
    "`consumes`는 배정 전에 충족되어야 하는 전제다. `optional`은 있으면 쓰고 없어도 배정된다.",
    "",
    "| 역할 | capabilities | produces | consumes (전제) | optional (있으면 사용) | mutation_policy |",
    "|------|--------------|----------|-----------------|------------------------|-----------------|",
    ...rows,
    "",
    "환경 입력(생산자가 필요 없는 키): " +
      (manifest.environmentInputs || []).map(function (key) { return "`" + key + "`"; }).join(", "),
    "",
  ];
}

function renderOrchestratorSkillFile(adapter, skillName, projectRoot = cwd) {
  const parsed = parseSkill(skillName);
  const workflow = global ? getDefaultWorkflow() : loadWorkflow(projectRoot);
  const specsRoot = workflow.specsRoot.split(path.sep).join("/");
  const role = loadManifest().roles.find((entry) => entry.name === skillName);
  const description = readFrontmatterField(parsed.frontmatter, "description");
  return [
    "---",
    `name: ${skillName}`,
    `description: ${description}`,
    "---",
    "",
    `# ${adapter.label}: ${skillName}`,
    "",
    `Contract: ${loadManifest().name} · ${skillName} (패키지 제공, 이 프로젝트의 파일 아님)`,
    "",
    ...(role ? renderContractSummary(role) : []),
    ...renderRoleRoster(loadManifest(), skillName),
    parsed.body,
  ]
    .join("\n")
    .split(`${STATE_DIRNAME}/${CANONICAL_SPECS_SUBDIR}`)
    .join(specsRoot);
}

function getOrchestratorRoleName() {
  const manifest = loadManifest();
  const found = manifest.roles.find((entry) => entry.name.endsWith("orchestrator"));
  return found ? found.name : null;
}

function getManagedRoleFiles(adapter, projectRoot = cwd) {
  const paths = getTargetPaths(adapter, projectRoot);
  const scopeRoot = global ? os.homedir() : projectRoot;
  const orchestrator = getOrchestratorRoleName();
  const rolePattern = adapter.roleFilePattern || `{role}/${adapter.fileName}`;
  const skillPattern = adapter.skillFilePattern || `{role}/SKILL.md`;

  return loadManifest().roles.map((role) => {
    const isOrchestratorSkill = adapter.orchestratorAs === "skill" && role.name === orchestrator;
    const baseDir = isOrchestratorSkill ? paths.skillsDir : paths.rolesDir;
    const pattern = isOrchestratorSkill ? skillPattern : rolePattern;
    const relativePath = pattern.split("{role}").join(role.name);
    const filePath = path.join(baseDir, ...relativePath.split("/"));
    const contents = isOrchestratorSkill
      ? renderOrchestratorSkillFile(adapter, role.name, projectRoot)
      : renderTargetRoleFile(adapter, role.name, projectRoot);
    // 1.1.0은 cursor/claude 역할을 `<role>/<fileName>` 키로 기록했다.
    // 1.2.0에서 키가 프로젝트 상대 경로로 바뀌었으므로 구 키를 후보로 남긴다.
    // 이것이 없으면 기존 설치본의 소유권 증명이 전부 실패한다.
    const legacyRelativePaths = [];
    if (adapter.fileName) {
      legacyRelativePaths.push(path.join(role.name, adapter.fileName));
    }
    return {
      roleName: role.name,
      relativePath: getProjectRelativePath(filePath, scopeRoot),
      legacyRelativePaths,
      filePath,
      contents,
    };
  });
}

// 구버전 키까지 훑어 기록된 해시를 찾는다.
function findRecordedHash(recordedFiles, managedFile, exists) {
  if (recordedFiles[managedFile.relativePath]) {
    return recordedFiles[managedFile.relativePath];
  }
  // 파일이 새 경로에 없으면 구 키를 보지 않는다. 그것은 경로 이동이며
  // 소유권 위반이 아니다. 구 경로의 파일은 레거시 계획이 따로 처리한다.
  if (!exists) {
    return null;
  }
  for (const legacyPath of managedFile.legacyRelativePaths || []) {
    if (recordedFiles[legacyPath]) {
      return recordedFiles[legacyPath];
    }
  }
  return null;
}

function getTargetState(state, targetName) {
  return state.targets && state.targets[targetName] ? state.targets[targetName] : null;
}

function setTargetState(state, targetName, files, installedVersion = loadManifest().version, shared = null) {
  const installed = new Set(state.installedTargets || []);
  installed.add(targetName);
  state.schemaVersion = 3;
  state.installedTargets = Array.from(installed);
  state.packageVersion = loadManifest().version;
  state.targets = state.targets || {};
  state.targets[targetName] = {
    installedVersion,
    files,
  };
  if (shared) {
    state.targets[targetName].shared = shared;
  }
}

function removeTargetState(state, targetName, projectRoot = cwd) {
  const installed = new Set(state.installedTargets || []);
  installed.delete(targetName);
  state.installedTargets = Array.from(installed);
  if (state.targets) {
    delete state.targets[targetName];
  }
  state.schemaVersion = 3;
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
    const exists = fs.existsSync(managedFile.filePath);
    const recordedHash = findRecordedHash(recordedFiles, managedFile, exists);
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
  console.error(`\n  ${action} aborted without changes. Resolve the reported ownership or shared-file conflict first.\n`);
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

function getCodexSharedPlan(paths, targetState, action) {
  const previous = (targetState && targetState.shared) || {};
  const configExists = fs.existsSync(paths.configFile);
  const guidanceExists = fs.existsSync(paths.guidanceFile);
  const configContents = configExists ? readText(paths.configFile) : "";
  const guidanceContents = guidanceExists ? readText(paths.guidanceFile) : "";
  const guidanceBlock = readText(path.join(CODEX_PAYLOAD_DIR, "AGENTS.block.md"));
  const scopeRoot = global ? os.homedir() : cwd;

  if (action === "uninstall") {
    const nextConfig = removeManagedConfig(configContents, previous.config);
    const nextGuidance = removeManagedGuidance(guidanceContents, previous.guidance);
    return {
      writes: [
        {
          roleName: "Codex config",
          relativePath: getProjectRelativePath(paths.configFile, scopeRoot),
          filePath: paths.configFile,
          contents: nextConfig,
          removeWhenEmpty: Boolean(previous.config && previous.config.created),
        },
        {
          roleName: "Codex guidance",
          relativePath: getProjectRelativePath(paths.guidanceFile, scopeRoot),
          filePath: paths.guidanceFile,
          contents: nextGuidance,
          removeWhenEmpty: Boolean(previous.guidance && previous.guidance.created),
        },
      ],
      shared: null,
    };
  }

  const configResult = mergeConfig(configContents, previous.config);
  const guidanceResult = mergeGuidance(guidanceContents, guidanceBlock, previous.guidance);
  return {
    writes: [
      {
        roleName: "Codex config",
        relativePath: getProjectRelativePath(paths.configFile, scopeRoot),
        filePath: paths.configFile,
        contents: configResult.contents,
      },
      {
        roleName: "Codex guidance",
        relativePath: getProjectRelativePath(paths.guidanceFile, scopeRoot),
        filePath: paths.guidanceFile,
        contents: guidanceResult.contents,
      },
    ],
    shared: {
      config: { ...configResult.ownership, created: Boolean(previous.config && previous.config.created) || !configExists },
      guidance: {
        ...guidanceResult.ownership,
        created: Boolean(previous.guidance && previous.guidance.created) || !guidanceExists,
      },
    },
  };
}

function findCodexManagedConflicts(managedFiles, targetState, action) {
  const recordedFiles = (targetState && targetState.files) || {};
  const conflicts = [];
  for (const managedFile of managedFiles) {
    const exists = fs.existsSync(managedFile.filePath);
    const currentHash = exists ? sha256(fs.readFileSync(managedFile.filePath)) : null;
    const recordedHash = findRecordedHash(recordedFiles, managedFile, exists);
    const desiredHash = sha256(managedFile.contents);
    if (!exists && !recordedHash) {
      continue;
    }
    if (action !== "uninstall" && currentHash === desiredHash) {
      continue;
    }
    if (recordedHash && currentHash === recordedHash) {
      continue;
    }
    if (force && recordedHash) {
      continue;
    }
    conflicts.push({
      filePath: managedFile.filePath,
      reason: !recordedHash ? "file exists without package ownership" : exists ? "file was modified" : "file is missing",
    });
  }
  return conflicts;
}

// 어댑터의 legacyRolePaths에 남은 구버전 배포 파일을 찾는다.
// 기록된 해시로 소유권이 증명될 때만 제거 대상이고, 그 외에는 충돌로 보고한다.
// 사용자가 손댔을 수 있는 파일을 임의로 지우지 않는다.
function getLegacyRolePlan(adapter, targetState, projectRoot = cwd) {
  const entries = adapter.legacyRolePaths || [];
  const removable = [];
  const conflicts = [];
  if (entries.length === 0) {
    return { removable, conflicts };
  }
  const scopeRoot = global ? os.homedir() : projectRoot;
  const recordedFiles = (targetState && targetState.files) || {};
  const roleNames = loadManifest().roles.map((role) => role.name);

  for (const entry of entries) {
    const patterns = entry.pattern.includes("{role}")
      ? roleNames.map((roleName) => entry.pattern.split("{role}").join(roleName))
      : [entry.pattern];
    for (const relativePattern of patterns) {
      const filePath = path.join(scopeRoot, ...entry.dir.split("/"), ...relativePattern.split("/"));
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const currentHash = sha256(fs.readFileSync(filePath));
      const candidateKeys = [
        getProjectRelativePath(filePath, scopeRoot),
        relativePattern,
        path.join(entry.dir, relativePattern),
      ];
      const proven = candidateKeys.some((key) => recordedFiles[key] && recordedFiles[key] === currentHash);
      if (proven) {
        removable.push({ relativePath: getProjectRelativePath(filePath, scopeRoot), filePath });
      } else {
        conflicts.push({
          filePath,
          reason: "legacy role file ownership cannot be proven; review and remove it manually",
        });
      }
    }
  }
  return { removable, conflicts };
}

function removeLegacyRoleFiles(plan) {
  for (const legacyFile of plan.removable) {
    fs.rmSync(legacyFile.filePath, { force: true });
    removeDirIfEmpty(path.dirname(legacyFile.filePath));
  }
}

function getLegacyCodexPlan(targetState, projectRoot = cwd) {
  const scopeRoot = global ? os.homedir() : projectRoot;
  const legacySkillsDir = path.join(scopeRoot, ".codex", "skills");
  const recordedFiles = (targetState && targetState.files) || {};
  const removable = [];
  const conflicts = [];
  for (const role of loadManifest().roles) {
    const relativePath = path.join(role.name, "AGENT.md");
    const filePath = path.join(legacySkillsDir, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const currentHash = sha256(fs.readFileSync(filePath));
    const recordedHash = recordedFiles[relativePath];
    const expectedHash = sha256(renderLegacyCodexRoleFile(role.name, projectRoot));
    const knownV1Hash = KNOWN_CODEX_V1_LEGACY_HASHES[relativePath];
    if ((recordedHash && currentHash === recordedHash) || currentHash === expectedHash || currentHash === knownV1Hash) {
      removable.push({ roleName: role.name, relativePath, filePath });
    } else {
      conflicts.push({ filePath, reason: "legacy Codex file is modified or ownership cannot be proven" });
    }
  }
  return { removable, conflicts, legacySkillsDir };
}

function removeLegacyCodexFiles(plan) {
  for (const legacyFile of plan.removable) {
    fs.rmSync(legacyFile.filePath, { force: true });
    removeDirIfEmpty(path.dirname(legacyFile.filePath));
  }
  removeDirIfEmpty(plan.legacySkillsDir);
}

function applyCodexWrites(writes) {
  const nonEmpty = writes.filter((entry) => !(entry.removeWhenEmpty && entry.contents.trim() === ""));
  writeManagedFilesAtomically(nonEmpty);
  for (const entry of writes) {
    if (entry.removeWhenEmpty && entry.contents.trim() === "" && fs.existsSync(entry.filePath)) {
      fs.rmSync(entry.filePath, { force: true });
      removeDirIfEmpty(path.dirname(entry.filePath));
    }
  }
}

function installCodex(adapter) {
  const paths = getTargetPaths(adapter);
  const state = loadInstallState();
  const targetState = getTargetState(state, "codex");
  const managedFiles = getManagedRoleFiles(adapter);
  const conflicts = findCodexManagedConflicts(managedFiles, targetState, "install");
  const legacyPlan = getLegacyCodexPlan(targetState);
  conflicts.push(...legacyPlan.conflicts);
  let sharedPlan;
  try {
    sharedPlan = getCodexSharedPlan(paths, targetState, "install");
  } catch (error) {
    conflicts.push({ filePath: paths.configFile, reason: error.message });
  }
  if (conflicts.length > 0) {
    printConflicts(conflicts, "Codex install");
    process.exit(1);
  }
  if (!global) {
    ensureWorkflow();
  }

  console.log("\n  Codex Adapter Installer\n");
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log("  Target: codex\n");
  applyCodexWrites([...managedFiles, ...sharedPlan.writes]);
  removeLegacyCodexFiles(legacyPlan);
  setTargetState(state, "codex", hashManagedFiles(managedFiles), loadManifest().version, sharedPlan.shared);
  saveInstallState(state);
  for (const managedFile of managedFiles) {
    console.log(`  [installed] ${managedFile.roleName}`);
  }
  console.log(`  [merged] ${path.relative(global ? os.homedir() : cwd, paths.configFile)}`);
  console.log(`  [merged] ${path.relative(global ? os.homedir() : cwd, paths.guidanceFile)}`);
  if (legacyPlan.removable.length > 0) {
    console.log(`  [migrated] ${legacyPlan.removable.length} legacy Codex role file(s) removed`);
  }
  console.log("\n  Done: Codex orchestration is installed. Start a new trusted-project session to load it.\n");
}

function install() {
  const adapter = loadAdapter(target);
  if (adapter.target === "codex") {
    installCodex(adapter);
    return;
  }
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
      console.log(`  [skip] ${managedFile.roleName} (${managedFile.relativePath} already exists)`);
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
    if (targetName === "codex") {
      const targetState = getTargetState(state, targetName);
      conflicts.push(...findCodexManagedConflicts(managedFiles, targetState, "update"));
      const legacyPlan = getLegacyCodexPlan(targetState);
      conflicts.push(...legacyPlan.conflicts);
      const legacyRolePlan = getLegacyRolePlan(adapter, targetState);
      let sharedPlan;
      try {
        sharedPlan = getCodexSharedPlan(getTargetPaths(adapter), targetState, "update");
      } catch (error) {
        conflicts.push({ filePath: getTargetPaths(adapter).configFile, reason: error.message });
      }
      batches.push({ adapter, managedFiles, sharedPlan, legacyPlan, legacyRolePlan });
    } else {
      const targetState = getTargetState(state, targetName);
      if (!force) {
        conflicts.push(...findManagedFileConflicts(managedFiles, targetState));
      }
      batches.push({ adapter, managedFiles, legacyRolePlan: getLegacyRolePlan(adapter, targetState) });
    }
  }

  if (conflicts.length > 0) {
    printConflicts(conflicts, "Update");
    process.exit(1);
  }
  if (!global) {
    ensureWorkflow();
  }

  console.log("\n  Agent Workflow Update\n");
  writeManagedFilesAtomically(
    batches
      .filter((batch) => batch.adapter.target !== "codex")
      .flatMap((batch) => batch.managedFiles)
  );
  for (const batch of batches.filter((entry) => entry.adapter.target === "codex")) {
    applyCodexWrites([...batch.managedFiles, ...batch.sharedPlan.writes]);
    removeLegacyCodexFiles(batch.legacyPlan);
  }
  for (const batch of batches) {
    if (batch.legacyRolePlan) {
      removeLegacyRoleFiles(batch.legacyRolePlan);
    }
  }
  for (const batch of batches) {
    setTargetState(
      state,
      batch.adapter.target,
      hashManagedFiles(batch.managedFiles),
      loadManifest().version,
      batch.sharedPlan ? batch.sharedPlan.shared : null
    );
    console.log(`  [updated] ${batch.adapter.target}: ${batch.managedFiles.length} role file(s)`);
    if (batch.legacyPlan && batch.legacyPlan.removable.length > 0) {
      console.log(`  [migrated] codex: ${batch.legacyPlan.removable.length} legacy role file(s) removed`);
    }
    if (batch.legacyRolePlan && batch.legacyRolePlan.removable.length > 0) {
      console.log(
        `  [migrated] ${batch.adapter.target}: ${batch.legacyRolePlan.removable.length} legacy role file(s) removed`
      );
    }
    // 소유권이 증명되지 않은 구 파일은 지우지 않고 경로만 알린다.
    // 이미 로드되지 않는 파일이므로 갱신 전체를 막을 이유가 없다.
    for (const leftover of (batch.legacyRolePlan && batch.legacyRolePlan.conflicts) || []) {
      console.log(`  [kept] ${path.relative(cwd, leftover.filePath)} (${leftover.reason})`);
    }
  }
  saveInstallState(state);
  console.log(`\n  Done: ${batches.length} target(s) updated to ${loadManifest().version}.\n`);
}

function uninstall() {
  const adapter = loadAdapter(target);
  if (adapter.target === "codex") {
    uninstallCodex(adapter);
    return;
  }
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

  // 구 경로에 남은 패키지 소유 파일도 함께 정리한다.
  // 증명되지 않은 파일은 남기고 경로만 알린다.
  const legacyRolePlan = getLegacyRolePlan(adapter, targetState);
  removeLegacyRoleFiles(legacyRolePlan);
  if (legacyRolePlan.removable.length > 0) {
    console.log(`  [removed] ${legacyRolePlan.removable.length} legacy role file(s)`);
  }
  for (const leftover of legacyRolePlan.conflicts) {
    console.log(`  [kept] ${path.relative(cwd, leftover.filePath)} (${leftover.reason})`);
  }

  removeDirIfEmpty(paths.rolesDir);
  removeDirIfEmpty(paths.skillsDir);
  removeTargetState(state, adapter.target);

  console.log(`\n  Done: ${removed} roles removed.\n`);
}

function uninstallCodex(adapter) {
  const paths = getTargetPaths(adapter);
  const state = loadInstallState();
  const targetState = getTargetState(state, "codex");
  const managedFiles = getManagedRoleFiles(adapter);
  const hasAny = managedFiles.some((entry) => fs.existsSync(entry.filePath));
  if (!targetState && !hasAny) {
    console.log("\n  Codex Adapter Uninstaller\n\n  Done: Codex orchestration was not installed.\n");
    return;
  }
  const conflicts = findCodexManagedConflicts(managedFiles, targetState, "uninstall");
  const legacyPlan = getLegacyCodexPlan(targetState);
  conflicts.push(...legacyPlan.conflicts);
  let sharedPlan;
  try {
    sharedPlan = getCodexSharedPlan(paths, targetState, "uninstall");
  } catch (error) {
    conflicts.push({ filePath: paths.configFile, reason: error.message });
  }
  if (conflicts.length > 0) {
    printConflicts(conflicts, "Codex uninstall");
    process.exit(1);
  }

  console.log("\n  Codex Adapter Uninstaller\n");
  console.log(`  Scope: ${getScopeLabel(adapter)}`);
  console.log("  Target: codex\n");
  for (const managedFile of managedFiles) {
    if (fs.existsSync(managedFile.filePath)) {
      fs.rmSync(managedFile.filePath, { force: true });
      removeDirIfEmpty(path.dirname(managedFile.filePath));
      console.log(`  [removed] ${managedFile.roleName}`);
    }
  }
  applyCodexWrites(sharedPlan.writes);
  removeLegacyCodexFiles(legacyPlan);
  removeDirIfEmpty(paths.skillsDir);
  removeDirIfEmpty(paths.agentsDir);
  removeTargetState(state, "codex");
  console.log("\n  Done: Codex-owned files and shared-file entries were removed.\n");
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
    console.log(`    roles: ${projectPaths.rolesDir}`);
    if (projectPaths.skillsDir !== projectPaths.rolesDir) {
      console.log(`    skills: ${projectPaths.skillsDir}`);
    }
    console.log(`    specs: ${projectPaths.specsDir}`);
    for (const managedFile of getManagedRoleFiles(adapter)) {
      const status = fs.existsSync(managedFile.filePath) ? "installed" : "-";
      console.log(`    ${managedFile.roleName} (${status})`);
    }
    if (adapter.target === "codex") {
      console.log(`    config: ${projectPaths.configFile}`);
      console.log(`    guidance: ${projectPaths.guidanceFile}`);
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
  if (!loadManifest().roles.some((entry) => entry.name === value)) {
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
  if (selectedRole && !loadManifest().roles.some((entry) => entry.name === selectedRole)) {
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

// 역할 의존성 그래프. 간선은 consumes(전제)로만 만든다.
// optionalConsumes는 없어도 배정되므로 교착을 만들지 않는다.
function buildRoleGraph(manifest) {
  const environmentInputs = manifest.environmentInputs || [];
  const producers = new Map();
  for (const role of manifest.roles) {
    for (const key of role.produces || []) {
      if (!producers.has(key)) {
        producers.set(key, []);
      }
      producers.get(key).push(role.name);
    }
  }
  const edges = new Map();
  for (const role of manifest.roles) {
    const upstream = new Set();
    for (const key of role.consumes || []) {
      if (environmentInputs.includes(key)) {
        continue;
      }
      for (const producer of producers.get(key) || []) {
        if (producer !== role.name) {
          upstream.add(producer);
        }
      }
    }
    edges.set(role.name, Array.from(upstream));
  }
  return { edges, producers, environmentInputs };
}

// 필수 간선에 순환이 있으면 관련 역할이 영원히 배정되지 않는다.
function findGraphCycles(edges) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  function visit(name) {
    if (state.get(name) === "done") {
      return;
    }
    if (state.get(name) === "open") {
      const start = stack.indexOf(name);
      cycles.push(stack.slice(start).concat(name).join(" <- "));
      return;
    }
    state.set(name, "open");
    stack.push(name);
    for (const upstream of edges.get(name) || []) {
      visit(upstream);
    }
    stack.pop();
    state.set(name, "done");
  }
  for (const name of edges.keys()) {
    visit(name);
  }
  return cycles;
}

// 환경 입력에서 출발해 고정점까지 배정 가능한 역할을 넓힌다.
// 끝까지 들어오지 못한 역할은 어떤 경로로도 배정되지 않는다.
function findDispatchOrder(manifest) {
  const environmentInputs = manifest.environmentInputs || [];
  const available = new Set(environmentInputs);
  const order = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const role of manifest.roles) {
      if (order.includes(role.name)) {
        continue;
      }
      const ready = (role.consumes || []).every(function (key) {
        return available.has(key);
      });
      if (!ready) {
        continue;
      }
      order.push(role.name);
      for (const key of role.produces || []) {
        available.add(key);
      }
      changed = true;
    }
  }
  const unreachable = manifest.roles
    .map(function (role) { return role.name; })
    .filter(function (name) { return !order.includes(name); });
  return { order, unreachable };
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
    // 역할이 언제 시작하고 언제 끝나고 언제 멈추는지를 계약에 강제한다.
    // 자율 실행에서 가장 큰 실패 모드는 멈춤이 아니라 잘못된 방향으로 오래 달리는 것이다.
    "## Activation",
    "## Done Criteria",
    "## Stop Conditions",
    "## Handoff Contract",
    ...HANDOFF_ENVELOPE_FIELDS,
  ];

  for (const token of requiredTokens) {
    if (!contents.includes(token)) {
      failures.push(`skills/${skillName}/SKILL.md missing token: ${token}`);
    }
  }

  if (!contents.includes(`from: ${skillName}`)) {
    failures.push(`skills/${skillName}/SKILL.md handoff envelope must declare from: ${skillName}`);
  }

  // D2/1.7: 고정 라우팅 표가 계약에 다시 스며드는 것을 막는다.
  // "role-a -> role-b" 같은 체인 표기가 있으면 의존성 해소가 아니라 표가 된다.
  const chainPattern = /role-[a-z]+\s*(->|→)\s*role-[a-z]+/;
  if (chainPattern.test(contents)) {
    failures.push(
      `skills/${skillName}/SKILL.md contains a hardcoded role chain; dispatch must be computed from declarations (D2)`
    );
  }

  // D16: 역할은 다음 역할을 지명하지 않는다. 막힌 조건과 필요한 능력만 기술하고
  // 배정은 오케스트레이터가 한다. 고정 라우팅이 계약에 다시 스며드는 것을 막는다.
  const stopSection = contents.match(/## Stop Conditions\n[\s\S]*?(?=\n## |$)/);
  if (stopSection) {
    const namedRoles = Array.from(new Set(stopSection[0].match(/role-[a-z]+/g) || [])).filter(
      (name) => name !== skillName
    );
    for (const namedRole of namedRoles) {
      failures.push(
        `skills/${skillName}/SKILL.md Stop Conditions names another role (${namedRole}); describe the needed capability instead`
      );
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

  for (const field of ["roleFilePattern", "roleFormat", "permissions"]) {
    if (!adapter[field]) {
      failures.push(`adapter ${adapter.target} is missing ${field}`);
    }
  }
  for (const scopeName of ["projectPaths", "globalPaths"]) {
    for (const field of ["rolesDir", "skillsDir", "specsDir"]) {
      if (!adapter[scopeName] || !adapter[scopeName][field]) {
        failures.push(`adapter ${adapter.target} ${scopeName} is missing ${field}`);
      }
    }
  }
  for (const policy of ["none", "docs-only", "implementation"]) {
    if (!adapter.permissions || !adapter.permissions[policy]) {
      failures.push(`adapter ${adapter.target} has no permission mapping for ${policy}`);
    }
  }

  // 도구 바인딩: 매핑을 선언했으면 manifest의 모든 추상 도구가 키로 있어야 한다.
  // 매핑하지 않기로 했다면 그 사실과 이유를 남긴다. 조용한 누락을 허용하지 않는다.
  const declaredTools = new Set();
  for (const role of manifest.roles) {
    for (const toolName of [...(role.requiredTools || []), ...(role.optionalTools || [])]) {
      declaredTools.add(toolName);
    }
  }
  if (adapter.tools) {
    for (const toolName of declaredTools) {
      if (!Object.prototype.hasOwnProperty.call(adapter.tools, toolName)) {
        failures.push(`adapter ${adapter.target} has no tool mapping entry for ${toolName}`);
      }
    }
    for (const toolName of Object.keys(adapter.tools)) {
      if (!declaredTools.has(toolName)) {
        failures.push(`adapter ${adapter.target} maps an unknown tool: ${toolName}`);
      }
    }
  } else if (!adapter.toolBindingNote) {
    failures.push(`adapter ${adapter.target} declares no tool mapping and no toolBindingNote explaining why`);
  }

  // mutationPolicy: none은 저장소를 바꿀 수 없다는 보장이다. 쓰기 가능한 네이티브
  // 도구가 하나라도 붙으면 그 보장이 깨진다. Bash 한 줄이면 무엇이든 쓸 수 있다.
  if (adapter.tools && Array.isArray(adapter.writeCapableTools)) {
    for (const role of manifest.roles.filter((entry) => entry.mutationPolicy === "none")) {
      const resolved = resolveRoleTools(adapter, role);
      for (const granted of resolved.granted) {
        if (adapter.writeCapableTools.includes(granted)) {
          failures.push(
            `adapter ${adapter.target} grants write-capable tool ${granted} to ${role.name} (mutationPolicy: none)`
          );
        }
      }
    }
  }
  if (adapter.target === "codex") {
    for (const field of ["agentsDir", "configFile", "guidanceFile"]) {
      for (const scopeName of ["projectPaths", "globalPaths"]) {
        if (!adapter[scopeName] || !adapter[scopeName][field]) {
          failures.push(`adapter codex ${scopeName} is missing ${field}`);
        }
      }
    }
    try {
      mergeConfig(readText(path.join(CODEX_PAYLOAD_DIR, "config.toml")));
    } catch (error) {
      failures.push(`Codex config payload is invalid: ${error.message}`);
    }
    const guidanceBlock = readText(path.join(CODEX_PAYLOAD_DIR, "AGENTS.block.md"));
    for (const role of manifest.roles) {
      if (!guidanceBlock.includes(role.name)) {
        failures.push(`Codex AGENTS block does not mention role: ${role.name}`);
      }
    }
  }
  if (failures.length > 0) {
    return failures;
  }

  const orchestrator = manifest.roles.find((entry) => entry.name.endsWith("orchestrator"));
  const renderedPaths = new Set();

  for (const role of manifest.roles) {
    const isOrchestratorSkill = adapter.orchestratorAs === "skill" && orchestrator && role.name === orchestrator.name;
    const rendered = isOrchestratorSkill
      ? renderOrchestratorSkillFile(adapter, role.name)
      : renderTargetRoleFile(adapter, role.name);

    for (const output of role.requiredOutputs) {
      if (!rendered.includes(output)) {
        failures.push(`adapter ${adapter.target} render for ${role.name} missing output key: ${output}`);
      }
    }

    const format = isOrchestratorSkill ? "markdown-frontmatter" : adapter.roleFormat;
    if (format === "passthrough") {
      if (!rendered.includes("name:")) {
        failures.push(`adapter ${adapter.target} render for ${role.name} must preserve source frontmatter`);
      }
    } else if (format === "markdown-frontmatter") {
      if (!rendered.startsWith("---\n")) {
        failures.push(`adapter ${adapter.target} render for ${role.name} must start with YAML frontmatter`);
      }
      if (!rendered.includes(`name: ${role.name}\n`)) {
        failures.push(`adapter ${adapter.target} render for ${role.name} missing name field`);
      }
      if (!/\ndescription: \S/.test(rendered)) {
        failures.push(`adapter ${adapter.target} render for ${role.name} has an empty description`);
      }
    } else if (format === "toml") {
      for (const token of [`name = "${role.name}"`, "description = \"", "developer_instructions = \"\"\""]) {
        if (!rendered.includes(token)) {
          failures.push(`adapter ${adapter.target} render for ${role.name} missing TOML key: ${token.trim()}`);
        }
      }
      if (!/\ndescription = "\S/.test(rendered)) {
        failures.push(`adapter ${adapter.target} render for ${role.name} has an empty TOML description`);
      }
      // 이스케이프되지 않은 TOML 여러 줄 구분자가 남으면 파싱이 깨진다.
      if ((rendered.match(/(?<!\\)"""/g) || []).length !== 2) {
        failures.push(`adapter ${adapter.target} render for ${role.name} has unbalanced TOML multiline delimiters`);
      }
    }

    // 도구 가용성은 ## Tools 표가 사실로 알려준다. 렌더링 결과에 추론을 요구하는
    // 조건문이 남아 있으면 에이전트가 자기 도구 가용성을 짐작하게 된다.
    for (const phrase of ["사용 가능:", "사용 불가"]) {
      if (rendered.includes(phrase)) {
        failures.push(
          `adapter ${adapter.target} render for ${role.name} still contains a tool-availability conditional: ${phrase}`
        );
      }
    }

    if (!isOrchestratorSkill) {
      const permissions = adapter.permissions[role.mutationPolicy] || {};
      for (const key of Object.keys(permissions)) {
        if (!rendered.includes(key)) {
          failures.push(`adapter ${adapter.target} render for ${role.name} missing permission key: ${key}`);
        }
      }
    }

    const pattern = isOrchestratorSkill
      ? adapter.skillFilePattern || "{role}/SKILL.md"
      : adapter.roleFilePattern;
    renderedPaths.add(pattern.split("{role}").join(role.name));
  }

  if (renderedPaths.size !== manifest.roles.length) {
    failures.push(
      `adapter ${adapter.target} produces ${renderedPaths.size} file path(s) for ${manifest.roles.length} role(s)`
    );
  }

  return failures;
}


function validate() {
  console.log("\n  Agent Workflow Validation\n");

  const failures = [];
  const manifest = loadManifest();

  if (!Array.isArray(manifest.roles) || manifest.roles.length === 0) {
    failures.push("agent-workflow.manifest.json must declare at least one role");
  }

  for (const role of manifest.roles) {
    if (!Array.isArray(role.consumes) || !Array.isArray(role.produces)) {
      failures.push(`manifest role ${role.name} must declare consumes and produces`);
    } else {
      for (const output of role.produces) {
        if (!role.requiredOutputs.includes(output)) {
          failures.push(`manifest role ${role.name} produces a key that is not a required output: ${output}`);
        }
      }
    }
    // capabilities는 D16의 능력 어휘만 쓴다. 계약의 "필요한 것"과 같은 값이어야
    // 오케스트레이터가 반환된 needs를 역할로 해소할 수 있다.
    for (const capability of role.capabilities || []) {
      if (!CAPABILITY_VOCABULARY.includes(capability)) {
        failures.push(`manifest role ${role.name} declares an unknown capability: ${capability}`);
      }
    }
    if (!Array.isArray(role.skills)) {
      failures.push(`manifest role ${role.name} must declare a skills array (D14)`);
    }
    if (role.toolPolicy !== "deny-by-default") {
      failures.push(`manifest role ${role.name} must declare toolPolicy: deny-by-default`);
    }
    // mutation_policy: none인 역할이 쓰기 도구를 선언하면 계약과 권한이 어긋난다.
    if (role.mutationPolicy === "none") {
      for (const toolName of [...(role.requiredTools || []), ...(role.optionalTools || [])]) {
        if (toolName === "file_edit") {
          failures.push(`manifest role ${role.name} has mutationPolicy none but declares ${toolName}`);
        }
      }
    }
    failures.push(...validateSkill(role.name, role));
  }

  // 의존성 그래프: 소비하는 키는 환경 입력이거나 어떤 역할이 생산해야 한다.
  const producedKeys = new Set();
  for (const role of manifest.roles) {
    for (const key of role.produces || []) {
      producedKeys.add(key);
    }
  }
  const environmentInputs = manifest.environmentInputs || [];
  for (const role of manifest.roles) {
    for (const key of role.consumes || []) {
      if (!producedKeys.has(key) && !environmentInputs.includes(key)) {
        failures.push(`manifest role ${role.name} consumes ${key} but no role produces it`);
      }
    }
  }

  // 필수 간선의 순환과 도달 불가 역할을 검사한다. 역할이 10개를 넘으면
  // 손으로는 맞출 수 없는 영역이다.
  const graph = buildRoleGraph(manifest);
  for (const cycle of findGraphCycles(graph.edges)) {
    failures.push(`manifest role dependency cycle: ${cycle}`);
  }
  const dispatch = findDispatchOrder(manifest);
  for (const name of dispatch.unreachable) {
    failures.push(
      `manifest role ${name} can never be dispatched; its consumes are not reachable from environment inputs`
    );
  }

  // 제공자가 없는 능력은 실패가 아니라 알려진 공백으로 보고한다.
  const providedCapabilities = new Set();
  for (const role of manifest.roles) {
    for (const capability of role.capabilities || []) {
      providedCapabilities.add(capability);
    }
  }
  const uncovered = CAPABILITY_VOCABULARY.filter(function (capability) {
    return !providedCapabilities.has(capability);
  });

  for (const adapter of loadAllAdapters()) {
    failures.push(...validateAdapter(adapter, manifest));
  }

  const packageJson = readJson(path.join(ROOT_DIR, "package.json"));
  if (packageJson.version !== manifest.version) {
    failures.push(
      `package.json version (${packageJson.version}) must match manifest version (${manifest.version})`
    );
  }
  for (const requiredEntry of ["templates/", "skills/", "payloads/", "agent-workflow.manifest.json", "adapters/"]) {
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

  const handoffTemplatePath = path.join(TEMPLATES_DIR, "handoff-template.md");
  if (fs.existsSync(handoffTemplatePath)) {
    const handoffTemplate = readText(handoffTemplatePath);
    for (const field of HANDOFF_ENVELOPE_FIELDS) {
      if (!handoffTemplate.includes(field)) {
        failures.push(`templates/handoff-template.md is missing envelope field: ${field}`);
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`  [fail] ${failure}`);
    }
    console.error(`\n  Validation failed: ${failures.length} issue(s).\n`);
    process.exit(1);
  }

  console.log("  [ok] core roles, adapters, and package metadata are consistent.");
  if (uncovered.length > 0) {
    console.log(`  [gap] no role provides: ${uncovered.join(", ")} (expected until new roles are added)`);
  }
  console.log(`  [graph] ${dispatch.order.length} role(s) reachable, no dependency cycles`);
  console.log("");
}

function getCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function realPathOrSelf(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch (error) {
    return path.resolve(targetPath);
  }
}

// ~/.codex/config.toml의 [projects."<path>"] trust_level = "trusted" 항목을 모은다.
// 전체 TOML 파싱이 아니라 섹션 헤더와 해당 키만 훑는다.
// 읽을 수 없으면 null을 반환한다. 빈 배열(신뢰 없음)과 구분해야 한다.
function readCodexTrustedPaths() {
  const configPath = path.join(getCodexHome(), "config.toml");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  let contents;
  try {
    contents = readText(configPath);
  } catch (error) {
    return null;
  }
  const trusted = [];
  let currentProject = null;
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    const section = line.match(/^\[projects\."(.+)"\]$/);
    if (section) {
      currentProject = section[1];
      continue;
    }
    if (line.startsWith("[")) {
      currentProject = null;
      continue;
    }
    if (currentProject && /^trust_level\s*=\s*"trusted"$/.test(line)) {
      trusted.push(currentProject);
      currentProject = null;
    }
  }
  return trusted;
}

// trust는 하위 디렉터리로 상속된다 (2026-09-20 실측, HARNESS_CAPABILITIES 9절).
function findCodexTrustAnchor(projectRoot, trustedPaths) {
  const resolved = realPathOrSelf(projectRoot);
  let best = null;
  for (const trustedPath of trustedPaths) {
    const base = realPathOrSelf(trustedPath);
    if (resolved === base || resolved.startsWith(base + path.sep)) {
      if (!best || base.length > best.length) {
        best = base;
      }
    }
  }
  return best;
}

function doctor() {
  const adapter = loadAdapter(target);
  const findings = [];
  const packageJsonPath = path.join(cwd, "package.json");
  const workflow = global ? null : loadWorkflow();
  const paths = getTargetPaths(adapter);

  if (adapter.target === "codex") {
    const codexFiles = getManagedRoleFiles(adapter);
    const orchestratorName = getOrchestratorRoleName();
    const skillFiles = codexFiles.filter((entry) => entry.roleName === orchestratorName);
    const agentFiles = codexFiles.filter((entry) => entry.roleName !== orchestratorName);
    const skillsOk = skillFiles.every((entry) => fs.existsSync(entry.filePath));
    const agentsOk = agentFiles.every((entry) => fs.existsSync(entry.filePath));
    if (!global) {
      // .codex/ 레이어 전체(config + agents)가 프로젝트 trust 뒤에 있다.
      // 신뢰되지 않으면 파일이 올바르게 설치되어도 Codex가 읽지 않는다.
      const trustedPaths = readCodexTrustedPaths();
      if (trustedPaths === null) {
        findings.push({
          label: "codex project trust",
          ok: false,
          detail: `cannot read ${path.join(getCodexHome(), "config.toml")} (open the project in Codex once and trust it)`,
        });
      } else {
        const anchor = findCodexTrustAnchor(cwd, trustedPaths);
        findings.push({
          label: "codex project trust",
          ok: Boolean(anchor),
          detail: anchor
            ? `trusted via ${anchor}`
            : "not trusted; Codex skips .codex/ entirely, so custom agents and config will not load. Open this project in Codex once and choose to trust it",
        });
      }
    }
    findings.push({
      label: `${global ? adapter.globalPaths.skillsDir : adapter.projectPaths.skillsDir}`,
      ok: skillsOk,
      detail: skillsOk ? `${orchestratorName} present` : "missing (run install)",
    });
    findings.push({
      label: `${global ? adapter.globalPaths.agentsDir : adapter.projectPaths.agentsDir}`,
      ok: agentsOk,
      detail: agentsOk
        ? `${agentFiles.length} custom agent(s) present`
        : "one or more custom agents are missing",
    });
    let configOk = false;
    try {
      const result = mergeConfig(fs.existsSync(paths.configFile) ? readText(paths.configFile) : "");
      configOk = result.ownership.addedKeys.length === 0;
    } catch (error) {
      configOk = false;
    }
    findings.push({
      label: `${global ? adapter.globalPaths.configFile : adapter.projectPaths.configFile}`,
      ok: configOk,
      detail: configOk ? "multi-agent settings present" : "missing or conflicting multi-agent settings",
    });
    const guidance = fs.existsSync(paths.guidanceFile) ? readText(paths.guidanceFile) : "";
    findings.push({
      label: `${global ? adapter.globalPaths.guidanceFile : adapter.projectPaths.guidanceFile}`,
      ok: guidance.includes("<!-- BEGIN agent-workflow-orchestration:codex -->"),
      detail: guidance.includes("<!-- BEGIN agent-workflow-orchestration:codex -->")
        ? "managed orchestration guidance present"
        : "managed orchestration guidance missing",
    });
  } else {
    findings.push({
      label: `${adapter.projectPaths.skillsDir}`,
      ok: fs.existsSync(paths.skillsDir),
      detail: fs.existsSync(paths.skillsDir) ? "present" : "missing (run install)",
    });
  }
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
    install    Install managed runtime files for a target adapter
    update     Safely update recorded target files and managed shared entries
    uninstall  Remove package-owned target files and managed shared entries
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
    --global   Use the target's global home-directory scope
    --force    Replace recorded package-owned full files; never overwrite unowned shared content
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
