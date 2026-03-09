/// Dashboard Screen — Student's home screen
///
/// 📚 Shows:
/// - Next scheduled class (with "Join" button if live)
/// - Weekly quota remaining (e.g., "3 of 4 classes left")
/// - Recent progress per child profile
/// - Quick action buttons (book, join, settings)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../services/auth_service.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final userName = authState.user?['name'] ?? 'Student';

    return Scaffold(
      appBar: AppBar(
        title: const Text('🕌 Iqra Academy'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              // TODO: Notifications panel
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // TODO: Refresh dashboard data
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Greeting
              Text(
                'Assalamu Alaikum, $userName 👋',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(
                'Ready for your next lesson?',
                style: Theme.of(context).textTheme.bodySmall,
              ),

              const SizedBox(height: 24),

              // Next Class Card
              _NextClassCard(),

              const SizedBox(height: 16),

              // Quota Status
              _QuotaCard(),

              const SizedBox(height: 24),

              // Quick Actions
              Text(
                'Quick Actions',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _QuickActionButton(
                      icon: Icons.calendar_today,
                      label: 'Book Class',
                      color: IqraTheme.emerald,
                      onTap: () => context.goNamed('booking'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _QuickActionButton(
                      icon: Icons.video_call,
                      label: 'Join Now',
                      color: IqraTheme.amber,
                      onTap: () {
                        // TODO: Join next available session
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _QuickActionButton(
                      icon: Icons.bar_chart,
                      label: 'Progress',
                      color: const Color(0xFF8B5CF6),
                      onTap: () {
                        // TODO: Progress screen
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Child Profiles
              Text(
                'Student Profiles',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),

              // Placeholder profiles — will be populated from API
              _ChildProfileCard(
                name: 'Loading...',
                track: 'QAIDAH',
                level: '...',
                progress: 0.0,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Sub-Widgets ──────────────────────────────────────────────────────────────

class _NextClassCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: IqraTheme.emerald.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'NEXT CLASS',
                    style: TextStyle(
                      color: IqraTheme.emerald,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                ),
                const Spacer(),
                const Icon(Icons.access_time, size: 16, color: IqraTheme.emerald),
                const SizedBox(width: 4),
                Text(
                  'In 2 hours',
                  style: TextStyle(color: IqraTheme.slate400, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Qaidah — Lesson 8: Connecting Letters',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'with Ustadh Ali Rahman • 30 minutes • 1:1',
              style: TextStyle(color: IqraTheme.slate400, fontSize: 13),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                // TODO: Join session
              },
              icon: const Icon(Icons.video_call, size: 20),
              label: const Text('Join Class'),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuotaCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This Week',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '3 of 4 classes remaining',
                        style: TextStyle(fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: 0.25,
                          backgroundColor: IqraTheme.slate700,
                          valueColor: const AlwaysStoppedAnimation(IqraTheme.emerald),
                          minHeight: 6,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: IqraTheme.emerald.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '3',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: IqraTheme.emerald,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChildProfileCard extends StatelessWidget {
  final String name;
  final String track;
  final String level;
  final double progress;

  const _ChildProfileCard({
    required this.name,
    required this.track,
    required this.level,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: CircleAvatar(
          backgroundColor: IqraTheme.emerald.withValues(alpha: 0.15),
          child: Text(
            name.isNotEmpty ? name[0] : '?',
            style: const TextStyle(color: IqraTheme.emerald, fontWeight: FontWeight.w600),
          ),
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('$track • $level'),
        trailing: SizedBox(
          width: 40,
          height: 40,
          child: CircularProgressIndicator(
            value: progress,
            backgroundColor: IqraTheme.slate700,
            valueColor: const AlwaysStoppedAnimation(IqraTheme.emerald),
            strokeWidth: 3,
          ),
        ),
      ),
    );
  }
}
