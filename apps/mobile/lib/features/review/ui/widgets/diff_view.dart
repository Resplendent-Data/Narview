import 'package:flutter/material.dart';
import 'package:highlight/highlight.dart' as hl;

class DiffView extends StatelessWidget {
  const DiffView({super.key, required this.path, required this.patch});

  final String path;
  final String? patch;

  @override
  Widget build(BuildContext context) {
    final lines = (patch == null || patch!.isEmpty)
        ? ['Binary or non-text file']
        : patch!.split(RegExp(r'\r?\n'));
    final language = _languageForPath(path);
    final maxLineLength = lines.fold<int>(
      0,
      (current, line) => line.length > current ? line.length : current,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final contentWidth = (84 + (maxLineLength * 7.8)).clamp(
          constraints.maxWidth,
          2400.0,
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
                final line = _DiffLine.parse(lines[index]);
                final colors = _lineColors(line.kind);
                return DecoratedBox(
                  decoration: BoxDecoration(color: colors.background),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 34,
                          child: Text(
                            '${index + 1}',
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                              fontSize: 12,
                            ),
                            textAlign: TextAlign.right,
                          ),
                        ),
                        const SizedBox(width: 10),
                        SizedBox(
                          width: 14,
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
                );
              },
            ),
          ),
        );
      },
    );
  }
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

_DiffLineColors _lineColors(_DiffLineKind kind) {
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

class _DiffLine {
  const _DiffLine({
    required this.kind,
    required this.marker,
    required this.code,
    required this.highlight,
  });

  factory _DiffLine.parse(String value) {
    if (value.startsWith('@@')) {
      return _DiffLine(
        kind: _DiffLineKind.hunk,
        marker: '',
        code: value,
        highlight: false,
      );
    }
    if (value.startsWith('+++') || value.startsWith('---')) {
      return _DiffLine(
        kind: _DiffLineKind.metadata,
        marker: '',
        code: value,
        highlight: false,
      );
    }
    if (value.startsWith('+')) {
      return _DiffLine(
        kind: _DiffLineKind.addition,
        marker: '+',
        code: value.substring(1),
        highlight: true,
      );
    }
    if (value.startsWith('-')) {
      return _DiffLine(
        kind: _DiffLineKind.deletion,
        marker: '-',
        code: value.substring(1),
        highlight: true,
      );
    }
    if (value.startsWith(' ')) {
      return _DiffLine(
        kind: _DiffLineKind.context,
        marker: '',
        code: value.substring(1),
        highlight: true,
      );
    }
    return _DiffLine(
      kind: _DiffLineKind.context,
      marker: '',
      code: value,
      highlight: true,
    );
  }

  final _DiffLineKind kind;
  final String marker;
  final String code;
  final bool highlight;
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
