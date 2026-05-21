import { parse, type ParserPlugin } from "@babel/parser";
import type { CachedFileSummary } from "./pr-cache";

export type SupportedAnalysisLanguage = "typescript" | "javascript" | "python";
export type DeepAnalysisState = "parsed" | "fallback" | "unsupported" | "unavailable";
export type CodeSymbolKind = "function" | "method" | "class" | "component" | "constant" | "export";
export type CodeRelationshipKind = "same-file-call" | "module-import" | "module-export";

export interface AnalysisFileSource {
  path: string;
  state: "loaded" | "missing" | "unsupported" | "unavailable";
  content: string | null;
  message: string | null;
}

export interface CodeSymbol {
  id: string;
  filePath: string;
  name: string;
  localName: string;
  kind: CodeSymbolKind;
  language: SupportedAnalysisLanguage;
  startLine: number;
  endLine: number;
  exported: boolean;
  reasons: string[];
}

export interface ModuleImport {
  source: string;
  importedNames: string[];
  line: number;
  reason: string;
}

export interface ModuleExport {
  name: string;
  source: string | null;
  line: number;
  reason: string;
}

export interface CodeRelationship {
  id: string;
  kind: CodeRelationshipKind;
  filePath: string;
  fromSymbolId: string | null;
  toSymbolId: string | null;
  fromSymbolName: string | null;
  toSymbolName: string | null;
  targetModule: string | null;
  line: number;
  reason: string;
}

export interface DeepAnalysisResult {
  filePath: string;
  language: SupportedAnalysisLanguage | null;
  state: DeepAnalysisState;
  symbols: CodeSymbol[];
  relationships: CodeRelationship[];
  imports: ModuleImport[];
  exports: ModuleExport[];
  reasons: string[];
}

interface BabelNode {
  type: string;
  loc?: {
    start: { line: number };
    end: { line: number };
  } | null;
  [key: string]: unknown;
}

interface BabelProgram {
  body?: unknown[];
}

interface BabelFile {
  program?: BabelProgram;
  errors?: unknown[];
}

interface PythonRawSymbol {
  name: string;
  localName: string;
  kind: CodeSymbolKind;
  startLine: number;
  indent: number;
  exported: boolean;
  reasons: string[];
}

const supportedExtensions: Record<string, SupportedAnalysisLanguage> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "python",
};

export function getSupportedAnalysisLanguage(path: string): SupportedAnalysisLanguage | null {
  const lowerPath = path.toLowerCase();
  const extension = Object.keys(supportedExtensions)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => lowerPath.endsWith(candidate));

  return extension ? supportedExtensions[extension] : null;
}

export function analyzeFileForDeepSymbols(file: CachedFileSummary, source: AnalysisFileSource | null): DeepAnalysisResult {
  const language = getSupportedAnalysisLanguage(file.path);
  if (!language) {
    return fallbackAnalysis(file.path, null, "Language is not supported by deep analysis yet.", "unsupported");
  }

  if (!source || source.state !== "loaded" || source.content === null) {
    return fallbackAnalysis(
      file.path,
      language,
      source?.message ?? "Full file content is unavailable; using hunk fallback.",
      "unavailable",
    );
  }

  try {
    return language === "python"
      ? analyzePython(file.path, source.content)
      : analyzeJavaScriptLike(file.path, source.content, language);
  } catch (error) {
    return fallbackAnalysis(
      file.path,
      language,
      `Parser failed; using hunk fallback. ${error instanceof Error ? error.message : String(error)}`,
      "fallback",
    );
  }
}

function analyzeJavaScriptLike(
  filePath: string,
  content: string,
  language: "typescript" | "javascript",
): DeepAnalysisResult {
  const ast = parse(content, {
    sourceType: "unambiguous",
    errorRecovery: true,
    plugins: getBabelPlugins(language, filePath),
  }) as unknown as BabelFile;
  const errors = ast.errors ?? [];
  if (errors.length > 0) {
    throw new Error("Syntax errors were reported by the JavaScript parser.");
  }

  const symbols: CodeSymbol[] = [];
  const imports: ModuleImport[] = [];
  const exports: ModuleExport[] = [];
  const body = (ast.program?.body ?? []).filter(isBabelNode);

  for (const node of body) {
    collectTopLevelJavaScriptNode(filePath, language, node, symbols, imports, exports, false);
  }

  const relationships = [
    ...buildSameFileCallRelationships(filePath, symbols, content),
    ...imports.map((moduleImport) => ({
      id: `${filePath}:import:${moduleImport.line}:${moduleImport.source}`,
      kind: "module-import" as const,
      filePath,
      fromSymbolId: null,
      toSymbolId: null,
      fromSymbolName: null,
      toSymbolName: null,
      targetModule: moduleImport.source,
      line: moduleImport.line,
      reason: moduleImport.reason,
    })),
    ...exports
      .filter((moduleExport) => moduleExport.source)
      .map((moduleExport) => ({
        id: `${filePath}:export:${moduleExport.line}:${moduleExport.source}`,
        kind: "module-export" as const,
        filePath,
        fromSymbolId: null,
        toSymbolId: null,
        fromSymbolName: moduleExport.name,
        toSymbolName: null,
        targetModule: moduleExport.source,
        line: moduleExport.line,
        reason: moduleExport.reason,
      })),
  ];

  return {
    filePath,
    language,
    state: "parsed",
    symbols: uniqueSymbols(symbols),
    relationships,
    imports,
    exports,
    reasons: [`Parsed ${language} syntax for changed symbols, imports, exports, and same-file calls.`],
  };
}

