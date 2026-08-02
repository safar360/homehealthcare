String _text(dynamic value, [String fallback = '']) {
  final result = value?.toString().trim();
  return (result == null || result.isEmpty) ? fallback : result;
}

String? _nullableText(dynamic value) {
  final result = value?.toString().trim();
  return (result == null || result.isEmpty) ? null : result;
}

double _number(dynamic value) => double.tryParse(value?.toString() ?? '') ?? 0;

class CityOption {
  final String slug;
  final String name;
  final String? supportPhone;
  final String? whatsappNumber;

  const CityOption({
    required this.slug,
    required this.name,
    this.supportPhone,
    this.whatsappNumber,
  });

  factory CityOption.fromJson(Map<String, dynamic> json) => CityOption(
    slug: _text(json['slug'], 'city'),
    name: _text(json['name'], 'City'),
    supportPhone: _nullableText(json['support_phone']),
    whatsappNumber: _nullableText(json['whatsapp_number']),
  );
}

class HeroBanner {
  final String id;
  final String title;
  final String? subtitle;
  final String imageUrl;
  final String? ctaLabel;
  final String? ctaUrl;

  const HeroBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    this.subtitle,
    this.ctaLabel,
    this.ctaUrl,
  });

  factory HeroBanner.fromJson(Map<String, dynamic> json) => HeroBanner(
    id: _text(json['id']),
    title: _text(json['title'], 'Home healthcare'),
    subtitle: _nullableText(json['subtitle']),
    imageUrl: _text(json['image_url']),
    ctaLabel: _nullableText(json['cta_label']),
    ctaUrl: _nullableText(json['cta_url']),
  );
}

enum QuickActionType { call, whatsapp, url, section }

class QuickAction {
  final String id;
  final String label;
  final String icon;
  final QuickActionType type;
  final String value;

  const QuickAction({
    required this.id,
    required this.label,
    required this.icon,
    required this.type,
    required this.value,
  });

  factory QuickAction.fromJson(Map<String, dynamic> json) => QuickAction(
    id: _text(json['id']),
    label: _text(json['label'], 'Call'),
    icon: _text(json['icon'], 'call'),
    type: QuickActionType.values.firstWhere(
      (candidate) => candidate.name == _text(json['action_type'], 'call'),
      orElse: () => QuickActionType.call,
    ),
    value: _text(json['action_value']),
  );
}

class ServiceItem {
  final String id;
  final String name;
  final String category;
  final String description;
  final String shortDescription;
  final String duration;
  final double price;
  final String imageUrl;
  final String? phoneNumber;
  final String? whatsappNumber;

  const ServiceItem({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    required this.shortDescription,
    required this.duration,
    required this.price,
    required this.imageUrl,
    this.phoneNumber,
    this.whatsappNumber,
  });

  factory ServiceItem.fromJson(Map<String, dynamic> json) {
    final description = _text(json['description'], 'Care delivered at home.');
    return ServiceItem(
      id: _text(json['id']),
      name: _text(json['name'], 'Service'),
      category: _text(json['category'], 'Care'),
      description: description,
      shortDescription: _text(json['short_description'], description),
      duration: _text(json['duration'], 'As scheduled'),
      price: _number(json['price']),
      imageUrl: _text(json['image_url']),
      phoneNumber: _nullableText(json['phone_number']),
      whatsappNumber: _nullableText(json['whatsapp_number']),
    );
  }
}

class ProductItem {
  final String id;
  final String name;
  final String description;
  final double price;
  final String unit;
  final String imageUrl;
  final String? whatsappNumber;

  const ProductItem({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.unit,
    required this.imageUrl,
    this.whatsappNumber,
  });

  factory ProductItem.fromJson(Map<String, dynamic> json) => ProductItem(
    id: _text(json['id']),
    name: _text(json['name'], 'Product'),
    description: _text(json['description']),
    price: _number(json['price']),
    unit: _text(json['unit']),
    imageUrl: _text(json['image_url']),
    whatsappNumber: _nullableText(json['whatsapp_number']),
  );
}

class ReviewItem {
  final String id;
  final String authorName;
  final int rating;
  final String comment;
  final String? avatarUrl;

  const ReviewItem({
    required this.id,
    required this.authorName,
    required this.rating,
    required this.comment,
    this.avatarUrl,
  });

  factory ReviewItem.fromJson(Map<String, dynamic> json) => ReviewItem(
    id: _text(json['id']),
    authorName: _text(json['author_name'], 'Customer'),
    rating: int.tryParse(json['rating']?.toString() ?? '') ?? 5,
    comment: _text(json['comment']),
    avatarUrl: _nullableText(json['avatar_url']),
  );
}

