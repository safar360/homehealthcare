class ServiceItem {
  final String id;
  final String name;
  final String category;
  final String description;
  final String duration;
  final double price;

  const ServiceItem({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    required this.duration,
    required this.price,
  });
}

class OrderRequest {
  final String serviceId;
  final String patientName;
  final String address;
  final String preferredTime;
  final String note;

  const OrderRequest({
    required this.serviceId,
    required this.patientName,
    required this.address,
    required this.preferredTime,
    required this.note,
  });
}

class OrderRecord {
  final String id;
  final String serviceId;
  final String serviceName;
  final String patientName;
  final String address;
  final String preferredTime;
  final String status;
  final String note;
  final DateTime createdAt;

  const OrderRecord({
    required this.id,
    required this.serviceId,
    required this.serviceName,
    required this.patientName,
    required this.address,
    required this.preferredTime,
    required this.status,
    required this.note,
    required this.createdAt,
  });
}
