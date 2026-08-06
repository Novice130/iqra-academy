/// API Configuration
///
/// 📚 Centralizes all API endpoint definitions.
/// The Flutter app talks to the same Next.js backend as the web app.
/// In development, this is localhost:3000. In production, your domain.

class ApiConfig {
  /// Base URL for the API. Change this for different environments.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000', // Android emulator → host machine
  );

  /// Auth endpoints (handled by Better Auth)
  static const String signIn = '/api/auth/sign-in/email';
  static const String signUp = '/api/auth/sign-up/email';
  static const String signInGoogle = '/api/auth/sign-in/social';
  static const String signOut = '/api/auth/sign-out';
  static const String session = '/api/auth/session';

  /// Student endpoints
  static const String profiles = '/api/students/profiles';
  static const String bookings = '/api/students/bookings';
  static const String progress = '/api/students/progress';

  /// Session endpoints
  static const String sessions = '/api/sessions';
  static String sessionJoin(String id) => '/api/sessions/$id/join';
  static String sessionExtend(String id) => '/api/sessions/$id/extend';

  /// Teacher endpoints
  static const String teacherSessions = '/api/teachers/sessions';
  static const String teacherFeedback = '/api/teachers/feedback';
  static const String teacherCallNow = '/api/teachers/call-now';

  /// Admin endpoints
  static const String adminUsers = '/api/admin/users';

  /// Health check
  static const String health = '/api/health';
}