function collectTopLevelJavaScriptNode(
  filePath: string,
  language: "typescript" | "javascript",
  node: BabelNode,
  symbols: CodeSymbol[],
  imports: ModuleImport[],
  exports: ModuleExport[],
  exported: boolean,
) {
  if (node.type === "ImportDeclaration") {
    const source = getStringValue(node.source);
    if (source) {
      imports.push({
        source,
        importedNames: getImportNames(node),
        line: getStartLine(node),
        reason: `Imports ${source}.`,
      });
    }
    return;
  }

  if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") {
    const declaration = isBabelNode(node.declaration) ? node.declaration : null;
    if (declaration) {
      collectTopLevelJavaScriptNode(filePath, language, declaration, symbols, imports, exports, true);
    }

    const source = getStringValue(node.source);
    for (const name of getExportNames(node, declaration)) {
      exports.push({
        name,
        source,
        line: getStartLine(node),
        reason: source ? `Re-exports ${name} from ${source}.` : `Exports ${name}.`,
      });
    }
    return;
  }

  if (node.type === "FunctionDeclaration") {
    const name = getIdentifierName(node.id) ?? "default";
    symbols.push(createJavaScriptSymbol(filePath, language, node, name, inferFunctionKind(name, node), exported));
    return;
  }

  if (node.type === "ClassDeclaration") {
    const name = getIdentifierName(node.id) ?? "default";
    symbols.push(createJavaScriptSymbol(filePath, language, node, name, "class", exported));
    for (const method of getClassMethods(node)) {
      const methodName = getPropertyName(method.key);
      if (methodName) {
        symbols.push(createJavaScriptSymbol(filePath, language, method, `${name}.${methodName}`, "method", exported));
      }
    }
    return;
  }

  if (node.type === "VariableDeclaration") {
    for (const declaration of getVariableDeclarators(node)) {
      const name = getIdentifierName(declaration.id);
      if (!name) {
        continue;
      }
      const init = isBabelNode(declaration.init) ? declaration.init : null;
      const kind = init && isFunctionLike(init) ? inferFunctionKind(name, init) : "constant";
      symbols.push(createJavaScriptSymbol(filePath, language, declaration, name, kind, exported));
    }
  }
}

