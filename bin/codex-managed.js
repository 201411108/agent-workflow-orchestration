"use strict";

const BEGIN_MARKER = "<!-- BEGIN agent-workflow-orchestration:codex -->";
const END_MARKER = "<!-- END agent-workflow-orchestration:codex -->";
const CONFIG_VALUES = {
  "features.multi_agent": "true",
  "agents.enabled": "true",
  "agents.max_concurrent_threads_per_session": "3",
};

function stripInlineComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote === '"') {
      escaped = true;
      continue;
    }
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character;
      continue;
    }
    if (character === "#" && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function getNewline(contents) {
  return contents.includes("\r\n") ? "\r\n" : "\n";
}

function parseConfig(contents) {
  const newline = getNewline(contents);
  const lines = contents === "" ? [] : contents.split(/\r?\n/);
  const tables = new Map();
  const keys = new Map();
  const dottedRootTables = new Set();
  let table = "";

  for (let index = 0; index < lines.length; index++) {
    const code = stripInlineComment(lines[index]).trim();
    if (!code) {
      continue;
    }
    const arrayTableMatch = code.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
    if (arrayTableMatch) {
      if (arrayTableMatch[1] === "features" || arrayTableMatch[1] === "agents") {
        throw new Error(`managed TOML namespace cannot be an array table: ${arrayTableMatch[1]}`);
      }
      table = arrayTableMatch[1];
      continue;
    }
    const tableMatch = code.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (tableMatch) {
      table = tableMatch[1];
      if (tables.has(table)) {
        throw new Error(`duplicate TOML table [${table}]`);
      }
      tables.set(table, { header: index, end: lines.length });
      continue;
    }
    const keyMatch = code.match(/^([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*=\s*(.+)$/);
    if (!keyMatch) {
      if (/(?:^|[^A-Za-z0-9_-])(features|agents)(?:[^A-Za-z0-9_-]|$)/.test(code)) {
        throw new Error(`unsupported TOML syntax in managed namespace: ${code}`);
      }
      continue;
    }
    const rawName = keyMatch[1];
    const fullKey = table ? `${table}.${rawName}` : rawName;
    const rootName = rawName.split(".")[0];
    if (!table && (rootName === "features" || rootName === "agents")) {
      if (rawName === rootName) {
        throw new Error(`managed TOML namespace is already defined as a value: ${rootName}`);
      }
      dottedRootTables.add(rootName);
    }
    if (keys.has(fullKey)) {
      throw new Error(`duplicate TOML key ${fullKey}`);
    }
    keys.set(fullKey, {
      index,
      table,
      name: rawName,
      value: keyMatch[2].trim(),
    });
  }

  for (const tableName of dottedRootTables) {
    if (tables.has(tableName)) {
      throw new Error(`managed TOML namespace mixes dotted keys and [${tableName}]`);
    }
  }
  const tableEntries = Array.from(tables.entries()).sort((left, right) => left[1].header - right[1].header);
  for (let index = 0; index < tableEntries.length; index++) {
    tableEntries[index][1].end = index + 1 < tableEntries.length ? tableEntries[index + 1][1].header : lines.length;
  }
  return { lines, tables, keys, dottedRootTables, newline };
}

function isCompatibleConfigValue(key, value) {
  if (key === "features.multi_agent" || key === "agents.enabled") {
    return value === "true";
  }
  if (key === "agents.max_concurrent_threads_per_session") {
    return /^[1-9][0-9]*$/.test(value) && Number(value) >= 3;
  }
  return false;
}

function mergeConfig(contents, previous = null) {
  const parsed = parseConfig(contents);
  const previousAdded = new Set((previous && previous.addedKeys) || []);
  const previousValues = (previous && previous.values) || {};
  const addedKeys = [];
  const additions = new Map();

  for (const [fullKey, desiredValue] of Object.entries(CONFIG_VALUES)) {
    const existing = parsed.keys.get(fullKey);
    if (existing) {
      if (previousAdded.has(fullKey) && previousValues[fullKey] && existing.value !== previousValues[fullKey]) {
        throw new Error(`managed TOML key was modified: ${fullKey}`);
      }
      if (!isCompatibleConfigValue(fullKey, existing.value)) {
        throw new Error(`incompatible TOML value for ${fullKey}: ${existing.value}`);
      }
      if (previousAdded.has(fullKey)) {
        addedKeys.push(fullKey);
      }
      continue;
    }
    if (previousAdded.has(fullKey)) {
      throw new Error(`managed TOML key is missing: ${fullKey}`);
    }
    const dot = fullKey.lastIndexOf(".");
    const table = fullKey.slice(0, dot);
    const name = fullKey.slice(dot + 1);
    if (!additions.has(table)) {
      additions.set(table, []);
    }
    additions.get(table).push(`${name} = ${desiredValue}`);
    addedKeys.push(fullKey);
  }

  const lines = [...parsed.lines];
  const existingInsertions = [];
  const dottedInsertions = [];
  const missingTables = [];
  for (const [table, assignments] of additions) {
    if (parsed.tables.has(table)) {
      existingInsertions.push({ index: parsed.tables.get(table).end, assignments });
    } else if (parsed.dottedRootTables.has(table)) {
      dottedInsertions.push(...assignments.map((assignment) => `${table}.${assignment}`));
    } else {
      missingTables.push({ table, assignments });
    }
  }
  existingInsertions.sort((left, right) => right.index - left.index);
  for (const insertion of existingInsertions) {
    lines.splice(insertion.index, 0, ...insertion.assignments);
  }
  if (dottedInsertions.length > 0) {
    const firstTableIndex = lines.findIndex((line) => /^\s*\[\[?[A-Za-z0-9_.-]+\]?\]\s*(?:#.*)?$/.test(line));
    lines.splice(firstTableIndex === -1 ? lines.length : firstTableIndex, 0, ...dottedInsertions);
  }
  for (const missing of missingTables) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(`[${missing.table}]`, ...missing.assignments);
  }

  const result = `${lines.join(parsed.newline).replace(/(?:\r?\n)+$/, "")}${parsed.newline}`;
  const values = {};
  const finalParsed = parseConfig(result);
  for (const key of addedKeys) {
    values[key] = finalParsed.keys.get(key).value;
  }
  return {
    contents: result,
    ownership: {
      addedKeys,
      addedTables: Array.from(
        new Set([...(previous && previous.addedTables ? previous.addedTables : []), ...missingTables.map((entry) => entry.table)])
      ),
      values,
    },
  };
}

function removeManagedConfig(contents, ownership) {
  const addedKeys = new Set((ownership && ownership.addedKeys) || []);
  if (addedKeys.size === 0) {
    return contents;
  }
  const parsed = parseConfig(contents);
  const values = (ownership && ownership.values) || {};
  const removeLines = new Set();
  for (const key of addedKeys) {
    const existing = parsed.keys.get(key);
    if (!existing) {
      throw new Error(`managed TOML key is missing: ${key}`);
    }
    if (values[key] && existing.value !== values[key]) {
      throw new Error(`managed TOML key was modified: ${key}`);
    }
    removeLines.add(existing.index);
  }
  let lines = parsed.lines.filter((line, index) => !removeLines.has(index));
  for (const table of (ownership && ownership.addedTables) || []) {
    const current = parseConfig(lines.join(parsed.newline));
    const entry = current.tables.get(table);
    if (!entry) {
      continue;
    }
    const bodyHasContent = lines
      .slice(entry.header + 1, entry.end)
      .some((line) => stripInlineComment(line).trim() !== "" || line.trim().startsWith("#"));
    if (!bodyHasContent) {
      lines.splice(entry.header, entry.end - entry.header);
    }
  }
  return `${lines.join(parsed.newline).replace(/(?:\r?\n)+$/, "")}${parsed.newline}`;
}

function findManagedBlock(contents) {
  const begins = [];
  const ends = [];
  let offset = 0;
  while ((offset = contents.indexOf(BEGIN_MARKER, offset)) !== -1) {
    begins.push(offset++);
  }
  offset = 0;
  while ((offset = contents.indexOf(END_MARKER, offset)) !== -1) {
    ends.push(offset++);
  }
  if (begins.length === 0 && ends.length === 0) {
    return null;
  }
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    throw new Error("managed AGENTS.md markers are missing, duplicated, or out of order");
  }
  const end = ends[0] + END_MARKER.length;
  return { start: begins[0], end, contents: contents.slice(begins[0], end) };
}

function mergeGuidance(contents, block, previous = null) {
  const existing = findManagedBlock(contents);
  const newline = getNewline(contents);
  const normalizedBlock = block.trim().replace(/\r?\n/g, newline);
  if (!existing) {
    const separator =
      contents === ""
        ? ""
        : contents.endsWith(`${newline}${newline}`)
          ? ""
          : contents.endsWith(newline)
            ? newline
            : `${newline}${newline}`;
    return {
      contents: `${contents}${separator}${normalizedBlock}${newline}`,
      ownership: { added: true, block: normalizedBlock },
    };
  }
  if (!previous || !previous.added) {
    if (existing.contents !== normalizedBlock) {
      throw new Error("an unowned managed AGENTS.md block already exists with different content");
    }
    return { contents, ownership: { added: false, block: existing.contents } };
  }
  if (previous.block && existing.contents !== previous.block) {
    throw new Error("managed AGENTS.md block was modified");
  }
  return {
    contents: `${contents.slice(0, existing.start)}${normalizedBlock}${contents.slice(existing.end)}`,
    ownership: { added: true, block: normalizedBlock },
  };
}

function removeManagedGuidance(contents, ownership) {
  if (!ownership || !ownership.added) {
    return contents;
  }
  const existing = findManagedBlock(contents);
  if (!existing) {
    throw new Error("managed AGENTS.md block is missing");
  }
  if (ownership.block && existing.contents !== ownership.block) {
    throw new Error("managed AGENTS.md block was modified");
  }
  const newline = getNewline(contents);
  const before = contents.slice(0, existing.start).replace(/[ \t]*(?:\r?\n)?$/, "");
  const after = contents.slice(existing.end).replace(/^(?:[ \t]*\r?\n)?/, "");
  if (!before && !after) {
    return "";
  }
  return `${before}${before && after ? `${newline}${newline}` : ""}${after}`.replace(
    /(?:\r?\n)+$/,
    newline
  );
}

module.exports = {
  CONFIG_VALUES,
  mergeConfig,
  mergeGuidance,
  parseConfig,
  removeManagedConfig,
  removeManagedGuidance,
};
