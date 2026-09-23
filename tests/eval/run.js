"use strict";

// 동작 검증 실행기 (ROADMAP 1.6).
//
// 실제 에이전트를 돌리므로 비용과 시간이 든다. CI에서 돌리지 않는다.
//   npm run eval                  전체 케이스 1회
//   npm run eval -- --runs 5      케이스마다 5회 (통과율 판정)
//   npm run eval -- --case R2     한 케이스만
//   npm run eval -- --dry-run     모델 호출 없이 배선만 확인
//
// 판정은 judge.js가 한다. 이 파일은 실행과 관찰만 담당한다.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const judge = require("./judge");

const ROOT = path.join(__dirname, "..", "..");
const CASES_DIR = path.join(__dirname, "cases");
const HISTORY_DIR = path.join(ROOT, "docs", "development", "eval-history");
const CLI = path.join(ROOT, "bin", "cli.js");

function arg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  if (index === -1) {
    return fallback;
  }
  const next = process.argv[index + 1];
  return next && next.indexOf("--") !== 0 ? next : true;
}

// 케이스 frontmatter 전용 최소 파서.
function parseCase(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error("케이스에 frontmatter가 없다");
  }
  const spec = { setup: { files: {} }, expect: {} };
  let section = null;
  let subsection = null;
  for (const raw of match[1].split("\n")) {
    if (raw.trim() === "") continue;
    const indent = raw.length - raw.replace(/^\s*/, "").length;
    const line = raw.trim();
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    const value = pair[2];

    if (indent === 0) {
      section = key;
      subsection = null;
      if (value !== "") {
        spec[key] = value;
      }
      continue;
    }
    if (indent === 2) {
      if (value === "") {
        subsection = key;
        continue;
      }
      subsection = null;
      const target = section === "expect" ? spec.expect : spec;
      const list = value.match(/^\[(.*)\]$/);
      target[key] = list
        ? list[1].split(",").map(function (p) { return p.trim(); }).filter(Boolean)
        : isNaN(Number(value)) ? value : Number(value);
      continue;
    }
    if (indent >= 4 && section === "setup" && subsection === "files") {
      spec.setup.files[key] = JSON.parse(value);
    }
  }
  return spec;
}

function makeProject(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-eval-"));
  for (const relative of Object.keys(spec.setup.files)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, spec.setup.files[relative]);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "setup"], { cwd: dir });
  spawnSync(process.execPath, [CLI, "init"], { cwd: dir });
  spawnSync(process.execPath, [CLI, "install", "--target", "claude"], { cwd: dir });
  return dir;
}

// stream-json 이벤트에서 역할 호출과 도구 사용을 관찰한다.
function observe(streamText, projectDir) {
  const rolesSelected = [];
  const toolsUsed = [];
  const transcript = [];
  let toolCalls = 0;
  let roleDispatches = 0;
  let finalText = "";

  for (const line of streamText.split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      continue;
    }
    // system/init 이벤트는 사용 가능한 에이전트 "목록"을 싣는다.
    // 목록을 호출로 오인하면 모든 케이스가 과잉 위임으로 잘못 판정된다.
    if (event.type === "system") {
      continue;
    }
    const content = (event.message && event.message.content) || [];
    for (const block of Array.isArray(content) ? content : []) {
      if (!block || block.type !== "tool_use") {
        continue;
      }
      toolCalls += 1;
      if (toolsUsed.indexOf(block.name) === -1) {
        toolsUsed.push(block.name);
      }
      // 역할 활성화는 서브에이전트를 실제로 띄운 호출에서만 센다.
      const input = block.input || {};
      const candidates = [input.subagent_type, input.agent, input.type].concat(
        (JSON.stringify(input).match(/role-[a-z]+/g) || [])
      );
      let dispatched = false;
      for (const candidate of candidates) {
        if (typeof candidate === "string" && /^role-[a-z]+$/.test(candidate)) {
          dispatched = true;
          if (rolesSelected.indexOf(candidate) === -1) {
            rolesSelected.push(candidate);
          }
        }
      }
      if (dispatched) {
        // D6의 상한은 역할 호출 횟수를 센다. 같은 역할 재호출도 한 번으로 센다.
        roleDispatches += 1;
      }
    }
    if (event.type === "result" && typeof event.result === "string") {
      finalText = event.result;
    }
    // 봉투는 서브에이전트 결과 안에 있고 메인 세션 최종 텍스트에는 요약만 남는다.
    // 모든 텍스트 블록과 도구 결과를 후보로 모은다.
    for (const block of Array.isArray(content) ? content : []) {
      if (!block) continue;
      if (typeof block.text === "string") {
        transcript.push(block.text);
      }
      if (block.type === "tool_result") {
        const payload = block.content;
        if (typeof payload === "string") {
          transcript.push(payload);
        } else if (Array.isArray(payload)) {
          for (const piece of payload) {
            if (piece && typeof piece.text === "string") {
              transcript.push(piece.text);
            }
          }
        }
      }
    }
  }

  // 범위 밖 수정 탐지: 설치물과 워크플로 상태를 제외한 변경 파일.
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: projectDir, encoding: "utf8" });
  const changed = String(status.stdout || "")
    .split("\n")
    .map(function (line) { return line.slice(3).trim(); })
    .filter(function (file) {
      return file && file.indexOf(".claude/") !== 0 && file.indexOf(".agent-workflow/") !== 0;
    });

  transcript.push(finalText);
  return {
    rolesSelected,
    toolsUsed,
    steps: roleDispatches,
    toolCalls,
    finalText,
    transcript,
    changedFiles: changed,
  };
}

