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

// Codex는 신뢰되지 않은 프로젝트에서 .codex/ 레이어 전체를 건너뛴다.
// 임시 디렉터리는 보통 신뢰 목록 밖이므로 기준 경로를 바꿀 수 있어야 한다.
const BASE_DIR = process.env.AGENT_WORKFLOW_EVAL_BASE || os.tmpdir();

function getCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

// 신뢰되지 않은 경로에서 Codex를 돌리면 역할이 하나도 로드되지 않은 채
// "위반 없음"처럼 보인다. 측정 전에 막는다.
function assertCodexTrust(dir) {
  const configPath = path.join(getCodexHome(), "config.toml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Codex 신뢰 정보를 읽을 수 없다: ${configPath}`);
  }
  const trusted = [];
  let current = null;
  for (const raw of fs.readFileSync(configPath, "utf8").split("\n")) {
    const line = raw.trim();
    const section = line.match(/^\[projects\."(.+)"\]$/);
    if (section) {
      current = section[1];
      continue;
    }
    if (line.indexOf("[") === 0) {
      current = null;
      continue;
    }
    if (current && /^trust_level\s*=\s*"trusted"$/.test(line)) {
      trusted.push(current);
      current = null;
    }
  }
  let resolved;
  try {
    resolved = fs.realpathSync(dir);
  } catch (error) {
    resolved = path.resolve(dir);
  }
  const anchor = trusted.filter(function (base) {
    let real;
    try {
      real = fs.realpathSync(base);
    } catch (error) {
      real = path.resolve(base);
    }
    return resolved === real || resolved.indexOf(real + path.sep) === 0;
  })[0];
  if (!anchor) {
    throw new Error(
      `Codex 평가에는 신뢰된 경로가 필요하다. ${resolved} 는 신뢰 목록에 없다.\n` +
        `  AGENT_WORKFLOW_EVAL_BASE 를 신뢰된 디렉터리로 지정하라.`
    );
  }
}

function makeProject(spec, targetName) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(BASE_DIR, "agent-workflow-eval-"));
  for (const relative of Object.keys(spec.setup.files)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, spec.setup.files[relative]);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "setup"], { cwd: dir });
  spawnSync(process.execPath, [CLI, "init"], { cwd: dir });
  spawnSync(process.execPath, [CLI, "install", "--target", targetName], { cwd: dir });
  if (targetName === "codex") {
    assertCodexTrust(dir);
  }
  return dir;
}

// stream-json 이벤트에서 역할 호출과 도구 사용을 관찰한다.
function observe(streamText, projectDir) {
  const rolesSelected = [];
  const toolsUsed = [];
  const transcript = [];
  let toolCalls = 0;
  let roleDispatches = 0;
  let runError = null;
  let sawResult = false;
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
    if (event.type === "result") {
      if (typeof event.result === "string") {
        finalText = event.result;
      }
      // 한도 도달, 인증 실패 등은 계약 위반이 아니다. 실행 자체가 성립하지 않았다.
      if (event.is_error === true) {
        runError = "is_error";
      } else if (event.subtype && event.subtype !== "success") {
        runError = "subtype:" + event.subtype;
      } else if (event.api_error_status) {
        runError = "api_error_status:" + event.api_error_status;
      }
      sawResult = true;
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
    runError,
    sawResult,
    changedFiles: changed,
  };
}

