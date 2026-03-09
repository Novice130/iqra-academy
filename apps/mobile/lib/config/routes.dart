/// App Navigation Routes (GoRouter)
///
/// 📚 GoRouter is Flutter's equivalent of React Router.
/// It supports deep linking and URL-based navigation.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/dashboard/dashboard_screen.dart';
import '../screens/booking/booking_screen.dart';
import '../screens/session/live_session_screen.dart';
import '../screens/settings/settings_screen.dart';

/// Main app router configuration.
final appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    // ── Auth Routes ──────────────────────────────────────
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/register',
      name: 'register',
      builder: (context, state) => const RegisterScreen(),
    ),

    // ── Main App (with bottom nav) ──────────────────────
    ShellRoute(
      builder: (context, state, child) {
        return MainShell(child: child);
      },
      routes: [
        GoRoute(
          path: '/dashboard',
          name: 'dashboard',
          builder: (context, state) => const DashboardScreen(),
        ),
        GoRoute(
          path: '/booking',
          name: 'booking',
          builder: (context, state) => const BookingScreen(),
        ),
        GoRoute(
          path: '/settings',
          name: 'settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    ),

    // ── Live Session (full screen, no nav bar) ──────────
    GoRoute(
      path: '/session/:id',
      name: 'live-session',
      builder: (context, state) {
        final sessionId = state.pathParameters['id']!;
        return LiveSessionScreen(sessionId: sessionId);
      },
    ),
  ],
);

/// Main app shell with bottom navigation bar.
///
/// 📚 ShellRoute in GoRouter wraps routes with a shared layout.
/// This is like having a persistent bottom nav that stays while
/// the content above it changes.
class MainShell extends StatelessWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _calculateSelectedIndex(context),
        onDestinationSelected: (index) => _onItemTapped(index, context),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_today),
            label: 'Book',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }

  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    if (location.startsWith('/booking')) return 1;
    if (location.startsWith('/settings')) return 2;
    return 0;
  }

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.goNamed('dashboard');
        break;
      case 1:
        context.goNamed('booking');
        break;
      case 2:
        context.goNamed('settings');
        break;
    }
  }
}
