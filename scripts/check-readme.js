const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const readmeKo = fs.readFileSync(path.join(root, "docs", "README.ko.md"), "utf8");
const changelogKo = fs.readFileSync(path.join(root, "docs", "CHANGELOG.ko.md"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const expectedStrings = [
  packageJson.name,
  "--target cursor",
  "--target codex",
  "--target claude",
  "feature --target",
  "articulate.md",
  "designs.md",
  "specs.md",
  "agent-workflow.manifest.json",
  ".agent-workflow/state.json",
  "docs/README.ko.md",
  "role-orchestrator",
];

const expectedKoreanStrings = [
  packageJson.name,
  "--target cursor",
  "--target codex",
  "--target claude",
  "feature --target",
  "articulate.md",
  "designs.md",
  "specs.md",
  "agent-workflow.manifest.json",
  ".agent-workflow/state.json",
  "../README.md",
  "role-orchestrator",
];

const expectedKoreanChangelogStrings = [
  "변경 이력",
  "ADS",
  "feature --name",
  "README.ko.md",
];

const missing = expectedStrings.filter((token) => !readme.includes(token));
const missingKo = expectedKoreanStrings.filter((token) => !readmeKo.includes(token));
const missingChangelogKo = expectedKoreanChangelogStrings.filter((token) => !changelogKo.includes(token));

if (missing.length > 0) {
  console.error("README is missing expected tokens:");
  for (const token of missing) {
    console.error(`- ${token}`);
  }
  process.exit(1);
}

if (missingKo.length > 0) {
  console.error("README.ko.md is missing expected tokens:");
  for (const token of missingKo) {
    console.error(`- ${token}`);
  }
  process.exit(1);
}

if (missingChangelogKo.length > 0) {
  console.error("docs/CHANGELOG.ko.md is missing expected tokens:");
  for (const token of missingChangelogKo) {
    console.error(`- ${token}`);
  }
  process.exit(1);
}

console.log("README command references are in sync.");
