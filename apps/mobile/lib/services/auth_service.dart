/// Auth Service — handles login, signup, Google Sign-In, and session
///
/// 📚 This communicates with Better Auth endpoints on the Next.js backend.
/// Better Auth uses cookie-based sessions. For mobile, we store the
/// session token in Flutter Secure Storage (backed by Keychain/Keystore).

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config/api_config.dart';
import 'api_client.dart';

/// Auth state — tracks whether the user is logged in
class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final Map<String, dynamic>? user;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.user,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
    Map<String, dynamic>? user,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      user: user ?? this.user,
    );
  }
}

/// Auth Notifier — manages authentication state
class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  AuthNotifier(this._api) : super(const AuthState()) {
    // Check for existing session on launch
    _checkSession();
  }

  /// Check if user has an existing valid session
  Future<void> _checkSession() async {
    state = state.copyWith(isLoading: true);
    try {
      final hasToken = await _api.hasToken();
      if (!hasToken) {
        state = state.copyWith(isLoading: false, isAuthenticated: false);
        return;
      }

      final response = await _api.get(ApiConfig.session);
      if (response.statusCode == 200 && response.data['session'] != null) {
        state = state.copyWith(
          isAuthenticated: true,
          isLoading: false,
          user: response.data['session']['user'],
        );
      } else {
        await _api.clearToken();
        state = state.copyWith(isLoading: false, isAuthenticated: false);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, isAuthenticated: false);
    }
  }

  /// Email + password login
  Future<bool> signIn(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _api.post(ApiConfig.signIn, data: {
        'email': email,
        'password': password,
      });

      if (response.statusCode == 200) {
        // Extract session token from response
        final token = response.data['token'] ?? response.data['session']?['token'];
        if (token != null) {
          await _api.setToken(token);
        }
        state = state.copyWith(
          isAuthenticated: true,
          isLoading: false,
          user: response.data['user'],
        );
        return true;
      }
      state = state.copyWith(
        isLoading: false,
        error: 'Invalid email or password',
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Login failed. Please try again.',
      );
      return false;
    }
  }

  /// Email + password signup
  Future<bool> signUp(String name, String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _api.post(ApiConfig.signUp, data: {
        'name': name,
        'email': email,
        'password': password,
      });

      if (response.statusCode == 200 || response.statusCode == 201) {
        final token = response.data['token'] ?? response.data['session']?['token'];
        if (token != null) {
          await _api.setToken(token);
        }
        state = state.copyWith(
          isAuthenticated: true,
          isLoading: false,
          user: response.data['user'],
        );
        return true;
      }
      state = state.copyWith(
        isLoading: false,
        error: response.data['message'] ?? 'Signup failed',
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Signup failed. Please try again.',
      );
      return false;
    }
  }

  /// Google Sign-In
  ///
  /// 📚 FLOW:
  /// 1. Google SDK shows the Google account picker
  /// 2. User selects account → we get an ID token
  /// 3. We send the ID token to Better Auth's social sign-in endpoint
  /// 4. Better Auth creates/links the account and returns a session
  Future<bool> signInWithGoogle() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        state = state.copyWith(isLoading: false);
        return false; // User cancelled
      }

      final googleAuth = await googleUser.authentication;
      final idToken = googleAuth.idToken;

      if (idToken == null) {
        state = state.copyWith(
          isLoading: false,
          error: 'Failed to get Google token',
        );
        return false;
      }

      // Send to Better Auth
      final response = await _api.post(ApiConfig.signInGoogle, data: {
        'provider': 'google',
        'idToken': idToken,
      });

      if (response.statusCode == 200) {
        final token = response.data['token'] ?? response.data['session']?['token'];
        if (token != null) {
          await _api.setToken(token);
        }
        state = state.copyWith(
          isAuthenticated: true,
          isLoading: false,
          user: response.data['user'],
        );
        return true;
      }

      state = state.copyWith(
        isLoading: false,
        error: 'Google sign-in failed',
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Google sign-in failed. Please try again.',
      );
      return false;
    }
  }

  /// Sign out
  Future<void> signOut() async {
    try {
      await _api.post(ApiConfig.signOut);
      await _googleSignIn.signOut();
    } catch (_) {}
    await _api.clearToken();
    state = const AuthState();
  }
}

/// Providers
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final api = ref.read(apiClientProvider);
  return AuthNotifier(api);
});
