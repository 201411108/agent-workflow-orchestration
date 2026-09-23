"use strict";

// 동작 검증 판정기 (ROADMAP 1.6, D12).
//
// 모델을 호출하지 않는 순수 모듈이다. 실행기(run.js)가 에이전트를 돌려 만든
// 결과물을 받아 계약 준수만 기계로 판정한다. "기획이 좋은가"는 판정하지 않는다.
// 판정기 자체는 judge.test.js가 모델 없이 검증한다.

const fs = require("fs");
const path = require("path");

// D16에서 고정한 능력 어휘. Stop Conditions와 핸드오프 needs가 같은 값을 쓴다.
const NEEDS_VOCABULARY = [
  "product-intent",
  "ui-decision",
  "code-evidence",
  "external-evidence",
  "contract-decision",
  "implementation",
  "verification",
  "acceptance-criteria",
];

const ENVELOPE_FIELDS = [
  "from",
  "work_id",
  "status",
  "produced",
  "facts_confirmed",
  "assumptions",
  "blocking_questions",
  "needs",
  "out_of_scope",
];

function unquote(value) {
  const trimmed = String(value).trim();
  if (trimmed.length >= 2) {
    const first = trimmed.charAt(0);
    const last = trimmed.charAt(trimmed.length - 1);
    if (first === last && (first === '"' || first === "'" || first === "`")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function stripInlineList(value) {
  const trimmed = value.trim();
  if (trimmed.indexOf("[") !== 0 || trimmed.lastIndexOf("]") !== trimmed.length - 1) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") {
    return [];
  }
  return inner.split(",").map(function (part) {
    return part.trim().replace(/^["'`]|["'`]$/g, "");
  });
}

// 봉투 전용 최소 YAML 파서. 스칼라, 인라인 리스트, 블록 리스트,
// 객체 항목 리스트(- key: value + 들여쓴 key: value)만 다룬다.
function parseEnvelope(text) {
  const lines = String(text).split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^from:\s*role-[a-z-]+\s*$/.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start === -1) {
    return null;
  }

  const result = {};
  let currentKey = null;
  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index];
    if (/^\s*```/.test(raw)) {
      if (currentKey) break;
      continue;
    }
    const topLevel = raw.match(/^([a-z_]+):(.*)$/);
    if (topLevel) {
      const key = topLevel[1];
      const rest = topLevel[2];
      if (ENVELOPE_FIELDS.indexOf(key) === -1) {
        if (currentKey) break;
        continue;
      }
      currentKey = key;
      const inline = stripInlineList(rest);
      if (inline !== null) {
        result[key] = inline;
      } else if (rest.trim() !== "") {
        result[key] = unquote(rest);
      } else {
        result[key] = [];
      }
      continue;
    }
    if (currentKey === null) {
      continue;
    }
    const itemStart = raw.match(/^\s+-\s+(.*)$/);
    if (itemStart) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      const body = itemStart[1];
      const pair = body.match(/^([a-z_]+):\s*(.*)$/);
      if (pair) {
        const entry = {};
        entry[pair[1]] = unquote(pair[2]);
        result[currentKey].push(entry);
      } else {
        result[currentKey].push(unquote(body));
      }
      continue;
    }
    const continued = raw.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (continued && Array.isArray(result[currentKey]) && result[currentKey].length > 0) {
      const last = result[currentKey][result[currentKey].length - 1];
      if (last && typeof last === "object") {
        last[continued[1]] = unquote(continued[2]);
        continue;
      }
    }
    if (raw.trim() === "") {
      continue;
    }
    if (!/^\s/.test(raw)) {
      break;
    }
  }
  return result;
}

function isUrl(value) {
  return /^https?:\/\//.test(String(value));
}

function sourceExists(source, projectRoot) {
  if (!source) {
    return false;
  }
  if (isUrl(source)) {
    return true;
  }
  // glob:<패턴>은 "없음을 확인한 사실"의 출처다. 찾은 범위 자체가 근거이므로
  // 파일 실재를 요구하지 않는다.
  if (/^glob:\S+/.test(String(source).trim())) {
    return true;
  }
  const withoutLine = String(source).replace(/:\d+(-\d+)?$/, "").trim();
  if (withoutLine === "") {
    return false;
  }
  const absolute = path.isAbsolute(withoutLine)
    ? withoutLine
    : path.join(projectRoot, withoutLine);
  return fs.existsSync(absolute);
}

function finding(check, ok, detail) {
  return { check: check, ok: ok, detail: detail };
}

// 봉투 하나를 계약에 대고 판정한다.
function judgeEnvelope(envelope, options) {
  const settings = options || {};
  const projectRoot = settings.projectRoot || process.cwd();
  const expectedFrom = settings.expectedFrom || null;
  const findings = [];

  if (!envelope) {
    findings.push(finding("envelope.present", false, "봉투를 찾지 못했다"));
    return findings;
  }
  findings.push(finding("envelope.present", true, "봉투 발견"));

  const missing = ENVELOPE_FIELDS.filter(function (field) {
    return !Object.prototype.hasOwnProperty.call(envelope, field);
  });
  findings.push(
    finding("envelope.fields", missing.length === 0, missing.length === 0 ? "9개 필드 존재" : "누락: " + missing.join(", "))
  );

  if (expectedFrom) {
    findings.push(
      finding("envelope.from", envelope.from === expectedFrom, "from=" + String(envelope.from))
    );
  }

  const facts = Array.isArray(envelope.facts_confirmed) ? envelope.facts_confirmed : [];
  const unsourced = facts.filter(function (entry) {
    return !entry || typeof entry !== "object" || !entry.source;
  });
  findings.push(
    finding(
      "envelope.facts_sourced",
      unsourced.length === 0,
      facts.length + "개 중 출처 없음 " + unsourced.length + "개"
    )
  );

  const brokenSources = facts.filter(function (entry) {
    return entry && typeof entry === "object" && entry.source && !sourceExists(entry.source, projectRoot);
  });
  findings.push(
    finding(
      "envelope.source_exists",
      brokenSources.length === 0,
      brokenSources.length === 0
        ? "모든 출처 확인됨"
        : "실재하지 않는 출처: " +
            brokenSources
              .map(function (entry) {
                return entry.source;
              })
              .join(", ")
    )
  );

  const assumptions = Array.isArray(envelope.assumptions) ? envelope.assumptions : [];
  const sourcedAssumptions = assumptions.filter(function (entry) {
    return entry && typeof entry === "object" && entry.source;
  });
  findings.push(
    finding(
      "envelope.assumptions_unsourced",
      sourcedAssumptions.length === 0,
      assumptions.length + "개 중 출처 보유 " + sourcedAssumptions.length + "개"
    )
  );

  const blocking = Array.isArray(envelope.blocking_questions) ? envelope.blocking_questions : [];
  const needs = Array.isArray(envelope.needs) ? envelope.needs : [];
  const shouldBeBlocked = blocking.length > 0 || needs.length > 0;
  const isBlocked = String(envelope.status).trim() === "blocked";
  findings.push(
    finding(
      "envelope.status_consistent",
      shouldBeBlocked === isBlocked,
      "status=" + String(envelope.status) + ", blocking=" + blocking.length + ", needs=" + needs.length
    )
  );

  const unknownNeeds = needs
    .filter(function (entry) {
      const value = typeof entry === "string" ? entry : entry && entry.need;
      return NEEDS_VOCABULARY.indexOf(String(value).trim()) === -1;
    })
    .map(function (entry) {
      // 역할이 설명을 덧붙이면 객체가 된다. 원인을 알 수 있게 직렬화한다.
      return typeof entry === "string" ? entry : JSON.stringify(entry);
    });
  findings.push(
    finding(
      "envelope.needs_vocabulary",
      unknownNeeds.length === 0,
      unknownNeeds.length === 0 ? "어휘 준수" : "알 수 없는 needs: " + unknownNeeds.join(", ")
    )
  );

  findings.push(
    finding("envelope.out_of_scope_declared", Object.prototype.hasOwnProperty.call(envelope, "out_of_scope"), "생략 불가 필드")
  );

  // D16: 봉투가 다음 역할을 지명하면 안 된다.
  const serialized = JSON.stringify(envelope);
  const namedRoles = (serialized.match(/role-[a-z]+/g) || []).filter(function (name) {
    return name !== envelope.from;
  });
  findings.push(
    finding(
      "envelope.no_role_naming",
      namedRoles.length === 0,
      namedRoles.length === 0 ? "타 역할 지명 없음" : "지명: " + Array.from(new Set(namedRoles)).join(", ")
    )
  );

  return findings;
}

// 실행 관찰 결과(선택된 역할, 사용한 도구, 스텝 수)를 기대값에 대고 판정한다.
function judgeRun(observed, expectation) {
  const findings = [];
  const seen = (observed && observed.rolesSelected) || [];
  const expected = (expectation && expectation.roles_expected) || [];
  const forbidden = (expectation && expectation.roles_forbidden) || [];

  const missingRoles = expected.filter(function (role) {
    return seen.indexOf(role) === -1;
  });
  findings.push(
    finding(
      "routing.expected_roles",
      missingRoles.length === 0,
      missingRoles.length === 0 ? "기대 역할 모두 활성" : "미활성: " + missingRoles.join(", ")
    )
  );

  const violatedRoles = forbidden.filter(function (role) {
    return seen.indexOf(role) !== -1;
  });
  findings.push(
    finding(
      "routing.forbidden_roles",
      violatedRoles.length === 0,
      violatedRoles.length === 0 ? "금지 역할 미활성" : "과잉 위임: " + violatedRoles.join(", ")
    )
  );

  const undeclared = (observed && observed.undeclaredTools) || [];
  findings.push(
    finding(
      "tools.declared_only",
      undeclared.length === 0,
      undeclared.length === 0 ? "선언된 도구만 사용" : "미선언 도구: " + undeclared.join(", ")
    )
  );

  const violations = (observed && observed.outOfScopeViolations) || [];
  findings.push(
    finding(
      "scope.out_of_scope_respected",
      violations.length === 0,
      violations.length === 0 ? "범위 준수" : "범위 밖 수정: " + violations.join(", ")
    )
  );

  const steps = (observed && observed.steps) || 0;
  const maxSteps = (expectation && expectation.max_steps) || 12;
  findings.push(finding("limits.max_steps", steps <= maxSteps, steps + "/" + maxSteps));

  return findings;
}

// 실패 원인 3분류 (VERIFICATION.md L3).
function classifyFailure(check) {
  if (check.indexOf("envelope.") === 0 || check === "scope.out_of_scope_respected" || check === "tools.declared_only") {
    return "계약 결함";
  }
  if (check.indexOf("routing.") === 0) {
    return "모델 변동";
  }
  return "컨텍스트 부족";
}

module.exports = {
  NEEDS_VOCABULARY: NEEDS_VOCABULARY,
  ENVELOPE_FIELDS: ENVELOPE_FIELDS,
  parseEnvelope: parseEnvelope,
  judgeEnvelope: judgeEnvelope,
  judgeRun: judgeRun,
  classifyFailure: classifyFailure,
  sourceExists: sourceExists,
};
