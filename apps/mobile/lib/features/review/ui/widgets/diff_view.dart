import 'package:flutter/material.dart';
import 'package:highlight/highlight.dart' as hl;

class DiffLineAnchor {
  const DiffLineAnchor({
    required this.path,
    required this.line,
    required this.side,
    required this.codePreview,
    required this.isDeletion,
  });

  final String path;
  final int line;
  final String side;
  final String codePreview;
  final bool isDeletion;

  String get key => keyFor(path, line, side);

  static String keyFor(String path, int line, String side) {
    return '$path:$side:$line';
  }

  @override
  bool operator ==(Object other) {
    return other is DiffLineAnchor &&
        other.path == path &&
        other.line == line &&
        other.side == side;
  }

  @override
  int get hashCode => Object.hash(path, line, side);
}

class DiffView extends StatelessWidget {
  const DiffView({
    super.key,
    required this.path,
    required this.patch,
    this.selectedAnchor,
    this.threadAnchorKeys = const {},
    this.draftAnchorKeys = const {},
    this.onLineTap,
  });

  final String path;
  final String? patch;
  final DiffLineAnchor? selectedAnchor;
  final Set<String> threadAnchorKeys;
  final Set<String> draftAnchorKeys;
  final ValueChanged<DiffLineAnchor>? onLineTap;

