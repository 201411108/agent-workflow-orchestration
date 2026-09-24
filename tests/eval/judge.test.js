"use strict";

// 판정기 자체 검증. 모델을 호출하지 않으므로 npm run check에서 매번 돈다.
// D12: 검사를 먼저 깨뜨려 실패를 확인한다. 여기서는 위반 봉투를 만들어
// 판정기가 그것을 잡는지 확인한다.

const fs = require("fs");
const path = require("path");
const os = require("os");
const judge = require("./judge");

let failures = 0;

function check(label, condition, detail) {
  if (!condition) {
    failures += 1;
    console.error("  [fail] " + label + (detail ? " — " + detail : ""));
  }
}

function findingOf(findings, name) {
  return findings.filter(function (entry) {
    return entry.check === name;
  })[0];
}

function expectCheck(label, findings, name, expectedOk) {
  const found = findingOf(findings, name);
  if (!found) {
    failures += 1;
    console.error("  [fail] " + label + " — 판정 항목 없음: " + name);
    return;
  }
  check(label + " (" + name + ")", found.ok === expectedOk, "detail=" + found.detail);
}

// 판정 대상 출처가 실재하도록 임시 프로젝트를 만든다.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-judge-"));
fs.mkdirSync(path.join(root, "src"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "greet.js"), "export function greet() {}\n");

function envelopeText(overrides) {
  const base = {
    from: "role-planner",
    work_id: "none",
    status: "complete",
    produced: "[articulate_doc]",
    facts_confirmed: "\n  - claim: greet는 인자가 하나다\n    source: src/greet.js:1",
    assumptions: "\n  - claim: 기본값은 영어다\n    risk: medium",
    blocking_questions: "[]",
    needs: "[]",
    out_of_scope: "[결제 흐름]",
  };
  const merged = Object.assign({}, base, overrides || {});
  return judge.ENVELOPE_FIELDS.map(function (field) {
    const value = merged[field];
    if (value === null) {
      return null;
    }
    return String(value).indexOf("\n") === 0 ? field + ":" + value : field + ": " + value;
  })
    .filter(function (line) {
      return line !== null;
    })
    .join("\n");
}

// 1. 정상 봉투는 전부 통과한다.
const good = judge.judgeEnvelope(judge.parseEnvelope(envelopeText()), {
  projectRoot: root,
  expectedFrom: "role-planner",
});
check("정상 봉투는 위반 없음", good.every(function (entry) { return entry.ok; }),
  good.filter(function (e) { return !e.ok; }).map(function (e) { return e.check + ":" + e.detail; }).join(" | "));

// 2. 봉투가 아예 없으면 잡는다.
expectCheck("봉투 부재", judge.judgeEnvelope(judge.parseEnvelope("아무 내용 없음"), { projectRoot: root }), "envelope.present", false);

// 3. 필수 필드 누락을 잡는다.
expectCheck("필드 누락", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({ out_of_scope: null })), { projectRoot: root }), "envelope.fields", false);

// 4. 출처 없는 fact를 잡는다.
expectCheck("출처 없는 fact", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: 출처를 안 적었다",
})), { projectRoot: root }), "envelope.facts_sourced", false);

// 5. 실재하지 않는 출처를 잡는다.
expectCheck("허구의 출처", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: 없는 파일을 근거로 댔다\n    source: src/nope.js:9",
})), { projectRoot: root }), "envelope.source_exists", false);

// 6. assumptions에 출처가 붙으면 잡는다 (fact로 갔어야 한다).
expectCheck("출처 붙은 assumption", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  assumptions: "\n  - claim: 사실인데 가정에 넣었다\n    source: src/greet.js:1",
})), { projectRoot: root }), "envelope.assumptions_unsourced", false);

// 7. status와 blocking_questions 불일치를 잡는다.
expectCheck("status 불일치", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  blocking_questions: "[API 모양을 정해야 한다]",
})), { projectRoot: root }), "envelope.status_consistent", false);

// 8. 어휘 밖 needs를 잡는다.
expectCheck("어휘 밖 needs", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  status: "blocked",
  needs: "[make-it-nice]",
})), { projectRoot: root }), "envelope.needs_vocabulary", false);