function analyzePython(filePath: string, content: string): DeepAnalysisResult {
  const lines = content.split("\n");
  const imports: ModuleImport[] = [];
  const exports: ModuleExport[] = [];
  const rawSymbols: PythonRawSymbol[] = [];

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const indent = countIndent(line);

    const importMatch = trimmed.match(/^(?:from\s+([.\w]+)\s+import\s+(.+)|import\s+(.+))$/);
    if (importMatch) {
      const source = importMatch[1] ?? importMatch[3]?.split(",")[0]?.trim() ?? "";
      imports.push({
        source,
        importedNames: (importMatch[2] ?? importMatch[3] ?? "")
          .split(",")
          .map((name) => name.trim().split(/\s+as\s+/)[0])
          .filter(Boolean),
        line: lineNumber,
        reason: `Imports ${source}.`,
      });
      continue;
    }

    const classMatch = line.match(/^(\s*)class\s+([A-Za-z_]\w*)\b/);
    if (classMatch) {
      rawSymbols.push({
        name: classMatch[2],
        localName: classMatch[2],
        kind: "class",
        startLine: lineNumber,
        indent,
        exported: !classMatch[2].startsWith("_"),
        reasons: ["Detected a Python class declaration."],
      });
      continue;
    }

    const functionMatch = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\b/);
    if (functionMatch) {
      const classOwner = findPythonClassOwner(rawSymbols, indent);
      const localName = functionMatch[2];
      rawSymbols.push({
        name: classOwner ? `${classOwner.localName}.${localName}` : localName,
        localName,
        kind: classOwner ? "method" : "function",
        startLine: lineNumber,
        indent,
        exported: !localName.startsWith("_"),
        reasons: [classOwner ? "Detected a Python class method." : "Detected a Python function declaration."],
      });
      continue;
    }

    const constantMatch = indent === 0 ? line.match(/^([A-Z_][A-Z0-9_]*)\s*=/) : null;
    if (constantMatch) {
      rawSymbols.push({
        name: constantMatch[1],
        localName: constantMatch[1],
        kind: "constant",
        startLine: lineNumber,
        indent,
        exported: true,
        reasons: ["Detected a Python module-level constant."],
      });
    }
  }

  const symbols = rawSymbols.map((symbol, index) =>
    createPythonSymbol(filePath, symbol, findPythonSymbolEndLine(rawSymbols, index, lines.length)),
  );
  for (const symbol of symbols.filter((candidate) => candidate.exported)) {
    exports.push({
      name: symbol.localName,
      source: null,
      line: symbol.startLine,
      reason: `Exports ${symbol.localName} as a module-level Python declaration.`,
    });
  }

  return {
    filePath,
    language: "python",
    state: "parsed",
    symbols,
    relationships: [
      ...buildSameFileCallRelationships(filePath, symbols, content),
      ...imports.map((moduleImport) => ({
        id: `${filePath}:import:${moduleImport.line}:${moduleImport.source}`,
        kind: "module-import" as const,
        filePath,
        fromSymbolId: null,
        toSymbolId: null,
        fromSymbolName: null,
        toSymbolName: null,
        targetModule: moduleImport.source,
        line: moduleImport.line,
        reason: moduleImport.reason,
      })),
    ],
    imports,
    exports,
    reasons: ["Scanned Python indentation structure for changed symbols, imports, exports, and same-file calls."],
  };
}

function fallbackAnalysis(
  filePath: string,
  language: SupportedAnalysisLanguage | null,
  reason: string,
  state: DeepAnalysisState,
): DeepAnalysisResult {
  return {
    filePath,
    language,
    state,
    symbols: [],
    relationships: [],
    imports: [],
    exports: [],
    reasons: [reason],
  };
}

function createJavaScriptSymbol(
  filePath: string,
  language: "typescript" | "javascript",
  node: BabelNode,
  name: string,
  kind: CodeSymbolKind,
  exported: boolean,
): CodeSymbol {
  const startLine = getStartLine(node);
  const endLine = getEndLine(node);

  return {
    id: `${filePath}:${kind}:${name}:${startLine}`,
    filePath,
    name,
    localName: name.includes(".") ? name.split(".").at(-1) ?? name : name,
    kind,
    language,
    startLine,
    endLine,
    exported,
    reasons: [
      exported ? `Detected exported ${language} ${kind}.` : `Detected ${language} ${kind}.`,
    ],
  };
}

function createPythonSymbol(filePath: string, symbol: PythonRawSymbol, endLine: number): CodeSymbol {
  return {
    id: `${filePath}:${symbol.kind}:${symbol.name}:${symbol.startLine}`,
    filePath,
    name: symbol.name,
    localName: symbol.localName,
    kind: symbol.kind,
    language: "python",
    startLine: symbol.startLine,
    endLine,
    exported: symbol.exported,
    reasons: symbol.reasons,
  };
}

function buildSameFileCallRelationships(filePath: string, symbols: CodeSymbol[], content: string): CodeRelationship[] {
  const lines = content.split("\n");
  const relationships: CodeRelationship[] = [];

  for (const from of symbols) {
    const sourceLines = lines.slice(Math.max(0, from.startLine - 1), from.endLine);
    for (const to of symbols) {
      if (from.id === to.id || to.kind === "constant") {
        continue;
      }

      const callPattern = new RegExp(`(?:\\b|\\.)${escapeRegExp(to.localName)}\\s*\\(`);
      const matchingIndex = sourceLines.findIndex((line) => callPattern.test(line));
      if (matchingIndex === -1) {
        continue;
      }

      const line = from.startLine + matchingIndex;
      relationships.push({
        id: `${filePath}:call:${from.id}:${to.id}:${line}`,
        kind: "same-file-call",
        filePath,
        fromSymbolId: from.id,
        toSymbolId: to.id,
        fromSymbolName: from.name,
        toSymbolName: to.name,
        targetModule: null,
        line,
        reason: `${from.name} calls ${to.name} in the same file.`,
      });
    }
  }

  return relationships;
}

