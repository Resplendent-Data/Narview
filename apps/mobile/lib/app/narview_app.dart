import 'package:flutter/material.dart';

import 'router.dart';
import 'theme.dart';

class NarviewApp extends StatelessWidget {
  const NarviewApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Narview',
      theme: buildNarviewTheme(),
      routerConfig: narviewRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}
