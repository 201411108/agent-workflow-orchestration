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
  // 줄 지정은 42, 3-5, 3-5,41-53 형태가 모두 온다.
  const withoutLine = String(source).replace(/:\d+(-\d+)?(,\d+(-\d+)?)*$/, "").trim();
  if (withoutLine === "") {
    return false;
  }
  const absolute = path.isAbsolute(withoutLine)
    ? withoutLine
    : path.join(projectRoot, withoutLine);
  return fs.existsSync(absolute);
}


// 변경된 파일 중 봉투가 범위 밖이라고 선언한 경로에 걸리는 것을 센다.
//
// F2: changedFiles를 git status로 관찰해 놓고 어디에서도 쓰지 않았다.
// 봉투의 out_of_scope도 파싱되어 있었다. 교집합을 구하는 코드만 없었다.
// D6은 범위 이탈을 즉시 중단 조건으로 정했는데 기계 판정이 불가능한 상태였다.
//
// out_of_scope 항목은 자유 문구다. 디렉터리(`problems/`)나 경로 조각이 온다.
// 그래서 접두 일치와 부분 일치를 함께 본다. 과탐이 미탐보다 낫다 — 과탐은
// 기록을 보고 사람이 걷어낼 수 있고, 미탐은 존재를 모른다.
function findOutOfScopeViolations(changedFiles, outOfScope) {
  const declared = (outOfScope || [])
    .map(function (entry) {
      return String(entry).trim().replace(/^\.\//, "");
    })
    .filter(function (entry) {
      // 서술형 문구는 경로가 아니다. 공백이 있으면 경로로 취급하지 않는다.
      return entry.length > 0 && entry.indexOf(" ") === -1;
    });
  if (declared.length === 0) {
    return [];
  }
  const violations = [];
  for (const raw of changedFiles || []) {
    const file = String(raw).trim().replace(/^\.\//, "");
    if (file === "") {
      continue;
    }
    for (const scope of declared) {
      const bare = scope.replace(/\/$/, "");
      if (bare === "" ) {
        continue;
      }
      if (file === bare || file.startsWith(bare + "/") || file.indexOf(bare) !== -1) {
        violations.push(file + " (out_of_scope: " + scope + ")");
        break;
      }
    }
  }
  return violations;
}

function finding(check, ok, detail) {
  return { check: check, ok: ok, detail: detail };
}

// 관찰 신호가 없어 판정하지 않은 항목.
//
// F1~F3의 원인: 관찰 불가와 위반 없음이 같은 [ok]로 찍히고 통과 수에 들어갔다.
// "51/51 통과"가 실제로는 39개만 판정한 결과였다. 판정하지 않은 것은 통과가 아니다.
// observable: false를 달면 실행기가 통과 수에서 분리하고 미판정으로 따로 센다.
function notObserved(check, detail) {
  return { check: check, ok: true, observable: false, detail: detail };
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
  const copiedPlaceholders = facts.filter(function (entry) {
    return entry && typeof entry === "object" && /[<>]/.test(String(entry.source || ""));
  });
  findings.push(
    finding(
      "envelope.no_template_copy",
      copiedPlaceholders.length === 0,
      copiedPlaceholders.length === 0
        ? "예시 복사 없음"
        : "봉투 예시를 그대로 복사했다: " + String(copiedPlaceholders[0].source)
    )
  );
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

  // 도구 경계: 부모 스트림에는 서브에이전트 내부 도구 호출이 없다.
  // 관찰 신호가 없으면 통과로 찍지 않고 미판정으로 분리한다.
  if (observed && observed.toolsObservable === false) {
    findings.push(
      notObserved(
        "tools.not_observable",
        "관찰된 서브에이전트 도구 호출이 없어 도구 경계는 판정하지 않는다"
      )
    );
  } else {
    const undeclared = (observed && observed.undeclaredTools) || [];
    findings.push(
      finding(
        "tools.declared_only",
        undeclared.length === 0,
        undeclared.length === 0 ? "선언된 도구만 사용" : "미선언 도구: " + undeclared.join(", ")
      )
    );
  }

  // 범위 이탈: 변경 파일과 봉투의 out_of_scope를 대조해야 판정할 수 있다.
  // 봉투가 없는 실행(라우팅 모드)에서는 대조 기준이 없으므로 미판정이다.
  if (observed && observed.scopeObservable === false) {
    findings.push(
      notObserved(
        "scope.not_observable",
        "봉투의 out_of_scope가 없어 범위 이탈은 판정하지 않는다"
      )
    );
  } else {
    const violations = (observed && observed.outOfScopeViolations) || [];
    findings.push(
      finding(
        "scope.out_of_scope_respected",
        violations.length === 0,
        violations.length === 0 ? "범위 준수" : "범위 밖 수정: " + violations.join(", ")
      )
    );
  }

  // 역할 정의가 로드되지 않으면 계약을 판정할 대상 자체가 없다.
  // 하네스가 이것을 "위반 없음"으로 넘기면 깨진 배포를 정상으로 본다.
  const setupErrors = (observed && observed.setupErrors) || [];
  // 로스터도 없고 오류 신호도 없으면 로드 여부를 알 방법이 없다.
  // 그것을 통과로 찍으면 깨진 배포를 정상으로 본다 (F3의 원인).
  const rolesLoadUnobservable =
    observed && observed.rolesLoadedObservable === false && setupErrors.length === 0;
  const roleLoadErrors = setupErrors.filter(function (message) {
    return /malformed agent role|deserialize agent role|agent role file/i.test(String(message));
  });
  if (rolesLoadUnobservable) {
    findings.push(
      notObserved(
        "setup.not_observable",
        "실행 스트림에 역할 목록도 로드 오류도 없어 로드 여부는 판정하지 않는다"
      )
    );
  } else {
    findings.push(
      finding(
        "setup.roles_loaded",
        roleLoadErrors.length === 0,
        roleLoadErrors.length === 0
          ? "역할 정의 로드 오류 없음"
          : roleLoadErrors.length + "건: " + String(roleLoadErrors[0]).slice(0, 120)
      )
    );
  }

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
  if (check.indexOf("setup.") === 0) {
    return "계약 결함";
  }
  if (check.indexOf("routing.") === 0) {
    return "모델 변동";
  }
  return "컨텍스트 부족";
}

module.exports = {
  findOutOfScopeViolations: findOutOfScopeViolations,
  NEEDS_VOCABULARY: NEEDS_VOCABULARY,
  ENVELOPE_FIELDS: ENVELOPE_FIELDS,
  parseEnvelope: parseEnvelope,
  judgeEnvelope: judgeEnvelope,
  judgeRun: judgeRun,
  classifyFailure: classifyFailure,
  sourceExists: sourceExists,
};
