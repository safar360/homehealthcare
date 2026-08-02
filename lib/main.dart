import 'package:flutter/material.dart';
import 'models.dart';

void main() {
  runApp(const PariCareApp());
}

class PariCareApp extends StatelessWidget {
  const PariCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pari Home Healthcare',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB), brightness: Brightness.dark),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF07111F),
        cardColor: const Color(0xFF101B2D),
      ),
      home: const PatientLandingPage(),
    );
  }
}

class PatientLandingPage extends StatefulWidget {
  const PatientLandingPage({super.key});

  @override
  State<PatientLandingPage> createState() => _PatientLandingPageState();
}

class _PatientLandingPageState extends State<PatientLandingPage> {
  final List<String> cities = ['Mumbai', 'Pune', 'Bengaluru', 'Delhi', 'Hyderabad'];
  String selectedCity = 'Mumbai';
  final List<ServiceItem> services = const [
    ServiceItem(
      id: 'nursing',
      name: 'Home Nursing Care',
      category: 'Nursing',
      description: 'Professional nursing support for injections, dressing, catheter care and monitoring.',
      duration: '24/7 support',
      price: 1200,
      imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80',
    ),
    ServiceItem(
      id: 'icu',
      name: 'ICU Setup at Home',
      category: 'Critical Care',
      description: 'Critical care equipment and trained staff for home-based medical support.',
      duration: '24 hours',
      price: 4500,
      imageUrl: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80',
    ),
    ServiceItem(
      id: 'physio',
      name: 'Physiotherapy at Home',
      category: 'Therapy',
      description: 'Recovery and rehabilitation therapy tailored for home visits.',
      duration: '60 min',
      price: 900,
      imageUrl: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80',
    ),
  ];

  final List<String> heroHighlights = [
    'Care from trusted professionals',
    'Fast booking for urgent needs',
    'Live support for home recovery',
  ];

  Future<void> openBookingSheet(ServiceItem service) async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final addressController = TextEditingController();
    final noteController = TextEditingController();

    final result = await showModalBottomSheet<OrderRequest>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF101B2D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.8),
          child: SingleChildScrollView(
            child: Padding(
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
                  Text('Book ${service.name}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Patient / family name'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Phone number'),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: selectedCity,
                    items: cities.map((city) => DropdownMenuItem(value: city, child: Text(city))).toList(),
                    onChanged: (value) => setState(() => selectedCity = value ?? selectedCity),
                    decoration: const InputDecoration(labelText: 'City'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: addressController,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Address / locality'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: noteController,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Additional note'),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () {
                        Navigator.pop(sheetContext, OrderRequest(
                          serviceId: service.id,
                          patientName: nameController.text.trim().isEmpty ? 'Patient' : nameController.text.trim(),
                          phoneNumber: phoneController.text.trim().isEmpty ? 'Pending' : phoneController.text.trim(),
                          city: selectedCity,
                          address: addressController.text.trim().isEmpty ? 'Address pending' : addressController.text.trim(),
                          preferredTime: 'Today',
                          note: noteController.text.trim(),
                        ));
                      },
                      child: const Text('Request service'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );

    if (result != null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Request received for ${service.name} in $selectedCity')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 140,
            pinned: true,
            backgroundColor: const Color(0xFF07111F),
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 16, bottom: 16),
              title: const Text('Pari Home Healthcare'),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: DropdownButton<String>(
                  value: selectedCity,
                  dropdownColor: const Color(0xFF101B2D),
                  underline: const SizedBox(),
                  icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white),
                  items: cities.map((city) => DropdownMenuItem(value: city, child: Text(city))).toList(),
                  onChanged: (value) => setState(() => selectedCity = value ?? selectedCity),
                ),
              ),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF4F46E5)]),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Trusted home care at your doorstep', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
                        const SizedBox(height: 8),
                        Text('Book nursing, rehab, ICU support and elder care with a modern booking experience in $selectedCity.', style: const TextStyle(color: Colors.white70)),
                        const SizedBox(height: 16),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: heroHighlights.map((highlight) => Container(
                              margin: const EdgeInsets.only(right: 10),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
                              child: Text(highlight, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                            )).toList(),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('Popular services', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 240,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: services.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final service = services[index];
                        return SizedBox(
                          width: 260,
                          child: Card(
                            color: const Color(0xFF101B2D),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                            child: InkWell(
                              onTap: () => openBookingSheet(service),
                              borderRadius: BorderRadius.circular(18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ClipRRect(
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                                    child: Image.network(
                                      service.imageUrl,
                                      height: 90,
                                      width: double.infinity,
                                      fit: BoxFit.cover,
                                      errorBuilder: (context, error, stackTrace) {
                                        return Container(
                                          height: 90,
                                          color: const Color(0xFF1F3A5F),
                                          alignment: Alignment.center,
                                          child: const Icon(Icons.medical_services_outlined, color: Colors.white, size: 40),
                                        );
                                      },
                                    ),
                                  ),
                                  Expanded(
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(service.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                          const SizedBox(height: 4),
                                          Expanded(
                                            child: Text(
                                              service.description,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Row(
                                            children: [
                                              Text('₹${service.price.toStringAsFixed(0)}'),
                                              const Spacer(),
                                              FilledButton.tonal(onPressed: () => openBookingSheet(service), child: const Text('Book')),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 20),
                  Card(
                    color: const Color(0xFF101B2D),
                    child: ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.call)),
                      title: const Text('Need instant help?'),
                      subtitle: const Text('Call our care team or request a callback for urgent service.'),
                      trailing: const Icon(Icons.arrow_forward_ios),
                      onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Call us at +91 99999 99999'))),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
