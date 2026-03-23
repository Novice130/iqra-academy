import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../providers/student_provider.dart';
import '../../services/api_client.dart';
import '../../config/api_config.dart';
import '../../services/auth_service.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key});

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  String? _selectedChildId;
  String? _selectedTrack;
  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _selectedTime = const TimeOfDay(hour: 10, minute: 0);

  bool _isBooking = false;

  final List<String> _tracks = ['QAIDAH', 'HAAFIZ', 'ARABIC_BASICS'];

  Future<void> _handleBook() async {
    if (_selectedChildId == null || _selectedTrack == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a student and course track.')),
      );
      return;
    }

    setState(() => _isBooking = true);

    try {
      final api = ref.read(apiClientProvider);

      // Create proper ISO-8601 string for the booking time
      final scheduledAt = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _selectedTime.hour,
        _selectedTime.minute,
      ).toUtc().toIso8601String();

      final res = await api.post(ApiConfig.bookings, data: {
        'profileId': _selectedChildId,
        'courseTrack': _selectedTrack,
        'scheduledAt': scheduledAt,
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        // Refresh provider to update dashboard
        ref.read(studentProvider.notifier).refreshAll();
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Class booked successfully!')),
          );
          context.goNamed('dashboard');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to book class. Try again.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isBooking = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final studentState = ref.watch(studentProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Book a Class'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Select Student',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: IqraTheme.slate800,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: IqraTheme.slate700),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedChildId,
                  hint: const Text('Choose a student profile'),
                  isExpanded: true,
                  dropdownColor: IqraTheme.slate800,
                  icon: const Icon(Icons.keyboard_arrow_down, color: IqraTheme.emerald),
                  items: studentState.profiles.map<DropdownMenuItem<String>>((p) {
                    return DropdownMenuItem<String>(
                      value: p['id'].toString(),
                      child: Text(p['name'] ?? 'Unknown'),
                    );
                  }).toList(),
                  onChanged: (val) {
                    setState(() => _selectedChildId = val);
                  },
                ),
              ),
            ),

            const SizedBox(height: 24),

            Text(
              'Course Track',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: IqraTheme.slate800,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: IqraTheme.slate700),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedTrack,
                  hint: const Text('Choose learning track'),
                  isExpanded: true,
                  dropdownColor: IqraTheme.slate800,
                  icon: const Icon(Icons.keyboard_arrow_down, color: IqraTheme.emerald),
                  items: _tracks.map<DropdownMenuItem<String>>((t) {
                    return DropdownMenuItem<String>(
                      value: t,
                      child: Text(t),
                    );
                  }).toList(),
                  onChanged: (val) {
                    setState(() => _selectedTrack = val);
                  },
                ),
              ),
            ),

            const SizedBox(height: 24),

            Text(
              'Date & Time',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final dt = await showDatePicker(
                        context: context,
                        initialDate: _selectedDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 60)),
                      );
                      if (dt != null) setState(() => _selectedDate = dt);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: IqraTheme.slate800,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: IqraTheme.slate700),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today, size: 20, color: IqraTheme.emerald),
                          const SizedBox(width: 12),
                          Text('${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year}'),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final tm = await showTimePicker(
                        context: context,
                        initialTime: _selectedTime,
                      );
                      if (tm != null) setState(() => _selectedTime = tm);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: IqraTheme.slate800,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: IqraTheme.slate700),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.access_time, size: 20, color: IqraTheme.emerald),
                          const SizedBox(width: 12),
                          Text(_selectedTime.format(context)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 48),

            ElevatedButton(
              onPressed: _isBooking ? null : _handleBook,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: IqraTheme.emerald,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isBooking
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Confirm Booking', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
