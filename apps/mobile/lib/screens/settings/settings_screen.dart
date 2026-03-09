/// Settings Screen
///
/// 📚 Features:
/// - Account info (name, email, role)
/// - Observer email management
/// - Notification preferences
/// - Plan management (view/upgrade)
/// - Theme toggle (dark/light)
/// - Sign out

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../services/auth_service.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: IqraTheme.emerald.withValues(alpha: 0.15),
                    child: Text(
                      (user?['name'] as String? ?? '?')[0].toUpperCase(),
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: IqraTheme.emerald,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?['name'] ?? 'Student',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          user?['email'] ?? '',
                          style: TextStyle(color: IqraTheme.slate400, fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: IqraTheme.emerald.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      user?['role'] ?? 'STUDENT',
                      style: const TextStyle(
                        color: IqraTheme.emerald,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Account Section
          _SectionHeader(title: 'Account'),
          _SettingsItem(
            icon: Icons.person_outline,
            title: 'Student Profiles',
            subtitle: 'Manage child profiles',
            onTap: () {/* TODO */},
          ),
          _SettingsItem(
            icon: Icons.email_outlined,
            title: 'Observer Emails',
            subtitle: 'Weekly digest recipients',
            onTap: () {/* TODO */},
          ),
          _SettingsItem(
            icon: Icons.credit_card,
            title: 'Subscription & Billing',
            subtitle: 'View plan, invoices, upgrade',
            onTap: () {/* TODO */},
          ),

          const SizedBox(height: 16),

          // Preferences Section
          _SectionHeader(title: 'Preferences'),
          _SettingsItem(
            icon: Icons.notifications_outlined,
            title: 'Notifications',
            subtitle: 'Push notifications & reminders',
            onTap: () {/* TODO */},
          ),
          _SettingsItem(
            icon: Icons.language,
            title: 'Language',
            subtitle: 'English',
            onTap: () {/* TODO */},
          ),

          const SizedBox(height: 16),

          // Support Section
          _SectionHeader(title: 'Support'),
          _SettingsItem(
            icon: Icons.help_outline,
            title: 'Help & FAQ',
            subtitle: 'Common questions',
            onTap: () {/* TODO */},
          ),
          _SettingsItem(
            icon: Icons.privacy_tip_outlined,
            title: 'Privacy Policy',
            subtitle: 'How we handle your data',
            onTap: () {/* TODO */},
          ),

          const SizedBox(height: 24),

          // Sign Out
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(authProvider.notifier).signOut();
              if (context.mounted) {
                context.goNamed('login');
              }
            },
            icon: const Icon(Icons.logout, color: Colors.red),
            label: const Text('Sign Out', style: TextStyle(color: Colors.red)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Colors.red),
              minimumSize: const Size(double.infinity, 52),
            ),
          ),

          const SizedBox(height: 12),

          // Version
          Center(
            child: Text(
              'Iqra Academy v1.0.0',
              style: TextStyle(color: IqraTheme.slate700, fontSize: 12),
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: IqraTheme.slate400,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _SettingsItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingsItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 4),
      child: ListTile(
        leading: Icon(icon, color: IqraTheme.emerald),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text(subtitle, style: TextStyle(fontSize: 12, color: IqraTheme.slate400)),
        trailing: const Icon(Icons.chevron_right, color: IqraTheme.slate700),
        onTap: onTap,
      ),
    );
  }
}
