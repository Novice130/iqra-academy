/// App Theme — Iqra Academy Design System
///
/// 📚 WHY A CUSTOM THEME?
/// A consistent look across all screens makes the app feel professional.
/// We define colors, typography, and component styles in ONE place.
/// If the admin wants to change the brand color, we change it here.
///
/// DESIGN DECISIONS:
/// - Emerald green (#10b981) as primary — calming, Islamic association
/// - Dark background — easier on the eyes for late-night study sessions
/// - Geist font — modern, clean, matches the web app
/// - Large touch targets — parents and kids with varying dexterity

import 'package:flutter/material.dart';

class IqraTheme {
  // ── Brand Colors ──────────────────────────────────────
  static const emerald = Color(0xFF10B981);
  static const emeraldDark = Color(0xFF065F46);
  static const emeraldLight = Color(0xFFA7F3D0);
  static const amber = Color(0xFFF59E0B);
  static const slate900 = Color(0xFF0F172A);
  static const slate800 = Color(0xFF1E293B);
  static const slate700 = Color(0xFF334155);
  static const slate400 = Color(0xFF94A3B8);
  static const slate200 = Color(0xFFE2E8F0);

  /// Dark theme (default)
  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.dark(
        primary: emerald,
        secondary: amber,
        surface: slate800,
        onSurface: slate200,
        error: const Color(0xFFEF4444),
      ),
      scaffoldBackgroundColor: slate900,

      // App Bar
      appBarTheme: AppBarTheme(
        backgroundColor: slate900,
        foregroundColor: slate200,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),

      // Cards
      cardTheme: CardThemeData(
        color: slate800,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: slate700, width: 1),
        ),
      ),

      // Buttons
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: emerald,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: emerald,
          minimumSize: const Size(double.infinity, 52),
          side: const BorderSide(color: emerald, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),

      // Input Fields
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: slate800,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: slate700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: slate700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: emerald, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        hintStyle: TextStyle(color: slate400),
      ),

      // Bottom Navigation
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: slate800,
        selectedItemColor: emerald,
        unselectedItemColor: slate400,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),

      // Text theme
      textTheme: const TextTheme(
        headlineLarge: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white),
        headlineMedium: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: Colors.white),
        headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white),
        bodyLarge: TextStyle(fontSize: 16, color: Colors.white),
        bodyMedium: TextStyle(fontSize: 14, color: Color(0xFFE2E8F0)),
        bodySmall: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
        labelLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    );
  }

  /// Light theme (optional)
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.light(
        primary: emerald,
        secondary: amber,
        surface: Colors.white,
        onSurface: slate900,
      ),
      scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF0F172A),
        elevation: 0,
      ),
    );
  }
}
