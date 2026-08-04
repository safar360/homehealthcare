import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models.dart';

class PortalProfile {
  const PortalProfile({
    required this.id,
    required this.fullName,
    required this.role,
    required this.email,
    required this.citySlug,
  });

  final String id;
  final String fullName;
  final String role;
  final String? email;
  final String? citySlug;

  factory PortalProfile.fromJson(Map<String, dynamic> json) => PortalProfile(
    id: json['id']?.toString() ?? '',
    fullName: json['full_name']?.toString() ?? 'User',
    role: json['role']?.toString() ?? 'patient',
    email: json['email']?.toString(),
    citySlug: json['city_slug']?.toString(),
  );
}

class PortalSession {
  const PortalSession({required this.accessToken, required this.profile});

  final String accessToken;
  final PortalProfile profile;
}

class LocationManager {
  const LocationManager({required this.id, required this.fullName, this.email, this.phoneNumber, this.citySlug});

  final String id;
  final String fullName;
  final String? email;
  final String? phoneNumber;
  final String? citySlug;

  factory LocationManager.fromJson(Map<String, dynamic> json) => LocationManager(
    id: json['id']?.toString() ?? '',
    fullName: json['full_name']?.toString() ?? 'Manager',
    email: json['email']?.toString(),
    phoneNumber: json['phone_number']?.toString(),
    citySlug: json['city_slug']?.toString(),
  );
}

class LocationStaffMember {
  const LocationStaffMember({required this.id, required this.fullName, required this.role, this.email, this.phoneNumber, this.citySlug});

  final String id;
  final String fullName;
  final String role;
  final String? email;
  final String? phoneNumber;
  final String? citySlug;

  factory LocationStaffMember.fromJson(Map<String, dynamic> json) => LocationStaffMember(
    id: json['id']?.toString() ?? '',
    fullName: json['full_name']?.toString() ?? 'Staff',
    role: json['role']?.toString() ?? 'staff',
    email: json['email']?.toString(),
    phoneNumber: json['phone_number']?.toString(),
    citySlug: json['city_slug']?.toString(),
  );
}

/// Thin PostgREST client. The app talks straight to Supabase over HTTPS, so no
/// application server has to be hosted or paid for.
class SupabaseService {
  SupabaseService({required this.url, required this.anonKey, http.Client? client})
    : _client = client ?? http.Client();

  factory SupabaseService.fromEnvironment() {
    const fallbackUrl = 'https://svmyprhyfssjdfhclwfh.supabase.co';
    const fallbackAnonKey =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2bXlwcmh5ZnNzamRmaGNsd2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODg2NTksImV4cCI6MjEwMTI2NDY1OX0.kfoyeBaeEB2z882m6NR5YVMmNuE61smWMGc-v-mNZfs';

    return SupabaseService(
      url: const String.fromEnvironment(
        'SUPABASE_URL',
        defaultValue: fallbackUrl,
      ),
      anonKey: const String.fromEnvironment(
        'SUPABASE_ANON_KEY',
        defaultValue: fallbackAnonKey,
      ),
    );
  }

  final String url;
  final String anonKey;
  final http.Client _client;

  bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;

  String _buildBaseUrl() {
    final trimmed = url.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty) return '';
    if (trimmed.endsWith('/rest/v1')) {
      return trimmed.replaceAll('/rest/v1', '');
    }
    return trimmed;
  }

  String _buildEndpoint(String path) {
    final baseUrl = _buildBaseUrl();
    if (baseUrl.isEmpty) return path;
    return '$baseUrl/rest/v1/$path';
  }

  String _buildAuthEndpoint(String path) {
    final baseUrl = _buildBaseUrl();
    if (baseUrl.isEmpty) return path;
    return '$baseUrl/auth/v1/$path';
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'Authorization': 'Bearer $anonKey',
  };

  /// One round trip for the whole home screen, served by `get_home_content`.
  Future<HomeContent> fetchHomeContent({String? citySlug}) async {
    final response = await _client.post(
      Uri.parse(_buildEndpoint('rpc/get_home_content')),
      headers: _headers,
      body: jsonEncode({'p_city_slug': citySlug}),
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load home content: ${response.body}');
    }

    final data = jsonDecode(response.body);
    if (data is! Map<String, dynamic>) {
      throw Exception('Unexpected home content payload');
    }
    return HomeContent.fromJson(data);
  }

  Future<OrderRecord> createOrder(OrderRequest request) async {
    final response = await _client.post(
      Uri.parse(_buildEndpoint('orders')),
      headers: {..._headers, 'Prefer': 'return=representation'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 201 && response.statusCode != 200) {
      throw Exception('Unable to create order: ${response.body}');
    }

    final data = jsonDecode(response.body);
    final row = data is List ? data.first : data;
    return OrderRecord.fromJson(row as Map<String, dynamic>);
  }

  Future<List<OrderRecord>> fetchOrders() async {
    final response = await _client.get(
      Uri.parse(_buildEndpoint('orders?select=*&order=created_at.desc')),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load orders: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(OrderRecord.fromJson).toList(growable: false);
  }

  Future<PortalSession> signIn({required String email, required String password}) async {
    final response = await _client.post(
      Uri.parse(_buildAuthEndpoint('token?grant_type=password')),
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer $anonKey',
      },
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to sign in: ${response.body}');
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final accessToken = body['access_token']?.toString() ?? '';
    if (accessToken.isEmpty) {
      throw Exception('Authentication response missing access token');
    }

    final profileResponse = await _client.get(
      Uri.parse(_buildEndpoint('profiles?select=*&id=eq.${body['user']['id']}')),
      headers: {
        ..._headers,
        'Authorization': 'Bearer $accessToken',
      },
    );

    if (profileResponse.statusCode != 200) {
      throw Exception('Unable to load profile: ${profileResponse.body}');
    }

    final profileData = jsonDecode(profileResponse.body);
    final profileJson = profileData is List && profileData.isNotEmpty
        ? profileData.first as Map<String, dynamic>
        : <String, dynamic>{};
    final profile = PortalProfile.fromJson(profileJson);
    if (profile.id.isEmpty) {
      throw Exception('No profile row found for this auth user. Create a matching profile row with role admin/manager/staff first.');
    }
    return PortalSession(accessToken: accessToken, profile: profile);
  }

  Future<List<LocationManager>> fetchManagers({required String accessToken}) async {
    final response = await _client.get(
      Uri.parse(_buildEndpoint('location_managers?select=*&is_active=eq.true&order=full_name.asc')),
      headers: {
        ..._headers,
        'Authorization': 'Bearer $accessToken',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load managers: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(LocationManager.fromJson).toList(growable: false);
  }

  Future<List<LocationStaffMember>> fetchStaff({required String accessToken, String? citySlug}) async {
    final response = await _client.get(
      Uri.parse(_buildEndpoint('location_staff?select=*&is_active=eq.true${citySlug == null ? '' : '&city_slug=eq.$citySlug'}&order=full_name.asc')),
      headers: {
        ..._headers,
        'Authorization': 'Bearer $accessToken',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load staff: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(LocationStaffMember.fromJson).toList(growable: false);
  }
}