// codex exec --json 의 이벤트를 관찰한다.
// item.completed 하나가 메시지 또는 도구 실행 하나에 해당한다.
function observeCodex(streamText, projectDir) {
  const rolesSelected = [];
  const toolsUsed = [];
  const transcript = [];
  let toolCalls = 0;
  let roleDispatches = 0;
  let runError = null;
  let sawResult = false;
  let finalText = "";
  const setupErrors = [];

  for (const line of streamText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.charAt(0) !== "{") {
      continue;
    }
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch (error) {
      continue;
    }
    if (event.type === "turn.completed") {
      sawResult = true;
    }
    if (event.type === "turn.failed" || event.type === "error") {
      runError = event.type;
      sawResult = true;
    }
    if (event.type !== "item.completed" || !event.item) {
      continue;
    }
    const item = event.item;
    // error 항목은 도구 실행이 아니다. 여기에 역할 이름이 들어 있어도 위임이 아니다.
    // 실제로 역할 파일이 malformed면 Codex가 이름을 나열한 에러를 쏟아내는데,
    // 그것을 위임으로 세면 모든 케이스가 과잉 위임으로 오판된다 (2026-09-24 실측).
    if (item.type === "error") {
      setupErrors.push(String(item.message || ""));
      continue;
    }
    if (item.type === "agent_message") {
      if (typeof item.text === "string") {
        transcript.push(item.text);
        finalText = item.text;
      }
      continue;
    }
    toolCalls += 1;
    if (toolsUsed.indexOf(item.type) === -1) {
      toolsUsed.push(item.type);
    }
    if (typeof item.text === "string") {
      transcript.push(item.text);
    }
    if (typeof item.aggregated_output === "string") {
      transcript.push(item.aggregated_output);
    }
    // 협업 도구 호출만 실제 위임이다.
    //
    // 역할 이름을 문자열로 훑으면 안 된다. 오케스트레이터 계약을 cat 하는
    // command_execution이나 역할을 언급하는 agent_message가 전부 위임으로 잡힌다
    // (2026-09-24 실측: R2 한 줄 수정에 10개 역할이 잡혔다).
    //
    // 다만 Codex 부모 스트림은 **어떤 에이전트를 띄웠는지 담지 않는다.**
    // receiver_thread_ids와 agents_states가 비어 있다. 따라서 위임 횟수는 셀 수
    // 있어도 역할 이름은 알 수 없다. 이름을 추측하지 않고 비워 둔다.
    if (item.type === "collab_tool_call") {
      roleDispatches += 1;
    }
  }

  const status = spawnSync("git", ["status", "--porcelain"], { cwd: projectDir, encoding: "utf8" });
  const changed = String(status.stdout || "")
    .split("\n")
    .map(function (line) { return line.slice(3).trim(); })
    .filter(function (file) {
      return file && file.indexOf(".codex/") !== 0 && file.indexOf(".agents/") !== 0 && file.indexOf(".agent-workflow/") !== 0 && file !== "AGENTS.md";
    });

  transcript.push(finalText);
  return {
    rolesSelected,
    toolsUsed,
    steps: roleDispatches,
    toolCalls,
    finalText,
    transcript,
    runError,
    sawResult,
    setupErrors,
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

// 타깃별 실행 방법. 관찰기가 다르므로 함께 묶는다.
const EVAL_TARGETS = {
  claude: {
    observesRoleNames: true,
    observe: observe,
    command: function (prompt) {
      return {
        bin: "claude",
        args: [
          "-p",
          "--output-format",
          "stream-json",
          "--verbose",
          // 역할이 계약대로 문서를 쓸 수 있어야 한다.
          "--permission-mode",
          "acceptEdits",
          prompt,
        ],
      };
    },
  },
  codex: {
    // Codex 부모 스트림에는 어떤 에이전트를 띄웠는지가 없다.
    // 라우팅을 판정할 신호가 없으므로 봉투와 셋업만 판정한다.
    observesRoleNames: false,
    observe: observeCodex,
    command: function (prompt) {
      return {
        bin: "codex",
        args: ["exec", "--json", "--sandbox", "workspace-write", prompt],
      };
    },
  },
};

function runCase(spec, dryRun, targetName) {
  const target = EVAL_TARGETS[targetName];
  const projectDir = makeProject(spec, targetName);
  let streamText = "";
  if (dryRun) {
    streamText = JSON.stringify({ type: "result", result: "dry-run: 모델을 호출하지 않았다" });
  } else {
    // role 모드는 특정 역할을 직접 실행해 봉투를 받는다.
    const prompt = spec.mode === "role" && spec.role
      ? "Delegate this task to the " + spec.role + " agent, then return its full output verbatim including the filled Handoff Contract envelope. Task: " + String(spec.request)
      : String(spec.request);
    const invocation = target.command(prompt);
    const result = spawnSync(invocation.bin, invocation.args, {
      cwd: projectDir,
      encoding: "utf8",
      input: "",
      maxBuffer: 64 * 1024 * 1024,
    });
    streamText = String(result.stdout || "") + String(result.stderr || "");
  }

  const observed = target.observe(streamText, projectDir);
  // 실행이 성립하지 않은 회차를 계약 위반과 분리한다.
  // 이것을 구분하지 않으면 한도 도달이 "위반 없음"으로 거짓 통과하거나
  // 봉투 부재로 거짓 실패한다. 둘 다 하네스를 믿을 수 없게 만든다.
  let invalidReason = null;
  if (!dryRun) {
    if (observed.runError) {
      invalidReason = "실행 오류 (" + observed.runError + ")";
    } else if (!observed.sawResult) {
      invalidReason = "result 이벤트가 없다 (프로세스가 비정상 종료)";
    } else if (observed.toolCalls === 0 && observed.transcript.join("").trim().length === 0) {
      invalidReason = "모델이 아무 것도 산출하지 않았다";
    }
  }
  if (invalidReason) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return { invalid: true, reason: invalidReason, findings: [], observed };
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
  } else if (target.observesRoleNames === false) {
    // 역할 이름을 관찰할 수 없는 타깃에서는 라우팅을 판정하지 않는다.
    // 신호가 없는데 판정하면 거짓 결과가 나온다.
    findings.push({
      check: "routing.not_observable",
      ok: true,
      detail: targetName + " 부모 스트림에 역할 이름이 없어 라우팅은 판정하지 않는다 (위임 " + observed.steps + "회)",
    });
    findings.push.apply(
      findings,
      judge.judgeRun(
        {
          rolesSelected: [],
          undeclaredTools: [],
          outOfScopeViolations: [],
          steps: observed.steps,
          setupErrors: observed.setupErrors || [],
        },
        { max_steps: spec.expect.max_steps }
      ).filter(function (entry) {
        return entry.check.indexOf("routing.") !== 0;
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
          setupErrors: observed.setupErrors || [],
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
  const targetName = String(arg("target", "claude"));
  if (!EVAL_TARGETS[targetName]) {
    console.error(`알 수 없는 타깃: ${targetName} (claude | codex)`);
    process.exit(1);
  }

  const files = fs.readdirSync(CASES_DIR).filter(function (name) {
    return name.indexOf(".md") !== -1 && (!only || name.indexOf(String(only)) === 0);
  });
  if (files.length === 0) {
    console.error("실행할 케이스가 없다");
    process.exit(1);
  }

  console.log("\n  Agent Workflow Eval [" + targetName + "]" + (dryRun ? " (dry-run)" : "") + "\n");
  const report = { startedAt: new Date().toISOString(), target: targetName, dryRun, runs, cases: [] };
  let totalChecks = 0;
  let passedChecks = 0;

  for (const file of files) {
    const spec = parseCase(fs.readFileSync(path.join(CASES_DIR, file), "utf8"));
    const caseReport = { id: spec.id, name: spec.name, runs: [] };
    let casePassed = 0;
    let validRuns = 0;
    let invalidRuns = 0;
    for (let attempt = 1; attempt <= runs; attempt += 1) {
      const outcome = runCase(spec, dryRun, targetName);
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
    const target = path.join(HISTORY_DIR, stamp + "-" + targetName + ".json");
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
    console.log("  기록: " + path.relative(ROOT, target) + "\n");
  }
}

module.exports = { observe: observe, parseCase: parseCase };

// require로 불러올 때는 실행하지 않는다 (테스트가 observe만 쓴다).
if (require.main === module) {
  main();
}
