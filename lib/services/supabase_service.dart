import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models.dart';

class SupabaseService {
  SupabaseService({required this.url, required this.anonKey});

  final String url;
  final String anonKey;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer $anonKey',
      };

  Future<List<ServiceItem>> fetchServices() async {
    final response = await http.get(
      Uri.parse('$url/rest/v1/services?select=*'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load services: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.map((item) => ServiceItem(
      id: item['id'].toString(),
      name: item['name'] ?? 'Service',
      category: item['category'] ?? 'Care',
      description: item['description'] ?? 'No description',
      duration: item['duration'] ?? 'As scheduled',
      price: double.tryParse(item['price']?.toString() ?? '0') ?? 0,
    )).toList();
  }

  Future<OrderRecord> createOrder(OrderRequest request) async {
    final body = jsonEncode({
      'service_id': request.serviceId,
      'patient_name': request.patientName,
      'address': request.address,
      'preferred_time': request.preferredTime,
      'note': request.note,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });

    final response = await http.post(
      Uri.parse('$url/rest/v1/orders'),
      headers: _headers,
      body: body,
    );

    if (response.statusCode != 201 && response.statusCode != 200) {
      throw Exception('Unable to create order: ${response.body}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return OrderRecord(
      id: data['id'].toString(),
      serviceId: data['service_id'].toString(),
      serviceName: data['service_name']?.toString() ?? 'Service',
      patientName: data['patient_name']?.toString() ?? request.patientName,
      address: data['address']?.toString() ?? request.address,
      preferredTime: data['preferred_time']?.toString() ?? request.preferredTime,
      status: data['status']?.toString() ?? 'pending',
      note: data['note']?.toString() ?? request.note,
      createdAt: DateTime.parse(data['created_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Future<List<OrderRecord>> fetchOrders() async {
    final response = await http.get(
      Uri.parse('$url/rest/v1/orders?select=*'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Unable to load orders: ${response.body}');
    }

    final data = jsonDecode(response.body) as List<dynamic>;
    return data.map((item) => OrderRecord(
      id: item['id'].toString(),
      serviceId: item['service_id'].toString(),
      serviceName: item['service_name']?.toString() ?? 'Service',
      patientName: item['patient_name']?.toString() ?? 'Patient',
      address: item['address']?.toString() ?? 'Pending address',
      preferredTime: item['preferred_time']?.toString() ?? 'As soon as possible',
      status: item['status']?.toString() ?? 'pending',
      note: item['note']?.toString() ?? '',
      createdAt: DateTime.parse(item['created_at'] ?? DateTime.now().toIso8601String()),
    )).toList();
  }
}
