import 'package:flutter/material.dart';
import 'models.dart';
import 'services/supabase_service.dart';

void main() {
  runApp(const HomeHealthcareApp());
}

class HomeHealthcareApp extends StatelessWidget {
  const HomeHealthcareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pari Home Healthcare',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        useMaterial3: true,
        textTheme: const TextTheme(
          headlineSmall: TextStyle(fontWeight: FontWeight.w700),
          titleMedium: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      home: const PatientHomeScreen(),
    );
  }
}

class PatientHomeScreen extends StatefulWidget {
  const PatientHomeScreen({super.key});

  @override
  State<PatientHomeScreen> createState() => _PatientHomeScreenState();
}

class _PatientHomeScreenState extends State<PatientHomeScreen> {
  late final SupabaseService _service;
  List<ServiceItem> _services = [];
  List<OrderRecord> _orders = [];
  bool _loading = true;
  String _statusMessage = 'Preparing your care experience...';

  @override
  void initState() {
    super.initState();
    _service = SupabaseService(
      url: const String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://your-project-ref.supabase.co'),
      anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: 'your-anon-key'),
    );
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final services = await _service.fetchServices();
      final orders = await _service.fetchOrders();
      setState(() {
        _services = services;
        _orders = orders;
        _statusMessage = 'Ready for service booking';
      });
    } catch (error) {
      setState(() => _statusMessage = 'Supabase connection pending: $error');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openBookingSheet(ServiceItem service) async {
    final controllerName = TextEditingController(text: 'Sarah');
    final controllerAddress = TextEditingController(text: '123 Main Street');
    final controllerTime = TextEditingController(text: 'Today 10:00 AM');
    final controllerNote = TextEditingController(text: 'Please arrive with equipment.');

    final result = await showModalBottomSheet<OrderRequest>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 24,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Book ${service.name}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: controllerName, decoration: const InputDecoration(labelText: 'Patient name')),
              const SizedBox(height: 8),
              TextField(controller: controllerAddress, decoration: const InputDecoration(labelText: 'Address')),
              const SizedBox(height: 8),
              TextField(controller: controllerTime, decoration: const InputDecoration(labelText: 'Preferred time')),
              const SizedBox(height: 8),
              TextField(controller: controllerNote, maxLines: 3, decoration: const InputDecoration(labelText: 'Note')),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    Navigator.pop(sheetContext, OrderRequest(
                      serviceId: service.id,
                      patientName: controllerName.text.trim().isEmpty ? 'Patient' : controllerName.text.trim(),
                      address: controllerAddress.text.trim().isEmpty ? 'Address pending' : controllerAddress.text.trim(),
                      preferredTime: controllerTime.text.trim().isEmpty ? 'As soon as possible' : controllerTime.text.trim(),
                      note: controllerNote.text.trim(),
                    ));
                  },
                  child: const Text('Submit order'),
                ),
              ),
            ],
          ),
        );
      },
    );

    if (result != null) {
      try {
        final order = await _service.createOrder(result);
        setState(() {
          _orders.insert(0, order);
          _statusMessage = 'Order submitted successfully';
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order placed for ${order.serviceName}')),
        );
      } catch (error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order failed: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Good morning', style: TextStyle(color: Colors.blueGrey, fontSize: 14)),
                      Text('Welcome back, Sarah', style: Theme.of(context).textTheme.headlineSmall),
                    ],
                  ),
                ),
                CircleAvatar(
                  radius: 24,
                  backgroundColor: const Color(0xFF2563EB).withValues(alpha: 0.15),
                  child: const Icon(Icons.person, color: Color(0xFF2563EB)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF4F46E5)]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Care at home, on demand', style: TextStyle(color: Colors.white, fontSize: 16)),
                  const SizedBox(height: 8),
                  Text('Book a nurse, caregiver, equipment, or therapy service in minutes.', style: TextStyle(color: Colors.white.withValues(alpha: 0.9))),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999)),
                    child: Text(_statusMessage, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('Popular services', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
            else
              ..._services.map((service) => Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: ListTile(
                      title: Text(service.name),
                      subtitle: Text('${service.category} • ${service.duration}'),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('₹${service.price.toStringAsFixed(0)}'),
                          const SizedBox(height: 4),
                          const Icon(Icons.arrow_forward_ios, size: 14),
                        ],
                      ),
                      onTap: () => _openBookingSheet(service),
                    ),
                  )),
            const SizedBox(height: 20),
            Text('Recent orders', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (_orders.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No orders yet. Book your first service to see it here.')))
            else
              ..._orders.map((order) => Card(
                    child: ListTile(
                      title: Text(order.serviceName),
                      subtitle: Text('${order.address} • ${order.preferredTime}'),
                      trailing: Chip(label: Text(order.status)),
                    ),
                  )),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (_services.isNotEmpty) {
            await _openBookingSheet(_services.first);
          }
        },
        icon: const Icon(Icons.add),
        label: const Text('Book service'),
      ),
    );
  }
}
