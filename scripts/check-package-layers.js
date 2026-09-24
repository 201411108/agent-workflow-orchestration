"use strict";

// 배포 레이어 경계 검사 (D10).
//
// 워크플로를 개발하는 코드(레이어 1)와 소비자에게 배포되는 코드(레이어 2)가
// 실제 npm 산출물에서 분리되는지 확인한다. 계약으로만 정해두면 지켜지지 않는다.
//
// 양방향으로 본다.
//   - 개발 파일이 배포에 섞이면 실패한다
//   - 런타임에 필요한 파일이 빠지면 실패한다 (이쪽이 더 위험하다)

const { spawnSync } = require("child_process");
const path = require("path");

// 레이어 1: 저장소를 개발할 때만 쓰는 것. 배포되면 안 된다.
const DEVELOPMENT_ONLY = [
  "docs/development/",
  "docs/operations/",
  "tests/",
  "scripts/",
  "CLAUDE.md",
  "AGENTS.md",
  ".github/",
];

// 레이어 2: bin/cli.js가 실행 중 읽는 경로. 빠지면 소비자에게서 깨진다.
const REQUIRED_RUNTIME = [
  "bin/cli.js",
  "bin/codex-managed.js",
  "agent-workflow.manifest.json",
  "adapters/claude.json",
  "adapters/codex.json",
  "adapters/cursor.json",
  "payloads/codex/AGENTS.block.md",
  "payloads/codex/config.toml",
  "templates/handoff-template.md",
  "templates/articulate-template.md",
  "templates/designs-template.md",
  "templates/development-spec-template.md",
  "templates/verification-template.md",
  "templates/change-template.md",
  "templates/decision-template.md",
  "templates/specs-readme.md",
];

function listPackedFiles() {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    throw new Error("npm pack --dry-run failed");
  }
  const start = result.stdout.indexOf("[");
  const parsed = JSON.parse(result.stdout.slice(start));
  return parsed[0].files.map(function (entry) {
    return entry.path;
  });
}

const packed = listPackedFiles();
const failures = [];

for (const file of packed) {
  for (const prefix of DEVELOPMENT_ONLY) {
    if (file === prefix || file.indexOf(prefix) === 0) {
      failures.push(`development file is published: ${file} (matches ${prefix})`);
    }
  }
}

// 모든 역할 계약이 배포되어야 한다. 하나라도 빠지면 그 역할이 설치되지 않는다.
const manifest = require(path.join(__dirname, "..", "agent-workflow.manifest.json"));
const roles = manifest.roles || manifest.skills || [];
for (const role of roles) {
  const expected = `skills/${role.name}/SKILL.md`;
  if (packed.indexOf(expected) === -1) {
    failures.push(`role contract is missing from the package: ${expected}`);
  }
}

for (const required of REQUIRED_RUNTIME) {
  if (packed.indexOf(required) === -1) {
    failures.push(`runtime file is missing from the package: ${required}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`  [fail] ${failure}`);
  }
  console.error(`\n  Package layer check failed: ${failures.length} issue(s).\n`);
  process.exit(1);
}

console.log(`Package layer check passed. ${packed.length} file(s), ${roles.length} role contract(s).`);