// 9. 다음 역할 지명을 잡는다 (D16).
expectCheck("역할 지명", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  out_of_scope: "[role-developer가 할 일]",
})), { projectRoot: root }), "envelope.no_role_naming", false);

// 10. from 불일치를 잡는다.
expectCheck("from 불일치", judge.judgeEnvelope(judge.parseEnvelope(envelopeText()), {
  projectRoot: root,
  expectedFrom: "role-reviewer",
}), "envelope.from", false);

// 11~15. 실행 관찰 판정.
const cleanRun = judge.judgeRun(
  { rolesSelected: ["role-planner"], undeclaredTools: [], outOfScopeViolations: [], steps: 3 },
  { roles_expected: ["role-planner"], roles_forbidden: ["role-developer"], max_steps: 12 }
);
check("정상 실행은 위반 없음", cleanRun.every(function (entry) { return entry.ok; }));

expectCheck("기대 역할 미활성", judge.judgeRun(
  { rolesSelected: [], steps: 1 },
  { roles_expected: ["role-planner"] }
), "routing.expected_roles", false);

expectCheck("과잉 위임", judge.judgeRun(
  { rolesSelected: ["role-planner", "role-developer"], steps: 2 },
  { roles_forbidden: ["role-developer"] }
), "routing.forbidden_roles", false);

expectCheck("미선언 도구 사용", judge.judgeRun(
  { rolesSelected: [], undeclaredTools: ["Bash"], steps: 1 },
  {}
), "tools.declared_only", false);

expectCheck("범위 밖 수정", judge.judgeRun(
  { rolesSelected: [], outOfScopeViolations: ["src/payment.js"], steps: 1 },
  {}
), "scope.out_of_scope_respected", false);

expectCheck("스텝 상한 초과", judge.judgeRun(
  { rolesSelected: [], steps: 99 },
  { max_steps: 12 }
), "limits.max_steps", false);

// 16. 실제 실행에서 받은 봉투가 계속 통과하는지 (회귀 픽스처).
const liveText = fs.readFileSync(path.join(__dirname, "fixtures", "live-planner-envelope.md"), "utf8");
const liveEnvelope = judge.parseEnvelope(liveText);
check("실제 봉투 파싱됨", liveEnvelope !== null);
const liveFindings = judge.judgeEnvelope(liveEnvelope, { projectRoot: root, expectedFrom: "role-planner" });
for (const name of [
  "envelope.present",
  "envelope.fields",
  "envelope.from",
  "envelope.facts_sourced",
  "envelope.assumptions_unsourced",
  "envelope.status_consistent",
  "envelope.needs_vocabulary",
  "envelope.no_role_naming",
]) {
  expectCheck("실제 봉투", liveFindings, name, true);
}

// 17. 실패 분류가 3종 안에 든다.
const categories = ["계약 결함", "컨텍스트 부족", "모델 변동"];
for (const name of ["envelope.fields", "routing.forbidden_roles", "limits.max_steps"]) {
  check("분류 " + name, categories.indexOf(judge.classifyFailure(name)) !== -1, judge.classifyFailure(name));
}

fs.rmSync(root, { recursive: true, force: true });

// 17b. glob: 출처는 "없음을 확인한 사실"의 근거로 허용된다 (2026-09-21 R6에서 발견).
const globRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-glob-"));
expectCheck("glob 출처 허용", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: package.json이 없다\n    source: glob:**/package.json",
})), { projectRoot: globRoot }), "envelope.source_exists", true);
expectCheck("서술형 출처는 거부", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: 확인했다\n    source: 코드에서 확인함",
})), { projectRoot: globRoot }), "envelope.source_exists", false);
fs.rmSync(globRoot, { recursive: true, force: true });

// 17c. 따옴표로 감싼 출처도 읽어야 한다 (2026-09-21 R6 재실행에서 발견).
const quotedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-quote-"));
expectCheck("따옴표 감싼 glob 출처", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: src에 파일이 없다\n    source: \"glob:src/**\"",
})), { projectRoot: quotedRoot }), "envelope.source_exists", true);
fs.rmSync(quotedRoot, { recursive: true, force: true });