function declaredNativeTools(roleNames) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "agent-workflow.manifest.json"), "utf8"));
  const adapter = JSON.parse(fs.readFileSync(path.join(ROOT, "adapters", "claude.json"), "utf8"));
  const roles = manifest.roles || manifest.skills || [];
  const allowed = [];
  for (const role of roles) {
    if (roleNames.indexOf(role.name) === -1) continue;
    for (const abstract of [].concat(role.requiredTools || [], role.optionalTools || [])) {
      const native = adapter.tools[abstract];
      if (!native) continue;
      for (const piece of String(native).split(",").map(function (p) { return p.trim(); })) {
        if (piece && allowed.indexOf(piece) === -1) allowed.push(piece);
      }
    }
  }
  return allowed;
}

function runCase(spec, dryRun) {
  const projectDir = makeProject(spec);
  let streamText = "";
  if (dryRun) {
    streamText = JSON.stringify({ type: "result", result: "dry-run: 모델을 호출하지 않았다" });
  } else {
    // role 모드는 특정 역할을 직접 실행해 봉투를 받는다.
    const prompt = spec.mode === "role" && spec.role
      ? "Use the " + spec.role + " subagent for this task, then return its full output verbatim including the Handoff Contract envelope. Task: " + String(spec.request)
      : String(spec.request);
    const result = spawnSync(
      "claude",
      [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        // 역할이 계약대로 문서를 쓸 수 있어야 한다. 쓰기가 거부되면
        // docs-only 역할이 만들지 못한 파일을 출처로 인용하게 되고,
        // 하네스가 환경 제약을 계약 위반으로 오판한다.
        // 대상은 매번 새로 만들고 지우는 임시 디렉터리다.
        "--permission-mode",
        "acceptEdits",
        prompt,
      ],
      { cwd: projectDir, encoding: "utf8", input: "", maxBuffer: 64 * 1024 * 1024 }
    );
    streamText = String(result.stdout || "") + String(result.stderr || "");
  }

  const observed = observe(streamText, projectDir);
  const producedNothing =
    observed.toolCalls === 0 &&
    observed.transcript.join("").trim().length === 0;
  if (producedNothing && !dryRun) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return {
      invalid: true,
      reason: "모델이 아무 것도 산출하지 않았다 (사용량 한도 또는 인증 문제로 추정)",
      findings: [],
      observed,
    };
  }
  let envelope = null;
  for (const chunk of observed.transcript) {
    const parsed = judge.parseEnvelope(chunk);
    if (parsed && parsed.from) {
      envelope = parsed;
      if (!spec.expect.envelope_from || parsed.from === spec.expect.envelope_from) {
        break;
      }
    }
  }
  const findings = [];
  const mode = spec.mode || "routing";

  if (mode === "role") {
    // 역할 하나를 직접 실행해 봉투를 판정한다.
    findings.push.apply(
      findings,
      judge.judgeEnvelope(envelope, {
        projectRoot: projectDir,
        expectedFrom: spec.expect.envelope_from || null,
      })
    );
  } else {
    // 라우팅 모드에서는 봉투와 도구를 판정하지 않는다.
    // 부모 스트림에는 서브에이전트 내부 도구가 나타나지 않으므로
    // 여기서 관찰되는 도구는 메인 세션의 것이며 역할 계약의 대상이 아니다.
    findings.push.apply(
      findings,
      judge.judgeRun(
        {
          rolesSelected: observed.rolesSelected,
          undeclaredTools: [],
          outOfScopeViolations: [],
          steps: observed.steps,
        },
        spec.expect
      )
    );
  }

  if (Array.isArray(spec.expect.needs_any_of)) {
    const needs = (envelope && Array.isArray(envelope.needs) ? envelope.needs : []).map(String);
    const matched = spec.expect.needs_any_of.some(function (want) {
      return needs.indexOf(want) !== -1;
    });
    findings.push({
      check: "needs.any_of",
      ok: matched,
      detail: "needs=" + JSON.stringify(needs),
    });
  }

  fs.rmSync(projectDir, { recursive: true, force: true });
  return { findings, observed };
}

