/// Booking Screen — browse available slots and book classes
///
/// 📚 BUSINESS RULES:
/// - Shows available time slots from teacher availability
/// - Checks quota before allowing booking
/// - 24-hour policy for reschedules
/// - Siblings plan: select which child profile is booking

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';

class BookingScreen extends ConsumerWidget {
  const BookingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Book a Class'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Track selector
            Text('Select Track', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            Row(
              children: [
                _TrackChip(label: 'Qaidah', isSelected: true),
                const SizedBox(width: 8),
                _TrackChip(label: 'Quran Reading', isSelected: false),
                const SizedBox(width: 8),
                _TrackChip(label: 'Hifz', isSelected: false),
              ],
            ),

            const SizedBox(height: 24),

            // Child profile selector (for Siblings plan)
            Text('For Student', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            _ProfileSelector(),

            const SizedBox(height: 24),

            // Date selector
            Text('Select Date', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: 7,
                itemBuilder: (context, index) {
                  final date = DateTime.now().add(Duration(days: index));
                  final days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _DateChip(
                      dayName: days[date.weekday - 1],
                      dayNumber: date.day.toString(),
                      isSelected: index == 0,
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 24),

            // Available time slots
            Text('Available Slots', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            _TimeSlot(time: '9:00 AM', teacher: 'Ustadh Ali Rahman', available: true),
            _TimeSlot(time: '10:00 AM', teacher: 'Ustadha Maryam Khan', available: true),
            _TimeSlot(time: '2:00 PM', teacher: 'Ustadh Ali Rahman', available: false),
            _TimeSlot(time: '4:00 PM', teacher: 'Ustadha Maryam Khan', available: true),

            const SizedBox(height: 24),

            // Book button
            ElevatedButton(
              onPressed: () {
                // TODO: Call booking API
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Class booked successfully! ✅'),
                    backgroundColor: IqraTheme.emerald,
                  ),
                );
              },
              child: const Text('Confirm Booking'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TrackChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  const _TrackChip({required this.label, required this.isSelected});

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: IqraTheme.emerald,
      backgroundColor: IqraTheme.slate800,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : IqraTheme.slate400,
      ),
      onSelected: (_) {},
    );
  }
}

class _ProfileSelector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: IqraTheme.slate800,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: IqraTheme.slate700),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: Color(0xFF065F46),
            child: Text('A', style: TextStyle(color: IqraTheme.emerald)),
          ),
          SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Aisha', style: TextStyle(fontWeight: FontWeight.w600)),
              Text('Qaidah • Lesson 8', style: TextStyle(fontSize: 12, color: IqraTheme.slate400)),
            ],
          ),
          Spacer(),
          Icon(Icons.keyboard_arrow_down, color: IqraTheme.slate400),
        ],
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  final String dayName;
  final String dayNumber;
  final bool isSelected;
  const _DateChip({required this.dayName, required this.dayNumber, required this.isSelected});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      decoration: BoxDecoration(
        color: isSelected ? IqraTheme.emerald : IqraTheme.slate800,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected ? IqraTheme.emerald : IqraTheme.slate700,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(dayName, style: TextStyle(
            fontSize: 11,
            color: isSelected ? Colors.white : IqraTheme.slate400,
          )),
          const SizedBox(height: 4),
          Text(dayNumber, style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: isSelected ? Colors.white : Colors.white,
          )),
        ],
      ),
    );
  }
}

class _TimeSlot extends StatelessWidget {
  final String time;
  final String teacher;
  final bool available;
  const _TimeSlot({required this.time, required this.teacher, required this.available});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: available ? null : IqraTheme.slate800.withValues(alpha: 0.5),
      child: ListTile(
        leading: Icon(
          Icons.schedule,
          color: available ? IqraTheme.emerald : IqraTheme.slate700,
        ),
        title: Text(time, style: TextStyle(
          fontWeight: FontWeight.w600,
          color: available ? null : IqraTheme.slate700,
        )),
        subtitle: Text(teacher, style: TextStyle(
          color: available ? IqraTheme.slate400 : IqraTheme.slate700,
        )),
        trailing: available
            ? const Icon(Icons.check_circle_outline, color: IqraTheme.emerald)
            : Text('Booked', style: TextStyle(color: IqraTheme.slate700, fontSize: 12)),
      ),
    );
  }
}