// 17d. 역할 정의 로드 실패를 잡는다 (2026-09-24 Codex에서 실제 발생).
//      역할이 로드되지 않으면 판정할 계약 자체가 없다.
expectCheck("역할 로드 실패", judge.judgeRun(
  { rolesSelected: [], steps: 0, setupErrors: ["Ignoring malformed agent role definition: failed to deserialize agent role file at .codex/agents/role-qa.toml"] },
  {}
), "setup.roles_loaded", false);
expectCheck("정상 로드", judge.judgeRun({ rolesSelected: [], steps: 0, setupErrors: [] }, {}), "setup.roles_loaded", true);
check("setup 실패는 계약 결함으로 분류", judge.classifyFailure("setup.roles_loaded") === "계약 결함");

// 17e. 다중 줄 범위 출처를 읽는다 (2026-09-24 R4에서 발견).
const rangeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-range-"));
fs.writeFileSync(path.join(rangeRoot, "notes.md"), "x");
for (const spec of ["notes.md", "notes.md:3", "notes.md:3-5", "notes.md:3-5,41-53"]) {
  check("출처 줄 지정 " + spec, judge.sourceExists(spec, rangeRoot), spec);
}
check("없는 파일은 거부", !judge.sourceExists("missing.md:1-2", rangeRoot));
fs.rmSync(rangeRoot, { recursive: true, force: true });

// 17f. 봉투 예시를 그대로 복사하면 잡는다 (2026-09-24 R4에서 반복 발생).
const copyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-copy-"));
expectCheck("예시 복사 탐지", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "\n  - claim: <확인된 사실>\n    source: <파일 경로>:<줄 번호>",
})), { projectRoot: copyRoot }), "envelope.no_template_copy", false);
expectCheck("빈 목록은 정상", judge.judgeEnvelope(judge.parseEnvelope(envelopeText({
  facts_confirmed: "[]",
})), { projectRoot: copyRoot }), "envelope.no_template_copy", true);
fs.rmSync(copyRoot, { recursive: true, force: true });

// 18. 관찰기 회귀: system/init 이벤트의 에이전트 "목록"을 호출로 오인하면 안 된다.
//     이 버그가 있으면 모든 케이스가 과잉 위임으로 잘못 판정된다 (2026-09-21 실제 발생).
const { observe } = require("./run");
const streamFixture = fs.readFileSync(path.join(__dirname, "fixtures", "stream-no-delegation.jsonl"), "utf8");
const noDelegationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-observe-"));
const observed = observe(streamFixture, noDelegationRoot);
check(
  "위임 없는 실행에서 역할이 잡히지 않는다",
  observed.rolesSelected.length === 0,
  "rolesSelected=" + JSON.stringify(observed.rolesSelected)
);
check("도구 사용은 관찰된다", observed.toolsUsed.indexOf("Edit") !== -1, JSON.stringify(observed.toolsUsed));
check("위임이 없으면 역할 호출 수가 0", observed.steps === 0, "steps=" + observed.steps);
check("도구 호출은 별도로 세어진다", observed.toolCalls > 0, "toolCalls=" + observed.toolCalls);
fs.rmSync(noDelegationRoot, { recursive: true, force: true });

// 19. 무효 실행 감지: 한도 도달/오류를 계약 위반과 구분해야 한다.
//     구분하지 않으면 한도가 "위반 없음"으로 거짓 통과하거나 봉투 부재로 거짓 실패한다.
const errRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-err-"));
const errorStream = [
  JSON.stringify({ type: "system", subtype: "init" }),
  JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "" }),
].join("\n");
const errObserved = observe(errorStream, errRoot);
check("오류 실행이 runError로 표시된다", Boolean(errObserved.runError), "runError=" + String(errObserved.runError));

const okStream = [
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }),
].join("\n");
const okObserved = observe(okStream, errRoot);
check("정상 실행은 runError가 없다", !okObserved.runError, "runError=" + String(okObserved.runError));
check("result 이벤트를 봤다고 기록한다", okObserved.sawResult === true);
fs.rmSync(errRoot, { recursive: true, force: true });

if (failures > 0) {
  console.error("\nJudge test failed: " + failures + " issue(s).\n");
  process.exit(1);
}
console.log("Judge and observer tests passed.");