class SocialLink {
  final String id;
  final String platform;
  final String url;

  const SocialLink({required this.id, required this.platform, required this.url});

  factory SocialLink.fromJson(Map<String, dynamic> json) => SocialLink(
    id: _text(json['id']),
    platform: _text(json['platform'], 'link'),
    url: _text(json['url']),
  );
}

class HomeSection {
  final String key;
  final String title;
  final String? subtitle;

  const HomeSection({required this.key, required this.title, this.subtitle});

  factory HomeSection.fromJson(Map<String, dynamic> json) => HomeSection(
    key: _text(json['key']),
    title: _text(json['title']),
    subtitle: _nullableText(json['subtitle']),
  );
}

/// Everything the patient home screen renders, fetched in one backend call.
class HomeContent {
  final List<CityOption> cities;
  final List<HomeSection> sections;
  final List<HeroBanner> banners;
  final List<QuickAction> quickActions;
  final List<ServiceItem> services;
  final List<ProductItem> products;
  final List<ReviewItem> reviews;
  final List<SocialLink> socialLinks;

  const HomeContent({
    required this.cities,
    required this.sections,
    required this.banners,
    required this.quickActions,
    required this.services,
    required this.products,
    required this.reviews,
    required this.socialLinks,
  });

  static List<T> _list<T>(dynamic value, T Function(Map<String, dynamic>) parse) {
    if (value is! List) return const [];
    return value.whereType<Map<String, dynamic>>().map(parse).toList(growable: false);
  }

  factory HomeContent.fromJson(Map<String, dynamic> json) => HomeContent(
    cities: _list(json['cities'], CityOption.fromJson),
    sections: _list(json['sections'], HomeSection.fromJson),
    banners: _list(json['banners'], HeroBanner.fromJson),
    quickActions: _list(json['quick_actions'], QuickAction.fromJson),
    services: _list(json['services'], ServiceItem.fromJson),
    products: _list(json['products'], ProductItem.fromJson),
    reviews: _list(json['reviews'], ReviewItem.fromJson),
    socialLinks: _list(json['social_links'], SocialLink.fromJson),
  );

  HomeSection sectionFor(String key, String fallbackTitle) {
    for (final section in sections) {
      if (section.key == key) return section;
    }
    return HomeSection(key: key, title: fallbackTitle);
  }

  bool hasSection(String key) => sections.any((section) => section.key == key);
}

class OrderRequest {
  final String? serviceId;
  final String? productId;
  final String itemType;
  final String itemName;
  final String patientName;
  final String phoneNumber;
  final String citySlug;
  final String address;
  final String preferredTime;
  final String note;

  const OrderRequest({
    required this.itemType,
    required this.itemName,
    required this.patientName,
    required this.phoneNumber,
    required this.citySlug,
    required this.address,
    required this.preferredTime,
    required this.note,
    this.serviceId,
    this.productId,
  });

  Map<String, dynamic> toJson() => {
    if (serviceId != null) 'service_id': serviceId,
    if (productId != null) 'product_id': productId,
    'item_type': itemType,
    'item_name': itemName,
    'patient_name': patientName,
    'phone_number': phoneNumber,
    'city_slug': citySlug,
    'address': address,
    'preferred_time': preferredTime,
    'note': note,
    'status': 'pending',
  };
}

class OrderRecord {
  final String id;
  final String itemName;
  final String patientName;
  final String phoneNumber;
  final String citySlug;
  final String address;
  final String preferredTime;
  final String status;
  final String note;
  final DateTime createdAt;

  const OrderRecord({
    required this.id,
    required this.itemName,
    required this.patientName,
    required this.phoneNumber,
    required this.citySlug,
    required this.address,
    required this.preferredTime,
    required this.status,
    required this.note,
    required this.createdAt,
  });

  factory OrderRecord.fromJson(Map<String, dynamic> json) => OrderRecord(
    id: _text(json['id']),
    itemName: _text(json['item_name'], 'Service'),
    patientName: _text(json['patient_name'], 'Patient'),
    phoneNumber: _text(json['phone_number']),
    citySlug: _text(json['city_slug']),
    address: _text(json['address']),
    preferredTime: _text(json['preferred_time'], 'As soon as possible'),
    status: _text(json['status'], 'pending'),
    note: _text(json['note']),
    createdAt: DateTime.tryParse(_text(json['created_at'])) ?? DateTime.now(),
  );
}