  @override
  Widget build(BuildContext context) {
    final rawLines = (patch == null || patch!.isEmpty)
        ? ['Binary or non-text file']
        : patch!.split(RegExp(r'\r?\n'));
    final lines = _parseDiffLines(path, rawLines);
    final language = _languageForPath(path);
    final maxLineLength = rawLines.fold<int>(
      0,
      (current, line) => line.length > current ? line.length : current,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final contentWidth = (132 + (maxLineLength * 7.8)).clamp(
          constraints.maxWidth,
          2600.0,
        );

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: contentWidth.toDouble(),
            child: ListView.builder(
              key: ValueKey(path),
              padding: const EdgeInsets.only(bottom: 12),
              itemCount: lines.length,
              itemBuilder: (context, index) {
                final line = lines[index];
                final anchor = line.anchor;
                final anchorKey = anchor?.key;
                final selected =
                    anchor != null &&
                    selectedAnchor != null &&
                    anchor == selectedAnchor;
                final hasThread =
                    anchorKey != null && threadAnchorKeys.contains(anchorKey);
                final hasDraft =
                    anchorKey != null && draftAnchorKeys.contains(anchorKey);
                final colors = _lineColors(line.kind, selected: selected);

                return Material(
                  key: anchor == null
                      ? null
                      : ValueKey(
                          'diff-line-${anchor.path}-${anchor.side}-${anchor.line}',
                        ),
                  color: colors.background,
                  child: InkWell(
                    onTap: anchor == null || onLineTap == null
                        ? null
                        : () => onLineTap!(anchor),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _LineNumber(value: line.oldLine),
                          _LineNumber(value: line.newLine),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 12,
                            child: Text(
                              line.marker,
                              style: TextStyle(
                                color: colors.markerForeground,
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                height: 1.35,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 22,
                            child: _LineBadges(
                              hasThread: hasThread,
                              hasDraft: hasDraft,
                              selected: selected,
                            ),
                          ),
                          Expanded(
                            child: RichText(
                              softWrap: false,
                              overflow: TextOverflow.visible,
                              text: TextSpan(
                                style: _baseCodeStyle(colors.foreground),
                                children: line.highlight
                                    ? _highlightSpans(line.code, language)
                                    : [TextSpan(text: line.code)],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}

class _LineNumber extends StatelessWidget {
  const _LineNumber({required this.value});

  final int? value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 30,
      child: Text(
        value?.toString() ?? '',
        style: TextStyle(
          color: Colors.grey.shade600,
          fontFeatures: const [FontFeature.tabularFigures()],
          fontSize: 12,
        ),
        textAlign: TextAlign.right,
      ),
    );
  }
}

class _LineBadges extends StatelessWidget {
  const _LineBadges({
    required this.hasThread,
    required this.hasDraft,
    required this.selected,
  });

  final bool hasThread;
  final bool hasDraft;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    if (!hasThread && !hasDraft && !selected) {
      return const SizedBox.shrink();
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (hasThread)
          const Icon(Icons.forum_outlined, color: Color(0xff7c3aed), size: 14),
        if (hasDraft)
          const Icon(Icons.edit_note, color: Color(0xffc2410c), size: 16),
        if (selected && !hasThread && !hasDraft)
          const Icon(Icons.add_comment, color: Color(0xff0f766e), size: 14),
      ],
    );
  }
}

List<_RenderedDiffLine> _parseDiffLines(String path, List<String> values) {
  final lines = <_RenderedDiffLine>[];
  final headerPattern = RegExp(r'^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@');
  var oldLine = 0;
  var newLine = 0;

  for (final value in values) {
    final header = headerPattern.firstMatch(value);
    if (header != null) {
      oldLine = int.parse(header.group(1)!);
      newLine = int.parse(header.group(2)!);
      lines.add(
        _RenderedDiffLine(
          kind: _DiffLineKind.hunk,
          marker: '',
          code: value,
          highlight: false,
          oldLine: null,
          newLine: null,
          anchor: null,
        ),
      );
      continue;
    }

    if (value.startsWith('+++') || value.startsWith('---')) {
      lines.add(
        _RenderedDiffLine(
          kind: _DiffLineKind.metadata,
          marker: '',
          code: value,
          highlight: false,
          oldLine: null,
          newLine: null,
          anchor: null,
        ),
      );
      continue;
    }

    if (value.startsWith('+')) {
      final code = value.substring(1);
      final anchor = DiffLineAnchor(
        path: path,
        line: newLine,
        side: 'RIGHT',
        codePreview: code.trim(),
        isDeletion: false,
      );
      lines.add(
        _RenderedDiffLine(
          kind: _DiffLineKind.addition,
          marker: '+',
          code: code,
          highlight: true,
          oldLine: null,
          newLine: newLine,
          anchor: anchor,
        ),
      );
      newLine += 1;
      continue;
    }

    if (value.startsWith('-')) {
      final code = value.substring(1);
      final anchor = DiffLineAnchor(
        path: path,
        line: oldLine,
        side: 'LEFT',
        codePreview: code.trim(),
        isDeletion: true,
      );
      lines.add(
        _RenderedDiffLine(
          kind: _DiffLineKind.deletion,
          marker: '-',
          code: code,
          highlight: true,
          oldLine: oldLine,
          newLine: null,
          anchor: anchor,
        ),
      );
      oldLine += 1;
      continue;
    }

    final code = value.startsWith(' ') ? value.substring(1) : value;
    final anchor = newLine > 0
        ? DiffLineAnchor(
            path: path,
            line: newLine,
            side: 'RIGHT',
            codePreview: code.trim(),
            isDeletion: false,
          )
        : null;
    lines.add(
      _RenderedDiffLine(
        kind: _DiffLineKind.context,
        marker: '',
        code: code,
        highlight: true,
        oldLine: oldLine > 0 ? oldLine : null,
        newLine: newLine > 0 ? newLine : null,
        anchor: anchor,
      ),
    );
    if (oldLine > 0) oldLine += 1;
    if (newLine > 0) newLine += 1;
  }

  return lines;
}

TextStyle _baseCodeStyle(Color foreground) {
  return TextStyle(
    color: foreground,
    fontFamily: 'monospace',
    fontSize: 13,
    height: 1.35,
  );
}

List<TextSpan> _highlightSpans(String code, String language) {
  try {
    final result = hl.highlight.parse(code, language: language);
    final nodes = result.nodes;
    if (nodes == null || nodes.isEmpty) {
      return [TextSpan(text: code)];
    }
    return _nodeSpans(nodes, const TextStyle());
  } catch (_) {
    return [TextSpan(text: code)];
  }
}

List<TextSpan> _nodeSpans(List<hl.Node> nodes, TextStyle inheritedStyle) {
  final spans = <TextSpan>[];
  for (final node in nodes) {
    final style = inheritedStyle.merge(_styleForClass(node.className));
    final value = node.value;
    if (value != null) {
      spans.add(TextSpan(text: value, style: style));
      continue;
    }
    final children = node.children;
    if (children != null && children.isNotEmpty) {
      spans.addAll(_nodeSpans(children, style));
    }
  }
  return spans;
}

TextStyle? _styleForClass(String? className) {
  if (className == null || className.isEmpty) {
    return null;
  }
  if (_hasAny(className, const ['comment', 'quote'])) {
    return const TextStyle(
      color: Color(0xff64748b),
      fontStyle: FontStyle.italic,
    );
  }
  if (_hasAny(className, const ['keyword', 'selector-tag', 'subst'])) {
    return const TextStyle(
      color: Color(0xff1d4ed8),
      fontWeight: FontWeight.w700,
    );
  }
  if (_hasAny(className, const ['string', 'regexp', 'symbol', 'bullet'])) {
    return const TextStyle(color: Color(0xff047857));
  }
  if (_hasAny(className, const [
    'number',
    'literal',
    'built_in',
    'builtin-name',
  ])) {
    return const TextStyle(color: Color(0xffb45309));
  }
  if (_hasAny(className, const ['title', 'section', 'name', 'selector-id'])) {
    return const TextStyle(
      color: Color(0xff7c3aed),
      fontWeight: FontWeight.w600,
    );
  }
  if (_hasAny(className, const ['type', 'class', 'tag'])) {
    return const TextStyle(color: Color(0xff9333ea));
  }
  if (_hasAny(className, const [
    'attr',
    'attribute',
    'variable',
    'template-variable',
  ])) {
    return const TextStyle(color: Color(0xff0f766e));
  }
  if (_hasAny(className, const ['meta', 'doctag'])) {
    return const TextStyle(color: Color(0xff475569));
  }
  if (_hasAny(className, const ['deletion'])) {
    return const TextStyle(color: Color(0xffbe123c));
  }
  if (_hasAny(className, const ['addition'])) {
    return const TextStyle(color: Color(0xff047857));
  }
  return null;
}

bool _hasAny(String className, List<String> values) {
  final classes = className.split(RegExp(r'\s+'));
  return values.any(classes.contains);
}

_DiffLineColors _lineColors(_DiffLineKind kind, {required bool selected}) {
  if (selected) {
    return const _DiffLineColors(
      Color(0xfffff7ed),
      Color(0xff0f172a),
      Color(0xffc2410c),
    );
  }
  switch (kind) {
    case _DiffLineKind.addition:
      return const _DiffLineColors(
        Color(0xffecfdf5),
        Color(0xff0f172a),
        Color(0xff047857),
      );
    case _DiffLineKind.deletion:
      return const _DiffLineColors(
        Color(0xfffff1f2),
        Color(0xff0f172a),
        Color(0xffbe123c),
      );
    case _DiffLineKind.hunk:
      return const _DiffLineColors(
        Color(0xffeff6ff),
        Color(0xff1d4ed8),
        Color(0xff1d4ed8),
      );
    case _DiffLineKind.metadata:
      return const _DiffLineColors(
        Color(0xfff8fafc),
        Color(0xff475569),
        Color(0xff475569),
      );
    case _DiffLineKind.context:
      return const _DiffLineColors(
        Colors.white,
        Color(0xff0f172a),
        Color(0xff94a3b8),
      );
  }
}

String _languageForPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') ||
      lower.endsWith('.jsx') ||
      lower.endsWith('.mjs')) {
    return 'javascript';
  }
  if (lower.endsWith('.dart')) return 'dart';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.swift')) return 'swift';
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'graphql';
  if (lower.endsWith('.html') ||
      lower.endsWith('.xml') ||
      lower.endsWith('.svg')) {
    return 'xml';
  }
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  if (lower.endsWith('.sh') ||
      lower.endsWith('.zsh') ||
      lower.endsWith('.bash')) {
    return 'bash';
  }
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.proto')) return 'protobuf';
  if (lower.endsWith('dockerfile')) return 'dockerfile';
  if (lower.endsWith('makefile')) return 'makefile';
  return 'plaintext';
}

enum _DiffLineKind { addition, deletion, hunk, metadata, context }

class _RenderedDiffLine {
  const _RenderedDiffLine({
    required this.kind,
    required this.marker,
    required this.code,
    required this.highlight,
    required this.oldLine,
    required this.newLine,
    required this.anchor,
  });

  final _DiffLineKind kind;
  final String marker;
  final String code;
  final bool highlight;
  final int? oldLine;
  final int? newLine;
  final DiffLineAnchor? anchor;
}

class _DiffLineColors {
  const _DiffLineColors(
    this.background,
    this.foreground,
    this.markerForeground,
  );

  final Color background;
  final Color foreground;
  final Color markerForeground;
}
