import type { CachedFileSummary } from "./pr-cache";
import { buildLazyDiffState, getDefaultLoadedDiffHunkIds, getLanguageForPath, type DiffLine } from "./diff-viewer";

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
  sides: SymbolLocationSide[];
  language: string;
  snippet: string;
  scopeId: string | null;
  scopeName: string | null;
  scopeStartLine: number | null;
  scopeEndLine: number | null;
  local: boolean;
}

export interface CodeSymbolRecord {
  name: string;
  definitions: CodeSymbolLocation[];
  references: CodeSymbolLocation[];
  scopeId?: string | null;
  scopeName?: string | null;
  scoped?: boolean;
}

export interface CodeSymbolIndex {
  records: CodeSymbolRecord[];
  recordsByName: Map<string, CodeSymbolRecord>;
}

export interface HydratedCodeSourceFile {
  path: string;
  content: string;
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

interface LineEntry {
  index: number;
  line: DiffLine;
  lineNumber: number;
}

interface SymbolScope {
  id: string;
  name: string;
  path: string;
  startLine: number;
  endLine: number | null;
  indent: number;
  kind: "class" | "function";
}

interface LineSymbolContext {
  definitions: Set<string>;
  localDefinitions: Set<string>;
  scope: SymbolScope | null;
}

export function buildCodeSymbolIndex(files: CachedFileSummary[], hydratedFiles: HydratedCodeSourceFile[] = []): CodeSymbolIndex {
  const recordsByName = new Map<string, CodeSymbolRecord>();

  for (const file of files) {
    const diffState = buildLazyDiffState(file, {
      mode: "unified",
      repository: "local/local",
      pullRequestNumber: 0,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
    });
    const lines = diffState.fullFileLines ?? diffState.hunks.flatMap((hunk) => hunk.lines);

    const lineContexts = buildLineSymbolContexts(file.path, lines);

    for (const [index, line] of lines.entries()) {
      const context = lineContexts.get(index) ?? {
        definitions: detectDefinitionNames(line.content, line.language),
        localDefinitions: new Set<string>(),
        scope: null,
      };
      const symbolNames = [...new Set(tokenizeCodeLine(line.content, line.language).flatMap((token) => token.symbolName ?? []))];

      for (const name of symbolNames) {
        const kind: SymbolLocationKind = context.definitions.has(name) ? "definition" : "reference";
        const location = buildLocation(name, kind, file.path, line, context);
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

  for (const file of hydratedFiles) {
    const lines = buildHydratedSourceLines(file.path, file.content);
    const lineContexts = buildLineSymbolContexts(file.path, lines);

    for (const [index, line] of lines.entries()) {
      const context = lineContexts.get(index) ?? {
        definitions: detectDefinitionNames(line.content, line.language),
        localDefinitions: new Set<string>(),
        scope: null,
      };
      const symbolNames = [...new Set(tokenizeCodeLine(line.content, line.language).flatMap((token) => token.symbolName ?? []))];

      for (const name of symbolNames) {
        const kind: SymbolLocationKind = context.definitions.has(name) ? "definition" : "reference";
        const location = buildLocation(name, kind, file.path, line, context);
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

export function inferHydratableDefinitionPaths({
  selection,
  record,
  files,
  hydratedSourceByPath = {},
}: {
  selection: { name: string; path: string; line: number | null };
  record: CodeSymbolRecord | null;
  files: CachedFileSummary[];
  hydratedSourceByPath?: Record<string, string>;
}) {
  const sourceText = getSymbolSourceText(selection.path, files, hydratedSourceByPath);
  if (!sourceText) {
    return [];
  }

  const snippets = [
    ...(record?.definitions ?? []).map((location) => location.snippet),
    ...(record?.references ?? []).map((location) => location.snippet),
    ...sourceText.split("\n").filter((line) => line.includes(selection.name)),
  ];
  const importedNames = inferImportedNames(selection.name, snippets);
  const candidateModules = new Set<string>();

  for (const importedName of importedNames) {
    for (const moduleName of findPythonImportedModules(sourceText, importedName)) {
      candidateModules.add(moduleName);
    }
  }

  if (candidateModules.size === 0) {
    for (const moduleName of findPythonImportedModules(sourceText, selection.name)) {
      candidateModules.add(moduleName);
    }
  }

  return [
    ...new Set(
      [...candidateModules]
        .flatMap((moduleName) => pythonModuleCandidatesForPath(selection.path, moduleName))
        .filter((path) => path !== selection.path),
    ),
  ];
}

function buildHydratedSourceLines(path: string, content: string): DiffLine[] {
  const language = getLanguageForPath(path);
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");

  return lines.map((line, index) => ({
    oldLine: index + 1,
    newLine: index + 1,
    kind: "context",
    content: line,
    highlighted: true,
    language,
    sourceContext: true,
  }));
}

function getSymbolSourceText(path: string, files: CachedFileSummary[], hydratedSourceByPath: Record<string, string>) {
  const hydratedSource = hydratedSourceByPath[path];
  if (hydratedSource) {
    return hydratedSource;
  }

  return files.find((file) => file.path === path)?.patch ?? "";
}

function inferImportedNames(name: string, snippets: string[]) {
  const importedNames = new Set<string>([name]);
  const escapedName = escapeRegExp(name);
  const attributeReference = new RegExp(`\\b([A-Za-z_]\\w*)\\.${escapedName}\\b`, "g");

  for (const snippet of snippets) {
    for (const match of snippet.matchAll(attributeReference)) {
      if (match[1]) {
        importedNames.add(match[1]);
      }
    }
  }

  return importedNames;
}

function findPythonImportedModules(sourceText: string, importedName: string) {
  const modules = new Set<string>();
  const normalizedSource = normalizePythonImportSource(sourceText);

  for (const match of normalizedSource.matchAll(/(?:^|\n)\s*from\s+([.\w]+)\s+import\s+([^\n#]+)/g)) {
    const moduleName = match[1];
    const imports = parsePythonImportList(match[2] ?? "");
    if (moduleName && imports.some((entry) => entry.name === importedName || entry.alias === importedName)) {
      modules.add(moduleName);
    }
  }

  for (const match of normalizedSource.matchAll(/(?:^|\n)\s*import\s+([^\n#]+)/g)) {
    for (const entry of parsePythonImportList(match[1] ?? "")) {
      const exposedName = entry.alias ?? entry.name.split(".").at(-1);
      if (exposedName === importedName) {
        modules.add(entry.name);
      }
    }
  }

  return modules;
}

function normalizePythonImportSource(sourceText: string) {
  const withoutPatchMarkers = sourceText
    .split("\n")
    .map((line) => line.replace(/^[+\- ](?=(?:from|import|\s))/, ""))
    .join("\n");

  return withoutPatchMarkers.replace(/from\s+([.\w]+)\s+import\s*\(([\s\S]*?)\)/g, (_match, moduleName: string, imports: string) => {
    return `from ${moduleName} import ${imports.replace(/\n/g, ",")}`;
  });
}

function parsePythonImportList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim().replace(/[()]/g, ""))
    .filter(Boolean)
    .map((entry) => {
      const [name, alias] = entry.split(/\s+as\s+/);
      return { name: name.trim(), alias: alias?.trim() || null };
    })
    .filter((entry) => /^[.\w]+$/.test(entry.name));
}

function pythonModuleCandidatesForPath(currentPath: string, moduleName: string) {
  const normalizedModule = moduleName.replace(/^\.+/, "").replace(/\./g, "/");
  if (!normalizedModule) {
    return [];
  }

  const candidates: string[] = [];
  const srcRoot = getPathRootThroughSegment(currentPath, "src");
  const appRoot = getPathRootThroughSegment(currentPath, "apps");
  const currentDirectory = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";

  for (const root of [srcRoot, appRoot, currentDirectory, ""]) {
    if (root === null) {
      continue;
    }
    const prefix = root ? `${root}/` : "";
    candidates.push(`${prefix}${normalizedModule}.py`);
    candidates.push(`${prefix}${normalizedModule}/__init__.py`);
  }

  return [...new Set(candidates)];
}

function getPathRootThroughSegment(path: string, segment: string) {
  const parts = path.split("/");
  const index = parts.indexOf(segment);
  if (index === -1) {
    return null;
  }

  return parts.slice(0, index + 1).join("/");
}

export function resolveCodeSymbolRecord(
  index: CodeSymbolIndex,
  selection: { name: string; path: string; line: number | null },
): CodeSymbolRecord | null {
  const record = index.recordsByName.get(selection.name);
  if (!record) {
    return null;
  }

  const clickedLocation = resolveClickedSymbolLocation(record, selection);
  if (!clickedLocation?.scopeId) {
    return collapseEquivalentSideRecord(record, false);
  }

  const scopedDefinitions = record.definitions.filter(
    (location) => location.path === clickedLocation.path && location.scopeId === clickedLocation.scopeId && location.local,
  );
  if (scopedDefinitions.length === 0) {
    return collapseEquivalentSideRecord(record, false);
  }

  return {
    name: record.name,
    definitions: collapseEquivalentSideLocations(scopedDefinitions, true),
    references: collapseEquivalentSideLocations(
      record.references.filter((location) => location.path === clickedLocation.path && location.scopeId === clickedLocation.scopeId),
      true,
    ),
    scopeId: clickedLocation.scopeId,
    scopeName: clickedLocation.scopeName,
    scoped: true,
  };
}

function resolveClickedSymbolLocation(record: CodeSymbolRecord, selection: { path: string; line: number | null }) {
  const locations = [...record.definitions, ...record.references];
  const exactLocation = locations.find((location) => location.path === selection.path && location.line === selection.line);
  if (exactLocation?.scopeId) {
    return exactLocation;
  }

  if (selection.line === null) {
    return exactLocation ?? null;
  }

  const enclosingLocalDefinition = record.definitions
    .filter(
      (location) =>
        location.path === selection.path &&
        location.local &&
        location.scopeId &&
        location.scopeStartLine !== null &&
        location.scopeStartLine <= selection.line! &&
        (location.scopeEndLine === null || selection.line! <= location.scopeEndLine),
    )
    .sort(
      (left, right) =>
        (right.scopeStartLine ?? 0) - (left.scopeStartLine ?? 0) ||
        (right.line ?? 0) - (left.line ?? 0) ||
        left.path.localeCompare(right.path),
    )[0];

  return enclosingLocalDefinition ?? exactLocation ?? null;
}

function collapseEquivalentSideRecord(record: CodeSymbolRecord, allowNearbyLineMerge: boolean): CodeSymbolRecord {
  return {
    ...record,
    definitions: collapseEquivalentSideLocations(record.definitions, allowNearbyLineMerge),
    references: collapseEquivalentSideLocations(record.references, allowNearbyLineMerge),
  };
}

function collapseEquivalentSideLocations(locations: CodeSymbolLocation[], allowNearbyLineMerge: boolean) {
  const collapsed: CodeSymbolLocation[] = [];

  for (const location of locations.slice().sort(compareLocations)) {
    const existingIndex = collapsed.findIndex((existing) => shouldMergeSideLocations(existing, location, allowNearbyLineMerge));
    if (existingIndex === -1) {
      collapsed.push(ensureLocationSides(location));
      continue;
    }

    collapsed[existingIndex] = mergeSideLocations(collapsed[existingIndex], location);
  }

  return collapsed.slice().sort(compareLocations);
}

function shouldMergeSideLocations(left: CodeSymbolLocation, right: CodeSymbolLocation, allowNearbyLineMerge: boolean) {
  if (
    left.name !== right.name ||
    left.kind !== right.kind ||
    left.path !== right.path ||
    left.scopeId !== right.scopeId ||
    normalizeSnippet(left.snippet) !== normalizeSnippet(right.snippet)
  ) {
    return false;
  }

  const sides = new Set([...left.sides, ...right.sides]);
  if (!(sides.has("LEFT") && sides.has("RIGHT"))) {
    return false;
  }

  if (left.line === null || right.line === null) {
    return left.line === right.line;
  }

  return left.line === right.line || (allowNearbyLineMerge && Math.abs(left.line - right.line) <= 40);
}

function mergeSideLocations(left: CodeSymbolLocation, right: CodeSymbolLocation): CodeSymbolLocation {
  const sides = [...new Set([...left.sides, ...right.sides])].sort(compareSides);
  const preferred = [left, right].find((location) => location.side === "RIGHT") ?? left;

  return {
    ...preferred,
    id: `${left.id}+${right.id}`,
    side: sides.includes("LEFT") && sides.includes("RIGHT") ? "BOTH" : preferred.side,
    sides,
  };
}

function ensureLocationSides(location: CodeSymbolLocation): CodeSymbolLocation {
  return {
    ...location,
    sides: location.sides.length > 0 ? location.sides : [location.side],
  };
}

function normalizeSnippet(snippet: string) {
  return snippet.replace(/\s+/g, " ").trim();
}

function compareSides(left: SymbolLocationSide, right: SymbolLocationSide) {
  const order: Record<SymbolLocationSide, number> = {
    LEFT: 0,
    RIGHT: 1,
    BOTH: 2,
    UNKNOWN: 3,
  };
  return order[left] - order[right];
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

  if (language === "python") {
    for (const name of detectPythonLocalDefinitionNames(content)) {
      names.add(name);
    }
  }

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) {
      names.add(match[1]);
    }
  }

  return names;
}

function buildLocation(name: string, kind: SymbolLocationKind, path: string, line: DiffLine, context: LineSymbolContext): CodeSymbolLocation {
  const lineNumber = line.newLine ?? line.oldLine ?? null;
  const side = line.kind === "deletion" ? "LEFT" : line.kind === "addition" ? "RIGHT" : "BOTH";

  return {
    id: `${kind}:${name}:${path}:${side}:${lineNumber ?? "file"}:${stableHash(line.content)}`,
    name,
    kind,
    path,
    line: lineNumber,
    side,
    sides: [side],
    language: line.language,
    snippet: line.content.trim() || "(blank line)",
    scopeId: context.scope?.id ?? null,
    scopeName: context.scope?.name ?? null,
    scopeStartLine: context.scope?.startLine ?? null,
    scopeEndLine: context.scope?.endLine ?? null,
    local: context.localDefinitions.has(name),
  };
}

function buildLineSymbolContexts(path: string, lines: DiffLine[]) {
  const contexts = new Map<number, LineSymbolContext>();
  const entries = lines
    .map((line, index) => ({ index, line, lineNumber: line.newLine ?? line.oldLine ?? null }))
    .filter((entry): entry is LineEntry => entry.lineNumber !== null)
    .sort((left, right) => left.lineNumber - right.lineNumber || left.index - right.index);

  if (entries.length === 0) {
    return contexts;
  }

  const scopeStack: SymbolScope[] = [];
  let signatureScope: SymbolScope | null = null;

  for (const entry of entries) {
    const { line } = entry;
    const language = line.language;
    const content = line.content;
    const indent = getIndent(content);
    const trimmed = content.trim();

    if (language === "python" && !signatureScope && trimmed && !trimmed.startsWith("#")) {
      while (scopeStack.length > 0 && indent <= scopeStack[scopeStack.length - 1].indent && entry.lineNumber > scopeStack[scopeStack.length - 1].startLine) {
        const completedScope = scopeStack.pop();
        if (completedScope) {
          completedScope.endLine = entry.lineNumber - 1;
        }
      }
    }

    const definitions = detectDefinitionNames(content, language);
    const localDefinitions = new Set<string>();
    let scope = scopeStack.at(-1) ?? null;
    const scopeStart = language === "python" ? detectPythonScopeStart(content, path, entry.lineNumber) : null;

    if (scopeStart) {
      scope = scopeStart.scope;
      definitions.add(scopeStart.name);
      scopeStack.push(scopeStart.scope);
      signatureScope = scopeStart.hasOpenSignature ? scopeStart.scope : null;

      for (const name of detectPythonSignatureParameterNames(content)) {
        definitions.add(name);
        localDefinitions.add(name);
      }
    } else if (signatureScope) {
      scope = signatureScope;
      for (const name of detectPythonSignatureParameterNames(content)) {
        definitions.add(name);
        localDefinitions.add(name);
      }
      if (endsPythonSignature(content)) {
        signatureScope = null;
      }
    }

    if (language === "python" && scope) {
      for (const name of detectPythonLocalDefinitionNames(content)) {
        definitions.add(name);
        localDefinitions.add(name);
      }
    }

    contexts.set(entry.index, { definitions, localDefinitions, scope });
  }

  const finalLineNumber = entries.at(-1)?.lineNumber ?? null;
  for (const scope of scopeStack) {
    scope.endLine = finalLineNumber;
  }

  return contexts;
}

function detectPythonScopeStart(content: string, path: string, lineNumber: number) {
  const match = content.match(/^(\s*)(?:(async)\s+)?(def|class)\s+([A-Za-z_]\w*)/);
  if (!match?.[4]) {
    return null;
  }

  const kind = match[3] === "class" ? "class" : "function";
  const name = match[4];
  const indent = match[1].replace(/\t/g, "    ").length;
  return {
    name,
    scope: {
      id: `${path}:${kind}:${name}:${lineNumber}`,
      name: `${kind} ${name}`,
      path,
      startLine: lineNumber,
      endLine: null,
      indent,
      kind,
    } satisfies SymbolScope,
    hasOpenSignature: kind === "function" && !endsPythonSignature(content),
  };
}

function detectPythonSignatureParameterNames(content: string) {
  const names = new Set<string>();
  const trimmed = content.trim();
  const candidate = trimmed
    .replace(/^(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/, "")
    .replace(/\)\s*(?:->.*)?:\s*$/, "");

  for (const segment of candidate.split(",")) {
    const match = segment.trim().match(/^([A-Za-z_]\w*)\s*(?::|=|$)/);
    if (match?.[1] && !constantSet.has(match[1]) && match[1] !== "self" && match[1] !== "cls") {
      names.add(match[1]);
    }
  }

  return names;
}

function detectPythonLocalDefinitionNames(content: string) {
  const names = new Set<string>();
  const trimmed = content.trim();
  const assignment = trimmed.match(/^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/);
  if (assignment?.[1]) {
    names.add(assignment[1]);
  }

  const annotatedField = trimmed.match(/^([A-Za-z_]\w*)\s*:\s*[^=]+$/);
  if (annotatedField?.[1]) {
    names.add(annotatedField[1]);
  }

  const forTarget = trimmed.match(/^for\s+(.+?)\s+in\b/);
  if (forTarget?.[1]) {
    for (const name of forTarget[1].match(/[A-Za-z_]\w*/g) ?? []) {
      names.add(name);
    }
  }

  for (const match of trimmed.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }

  return names;
}

function endsPythonSignature(content: string) {
  return /\)\s*(?:->.*?)?:\s*(?:#.*)?$/.test(content.trim());
}

function getIndent(content: string) {
  return (content.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
