import 'package:flutter/material.dart';

ThemeData buildNarviewTheme() {
  const seed = Color(0xff2563eb);

  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: seed),
    scaffoldBackgroundColor: const Color(0xfff8fafc),
    appBarTheme: const AppBarTheme(
      centerTitle: false,
      elevation: 0,
      scrolledUnderElevation: 1,
      backgroundColor: Colors.white,
      foregroundColor: Color(0xff0f172a),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Color(0xffe2e8f0)),
      ),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: Color(0xfff8fafc),
      disabledColor: Color(0xfff1f5f9),
      selectedColor: Color(0xffdbeafe),
      secondarySelectedColor: Color(0xffdbeafe),
      shape: StadiumBorder(side: BorderSide(color: Color(0xffcbd5e1))),
      side: BorderSide(color: Color(0xffcbd5e1)),
      labelStyle: TextStyle(
        color: Color(0xff334155),
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      secondaryLabelStyle: TextStyle(
        color: Color(0xff1e3a8a),
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      iconTheme: IconThemeData(color: Color(0xff475569), size: 16),
      padding: EdgeInsets.symmetric(horizontal: 8),
    ),
  );
}
