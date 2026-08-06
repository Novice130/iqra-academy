import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_client.dart';
import '../config/api_config.dart';

class StudentState {
  final bool isLoading;
  final String? error;
  final List<dynamic> profiles;
  final List<dynamic> bookings;

  const StudentState({
    this.isLoading = false,
    this.error,
    this.profiles = const [],
    this.bookings = const [],
  });

  StudentState copyWith({
    bool? isLoading,
    String? error,
    List<dynamic>? profiles,
    List<dynamic>? bookings,
  }) {
    return StudentState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      profiles: profiles ?? this.profiles,
      bookings: bookings ?? this.bookings,
    );
  }
}

class StudentNotifier extends StateNotifier<StudentState> {
  final ApiClient _api;

  StudentNotifier(this._api) : super(const StudentState()) {
    refreshAll();
  }

  Future<void> refreshAll() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final profilesRes = await _api.get(ApiConfig.profiles);
      final bookingsRes = await _api.get(ApiConfig.bookings);

      state = state.copyWith(
        isLoading: false,
        profiles: profilesRes.data ?? [],
        bookings: bookingsRes.data ?? [],
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load student data',
      );
    }
  }
}

// Ensure api layer is imported from auth_service since that provides it
// We will redefine apiClientProvider here or import it from auth_service.
import '../services/auth_service.dart';

final studentProvider = StateNotifierProvider<StudentNotifier, StudentState>((ref) {
  final api = ref.read(apiClientProvider);
  return StudentNotifier(api);
});
