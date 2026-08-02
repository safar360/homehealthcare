import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models.dart';

/// Thin PostgREST client. The app talks straight to Supabase over HTTPS, so no
/// application server has to be hosted or paid for.
class SupabaseService {
  SupabaseService({required this.url, required this.anonKey, http.Client? client})
    : _client = client ?? http.Client();

  factory SupabaseService.fromEnvironment() => SupabaseService(
    url: const String.fromEnvironment('SUPABASE_URL'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  final String url;
  final String anonKey;
  final http.Client _client;

  bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'Authorization': 'Bearer $anonKey',
  };

  /// One round trip for the whole home screen, served by `get_home_content`.
  Future<HomeContent> fetchHomeContent({String? citySlug}) async {
    final response = await _client.post(
      Uri.parse('$url/rest/v1/rpc/get_home_content'),
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
      Uri.parse('$url/rest/v1/orders'),
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
      Uri.parse('$url/rest/v1/orders?select=*&order=created_at.desc'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load orders: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(OrderRecord.fromJson).toList(growable: false);
  }
}
