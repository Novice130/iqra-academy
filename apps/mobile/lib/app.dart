/// Root Application Widget
///
/// Sets up the MaterialApp with:
/// - Custom theme (emerald/Islamic design)
/// - GoRouter for navigation
/// - Global error handling

import 'package:flutter/material.dart';

import 'config/theme.dart';
import 'config/routes.dart';

class IqraAcademyApp extends StatelessWidget {
  const IqraAcademyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Iqra Academy',
      debugShowCheckedModeBanner: false,
      theme: IqraTheme.lightTheme,
      darkTheme: IqraTheme.darkTheme,
      themeMode: ThemeMode.dark, // Default to dark mode
      routerConfig: appRouter,
    );
  }
}
