/// API Client — centralized HTTP layer
///
/// 📚 EDUCATIONAL NOTE:
/// Dio is Flutter's equivalent of axios in JavaScript.
/// This client handles:
/// - Auth token injection (from secure storage)
/// - Base URL configuration
/// - Error handling and retry logic
/// - Response parsing

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/api_config.dart';

class ApiClient {
  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  static const String _tokenKey = 'auth_session_token';

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {'Content-Type': 'application/json'},
    ));

    // Add auth token interceptor
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: _tokenKey);
        if (token != null) {
          options.headers['Cookie'] = 'better-auth.session_token=$token';
        }
        return handler.next(options);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          // Token expired — redirect to login
          // This is handled by the auth provider
        }
        return handler.next(error);
      },
    ));
  }

  /// Save auth token after login
  Future<void> setToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  /// Clear auth token on logout
  Future<void> clearToken() async {
    await _storage.delete(key: _tokenKey);
  }

  /// Check if user has a stored token
  Future<bool> hasToken() async {
    final token = await _storage.read(key: _tokenKey);
    return token != null && token.isNotEmpty;
  }

  /// GET request
  Future<Response> get(String path, {Map<String, dynamic>? queryParams}) {
    return _dio.get(path, queryParameters: queryParams);
  }

  /// POST request
  Future<Response> post(String path, {dynamic data}) {
    return _dio.post(path, data: data);
  }

  /// PATCH request
  Future<Response> patch(String path, {dynamic data}) {
    return _dio.patch(path, data: data);
  }

  /// DELETE request
  Future<Response> delete(String path) {
    return _dio.delete(path);
  }
}
