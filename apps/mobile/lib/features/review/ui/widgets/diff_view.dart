import 'package:flutter/material.dart';

class DiffView extends StatelessWidget {
  const DiffView({super.key, required this.path, required this.patch});

  final String path;
  final String? patch;

  @override
  Widget build(BuildContext context) {
    final lines = (patch == null || patch!.isEmpty)
        ? ['Binary or non-text file']
        : patch!.split(RegExp(r'\r?\n'));

    return ListView.builder(
      key: ValueKey(path),
      padding: const EdgeInsets.only(bottom: 12),
      itemCount: lines.length,
      itemBuilder: (context, index) {
        final line = lines[index];
        final colors = _lineColors(line);
        return DecoratedBox(
          decoration: BoxDecoration(color: colors.background),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 34,
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontFeatures: const [FontFeature.tabularFigures()],
                      fontSize: 12,
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    line,
                    style: TextStyle(
                      color: colors.foreground,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

_DiffLineColors _lineColors(String line) {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return const _DiffLineColors(Color(0xffecfdf5), Color(0xff065f46));
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return const _DiffLineColors(Color(0xfffff1f2), Color(0xff9f1239));
  }
  if (line.startsWith('@@')) {
    return const _DiffLineColors(Color(0xffeff6ff), Color(0xff1d4ed8));
  }
  return const _DiffLineColors(Colors.white, Color(0xff0f172a));
}

class _DiffLineColors {
  const _DiffLineColors(this.background, this.foreground);

  final Color background;
  final Color foreground;
}
