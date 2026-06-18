import type { CachedFileSummary } from "./pr-cache";
import { buildLazyDiffState, getDefaultLoadedDiffHunkIds, type DiffLine } from "./diff-viewer";

export type SyntaxTokenKind =
  | "plain"
  | "whitespace"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "constant"
  | "symbol"
  | "punctuation";

export interface SyntaxToken {
  value: string;
  kind: SyntaxTokenKind;
  symbolName?: string;
}

export type SymbolLocationKind = "definition" | "reference";
export type SymbolLocationSide = "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";

export interface CodeSymbolLocation {
  id: string;
  name: string;
  kind: SymbolLocationKind;
  path: string;
  line: number | null;
  side: SymbolLocationSide;
  language: string;
  snippet: string;
}

export interface CodeSymbolRecord {
  name: string;
  definitions: CodeSymbolLocation[];
  references: CodeSymbolLocation[];
}

export interface CodeSymbolIndex {
  records: CodeSymbolRecord[];
  recordsByName: Map<string, CodeSymbolRecord>;
}

const keywordSet = new Set([
  "abstract",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "del",
  "do",
  "elif",
  "else",
  "enum",
  "except",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "interface",
  "is",
  "lambda",
  "let",
  "new",
  "not",
  "of",
  "or",
  "pass",
  "raise",
  "return",
  "switch",
  "throw",
  "try",
  "type",
  "var",
  "while",
  "with",
  "yield",
]);

const constantSet = new Set(["False", "None", "True", "false", "null", "self", "super", "this", "true", "undefined"]);

export function buildCodeSymbolIndex(files: CachedFileSummary[]): CodeSymbolIndex {
  const recordsByName = new Map<string, CodeSymbolRecord>();

  for (const file of files) {
    const diffState = buildLazyDiffState(file, {
      mode: "unified",
      repository: "local/local",
      pullRequestNumber: 0,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
    });
    const lines = diffState.fullFileLines ?? diffState.hunks.flatMap((hunk) => hunk.lines);

    for (const line of lines) {
      const definitions = detectDefinitionNames(line.content, line.language);
      const symbolNames = [...new Set(tokenizeCodeLine(line.content, line.language).flatMap((token) => token.symbolName ?? []))];

      for (const name of symbolNames) {
        const kind: SymbolLocationKind = definitions.has(name) ? "definition" : "reference";
        const location = buildLocation(name, kind, file.path, line);
        const record = recordsByName.get(name) ?? { name, definitions: [], references: [] };
        if (kind === "definition") {
          record.definitions = pushUniqueLocation(record.definitions, location);
        } else {
          record.references = pushUniqueLocation(record.references, location);
        }
        recordsByName.set(name, record);
      }
    }
  }

  const records = [...recordsByName.values()].map((record) => ({
    ...record,
    definitions: record.definitions.slice().sort(compareLocations),
    references: record.references.slice().sort(compareLocations),
  }));
  records.sort((left, right) => left.name.localeCompare(right.name));

  return { records, recordsByName: new Map(records.map((record) => [record.name, record])) };
}

export function tokenizeCodeLine(content: string, language = "text"): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];

    if (/\s/.test(char)) {
      const start = index;
      while (index < content.length && /\s/.test(content[index])) {
        index += 1;
      }
      tokens.push({ value: content.slice(start, index), kind: "whitespace" });
      continue;
    }

    if (isLineCommentStart(content, index, language)) {
      tokens.push({ value: content.slice(index), kind: "comment" });
      break;
    }

    if (char === "'" || char === '"' || char === "`") {
      const start = index;
      index += 1;
      while (index < content.length) {
        if (content[index] === "\\") {
          index += 2;
          continue;
        }
        const current = content[index];
        index += 1;
        if (current === char) {
          break;
        }
      }
      tokens.push({ value: content.slice(start, index), kind: "string" });
      continue;
    }

    if (/\d/.test(char)) {
      const start = index;
      while (index < content.length && /[\d._a-fA-FxX]/.test(content[index])) {
        index += 1;
      }
      tokens.push({ value: content.slice(start, index), kind: "number" });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < content.length && isIdentifierPart(content[index])) {
        index += 1;
      }
      const value = content.slice(start, index);
      if (keywordSet.has(value)) {
        tokens.push({ value, kind: "keyword" });
      } else if (constantSet.has(value)) {
        tokens.push({ value, kind: "constant" });
      } else {
        tokens.push({ value, kind: "symbol", symbolName: value });
      }
      continue;
    }

    tokens.push({ value: char, kind: isPunctuation(char) ? "punctuation" : "plain" });
    index += 1;
  }

  return tokens;
}

function detectDefinitionNames(content: string, language: string) {
  const names = new Set<string>();
  const trimmed = content.trim();
  const patterns: RegExp[] = [
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /\b(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/,
    /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
    /^\s*class\s+([A-Za-z_]\w*)/,
    /^\s*func\s+([A-Za-z_]\w*)/,
    /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  ];

  if (language === "python" && /^[A-Z_][A-Z0-9_]*\s*=/.test(trimmed)) {
    names.add(trimmed.split("=")[0].trim());
  }

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) {
      names.add(match[1]);
    }
  }

  return names;
}

function buildLocation(name: string, kind: SymbolLocationKind, path: string, line: DiffLine): CodeSymbolLocation {
  const lineNumber = line.newLine ?? line.oldLine ?? null;
  const side = line.kind === "deletion" ? "LEFT" : line.kind === "addition" ? "RIGHT" : "BOTH";

  return {
    id: `${kind}:${name}:${path}:${side}:${lineNumber ?? "file"}:${stableHash(line.content)}`,
    name,
    kind,
    path,
    line: lineNumber,
    side,
    language: line.language,
    snippet: line.content.trim() || "(blank line)",
  };
}

function pushUniqueLocation(locations: CodeSymbolLocation[], location: CodeSymbolLocation) {
  if (locations.some((existing) => existing.id === location.id)) {
    return locations;
  }
  return [...locations, location];
}

function compareLocations(left: CodeSymbolLocation, right: CodeSymbolLocation) {
  return left.path.localeCompare(right.path) || (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER);
}

function isLineCommentStart(content: string, index: number, language: string) {
  if (content.startsWith("//", index) || content.startsWith("/*", index)) {
    return true;
  }
  return (language === "python" || language === "shell" || language === "yaml" || language === "toml") && content[index] === "#";
}

function isIdentifierStart(char: string) {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string) {
  return /[\w$]/.test(char);
}

function isPunctuation(char: string) {
  return /[{}[\]().,;:+\-*/%=!<>|&?@]/.test(char);
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