function getBabelPlugins(language: "typescript" | "javascript", filePath: string): ParserPlugin[] {
  const plugins: ParserPlugin[] = [
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "decorators-legacy",
    "dynamicImport",
    "exportDefaultFrom",
    "importMeta",
    "topLevelAwait",
  ];
  if (language === "typescript") {
    plugins.push("typescript");
  }
  if (filePath.endsWith(".jsx") || filePath.endsWith(".tsx")) {
    plugins.push("jsx");
  }
  return plugins;
}

function uniqueSymbols(symbols: CodeSymbol[]) {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    if (seen.has(symbol.id)) {
      return false;
    }
    seen.add(symbol.id);
    return true;
  });
}

function inferFunctionKind(name: string, node: BabelNode): CodeSymbolKind {
  if (/^[A-Z]/.test(name) || returnsJsx(node)) {
    return "component";
  }
  return "function";
}

function returnsJsx(node: BabelNode): boolean {
  let found = false;
  visitBabelNode(node, (candidate) => {
    if (candidate.type === "JSXElement" || candidate.type === "JSXFragment") {
      found = true;
    }
  });
  return found;
}

function visitBabelNode(node: BabelNode, visitor: (node: BabelNode) => void) {
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isBabelNode(item)) {
          visitBabelNode(item, visitor);
        }
      }
    } else if (isBabelNode(value)) {
      visitBabelNode(value, visitor);
    }
  }
}

function getImportNames(node: BabelNode) {
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  return specifiers
    .filter(isBabelNode)
    .map((specifier) => getIdentifierName(specifier.local) ?? getIdentifierName(specifier.imported) ?? "default")
    .filter(Boolean);
}

function getExportNames(node: BabelNode, declaration: BabelNode | null) {
  if (declaration) {
    if (declaration.type === "VariableDeclaration") {
      return getVariableDeclarators(declaration)
        .map((candidate) => getIdentifierName(candidate.id))
        .filter((name): name is string => Boolean(name));
    }
    if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
      return [getIdentifierName(declaration.id) ?? "default"];
    }
  }

  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  return specifiers
    .filter(isBabelNode)
    .map((specifier) => getIdentifierName(specifier.exported) ?? getIdentifierName(specifier.local))
    .filter((name): name is string => Boolean(name));
}

function getClassMethods(node: BabelNode) {
  const body = isBabelNode(node.body) && Array.isArray(node.body.body) ? node.body.body : [];
  return body.filter(isBabelNode).filter((candidate) => candidate.type === "ClassMethod" || candidate.type === "ClassPrivateMethod");
}

function getVariableDeclarators(node: BabelNode) {
  return Array.isArray(node.declarations) ? node.declarations.filter(isBabelNode) : [];
}

function isFunctionLike(node: BabelNode) {
  return ["ArrowFunctionExpression", "FunctionExpression"].includes(node.type);
}

function getIdentifierName(value: unknown): string | null {
  if (!isBabelNode(value)) {
    return null;
  }
  if (value.type === "Identifier" && typeof value.name === "string") {
    return value.name;
  }
  if (value.type === "PrivateName" && isBabelNode(value.id) && typeof value.id.name === "string") {
    return value.id.name;
  }
  return null;
}

function getPropertyName(value: unknown): string | null {
  if (!isBabelNode(value)) {
    return null;
  }
  if (value.type === "Identifier" && typeof value.name === "string") {
    return value.name;
  }
  if ((value.type === "StringLiteral" || value.type === "NumericLiteral") && (typeof value.value === "string" || typeof value.value === "number")) {
    return String(value.value);
  }
  if (value.type === "PrivateName" && isBabelNode(value.id) && typeof value.id.name === "string") {
    return value.id.name;
  }
  return null;
}

function getStringValue(value: unknown): string | null {
  if (isBabelNode(value) && value.type === "StringLiteral" && typeof value.value === "string") {
    return value.value;
  }
  return null;
}

function getStartLine(node: BabelNode) {
  return node.loc?.start.line ?? 1;
}

function getEndLine(node: BabelNode) {
  return node.loc?.end.line ?? getStartLine(node);
}

function isBabelNode(value: unknown): value is BabelNode {
  return Boolean(value && typeof value === "object" && "type" in value && typeof (value as { type: unknown }).type === "string");
}

function countIndent(line: string) {
  return line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
}

function findPythonClassOwner(symbols: PythonRawSymbol[], indent: number) {
  return [...symbols].reverse().find((symbol) => symbol.kind === "class" && symbol.indent < indent);
}

function findPythonSymbolEndLine(symbols: PythonRawSymbol[], index: number, totalLines: number) {
  const symbol = symbols[index];
  const nextPeer = symbols.slice(index + 1).find((candidate) => candidate.indent <= symbol.indent);
  return nextPeer ? Math.max(symbol.startLine, nextPeer.startLine - 1) : totalLines;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