function main() {
  const dryRun = Boolean(arg("dry-run", false));
  const runs = Number(arg("runs", 1)) || 1;
  const only = arg("case", null);

  const files = fs.readdirSync(CASES_DIR).filter(function (name) {
    return name.indexOf(".md") !== -1 && (!only || name.indexOf(String(only)) === 0);
  });
  if (files.length === 0) {
    console.error("실행할 케이스가 없다");
    process.exit(1);
  }

  console.log("\n  Agent Workflow Eval" + (dryRun ? " (dry-run)" : "") + "\n");
  const report = { startedAt: new Date().toISOString(), dryRun, runs, cases: [] };
  let totalChecks = 0;
  let passedChecks = 0;

  for (const file of files) {
    const spec = parseCase(fs.readFileSync(path.join(CASES_DIR, file), "utf8"));
    const caseReport = { id: spec.id, name: spec.name, runs: [] };
    let casePassed = 0;
    let validRuns = 0;
    let invalidRuns = 0;
    for (let attempt = 1; attempt <= runs; attempt += 1) {
      const outcome = runCase(spec, dryRun);
      if (outcome.invalid) {
        invalidRuns += 1;
        caseReport.runs.push({ attempt, invalid: true, reason: outcome.reason });
        console.log("  [skip] " + spec.id + " #" + attempt + " 무효: " + outcome.reason);
        continue;
      }
      validRuns += 1;
      const failed = outcome.findings.filter(function (entry) { return !entry.ok; });
      const ok = failed.length === 0;
      if (ok) casePassed += 1;
      totalChecks += outcome.findings.length;
      passedChecks += outcome.findings.length - failed.length;
      caseReport.runs.push({
        attempt,
        ok,
        rolesSelected: outcome.observed.rolesSelected,
        roleDispatches: outcome.observed.steps,
        toolCalls: outcome.observed.toolCalls,
        failures: failed.map(function (entry) {
          return { check: entry.check, detail: entry.detail, category: judge.classifyFailure(entry.check) };
        }),
      });
      const mark = ok ? "ok" : "fail";
      console.log("  [" + mark + "] " + spec.id + " #" + attempt + " roles=" + JSON.stringify(outcome.observed.rolesSelected) + " dispatches=" + outcome.observed.steps + " tools=" + outcome.observed.toolCalls);
      for (const entry of failed) {
        console.log("        - " + entry.check + " (" + judge.classifyFailure(entry.check) + "): " + entry.detail);
      }
    }
    caseReport.passRate = casePassed + "/" + validRuns;
    caseReport.invalidRuns = invalidRuns;
    report.cases.push(caseReport);
    console.log(
      "  " + spec.id + " 통과율: " + casePassed + "/" + validRuns +
      (invalidRuns > 0 ? " (무효 " + invalidRuns + "회 제외)" : "") + "\n"
    );
  }

  report.checkPassRate = passedChecks + "/" + totalChecks;
  console.log("  전체 검사 통과: " + passedChecks + "/" + totalChecks + "\n");

  if (!dryRun) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const stamp = report.startedAt.replace(/[:.]/g, "-");
    const target = path.join(HISTORY_DIR, stamp + ".json");
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
    console.log("  기록: " + path.relative(ROOT, target) + "\n");
  }
}

module.exports = { observe: observe, parseCase: parseCase };

// require로 불러올 때는 실행하지 않는다 (테스트가 observe만 쓴다).
if (require.main === module) {
  main();
}
