import 'package:flutter/material.dart';

import 'data/demo_content.dart';
import 'models.dart';
import 'portal_page.dart';
import 'services/supabase_service.dart';
import 'utils/contact_launcher.dart';
import 'widgets/hero_carousel.dart';
import 'widgets/home_sections.dart';
import 'widgets/order_form_sheet.dart';

void main() {
  runApp(PariCareApp(backend: SupabaseService.fromEnvironment()));
}

class PariCareApp extends StatelessWidget {
  const PariCareApp({super.key, required this.backend});

  final SupabaseService backend;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pari Home Healthcare',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E7C66)),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      home: PatientHomePage(backend: backend),
    );
  }
}

class PatientHomePage extends StatefulWidget {
  const PatientHomePage({super.key, required this.backend});

  final SupabaseService backend;

  @override
  State<PatientHomePage> createState() => _PatientHomePageState();
}

class _PatientHomePageState extends State<PatientHomePage> {
  HomeContent _content = demoHomeContent();
  String? _citySlug;
  bool _loading = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _citySlug = _content.cities.isEmpty ? null : _content.cities.first.slug;
    _loadContent();
  }

  CityOption? get _city {
    final slug = _citySlug;
    if (slug == null) return null;
    for (final city in _content.cities) {
      if (city.slug == slug) return city;
    }
    return _content.cities.isEmpty ? null : _content.cities.first;
  }

  String get _supportPhone {
    final cityPhone = _city?.supportPhone;
    if (cityPhone != null) return cityPhone;
    for (final action in _content.quickActions) {
      if (action.type == QuickActionType.call) return action.value;
    }
    return '';
  }

  String get _supportWhatsApp {
    final cityWhatsApp = _city?.whatsappNumber;
    if (cityWhatsApp != null) return cityWhatsApp;
    for (final action in _content.quickActions) {
      if (action.type == QuickActionType.whatsapp) return action.value;
    }
    return _supportPhone;
  }

  Future<void> _loadContent() async {
    if (!widget.backend.isConfigured) return;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final content = await widget.backend.fetchHomeContent(citySlug: _citySlug);
      if (!mounted) return;
      setState(() {
        _content = content;
        if (_citySlug == null && content.cities.isNotEmpty) {
          _citySlug = content.cities.first.slug;
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadError = 'Showing offline content: $error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _call(String phoneNumber) async {
    if (phoneNumber.isEmpty) return _notify('No phone number configured');
    if (!await launchPhoneCall(phoneNumber)) _notify('Call us at $phoneNumber');
  }

  Future<void> _whatsApp(String phoneNumber, String message) async {
    if (phoneNumber.isEmpty) return _notify('No WhatsApp number configured');
    if (!await launchWhatsApp(phoneNumber, message: message)) {
      _notify('WhatsApp us at $phoneNumber');
    }
  }

  Future<void> _openUrl(String url) async {
    if (url.isEmpty) return;
    if (!await launchExternalUrl(url)) _notify('Unable to open $url');
  }

  Future<void> _handleQuickAction(QuickAction action) async {
    switch (action.type) {
      case QuickActionType.call:
        await _call(action.value);
      case QuickActionType.whatsapp:
        await _whatsApp(action.value, 'Hello, I need home healthcare support.');
      case QuickActionType.url:
      case QuickActionType.section:
        await _openUrl(action.value);
    }
  }

  Future<void> _startOrder({
    required String itemType,
    required String itemId,
    required String itemName,
  }) async {
    final request = await showModalBottomSheet<OrderRequest>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => OrderFormSheet(
        itemType: itemType,
        itemId: itemId,
        itemName: itemName,
        cities: _content.cities,
        selectedCitySlug: _citySlug ?? '',
      ),
    );

    if (request == null) return;

    if (!widget.backend.isConfigured) {
      _notify('Order captured for ${request.itemName} (backend not configured)');
      return;
    }

    try {
      await widget.backend.createOrder(request);
      _notify('Order placed for ${request.itemName}. Our team will call you shortly.');
    } catch (error) {
      _notify('Could not submit the order: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: _CityPicker(
          cities: _content.cities,
          selectedSlug: _citySlug,
          onChanged: (slug) {
            setState(() => _citySlug = slug);
            _loadContent();
          },
        ),
        actions: [
          IconButton(
            tooltip: 'WhatsApp',
            onPressed: () => _whatsApp(_supportWhatsApp, 'Hello, I need home healthcare support.'),
            icon: const Icon(Icons.chat_bubble_outline),
          ),
          IconButton(
            tooltip: 'Call',
            onPressed: () => _call(_supportPhone),
            icon: const Icon(Icons.call),
          ),
          IconButton(
            tooltip: 'Portal',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => PortalLoginPage(backend: widget.backend)),
            ),
            icon: const Icon(Icons.admin_panel_settings_outlined),
          ),
          const SizedBox(width: 4),
        ],
        bottom: _loading
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(minHeight: 2),
              )
            : null,
      ),
      body: RefreshIndicator(
        onRefresh: _loadContent,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            final serviceColumns = width >= 1100 ? 3 : (width >= 700 ? 2 : 1);
            final productColumns = width >= 1100 ? 4 : (width >= 700 ? 3 : 2);
            return ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: [
                if (_loadError != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Text(
                      _loadError!,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                    ),
                  ),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1200),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: _buildSections(serviceColumns, productColumns),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  List<Widget> _buildSections(int serviceColumns, int productColumns) {
    final widgets = <Widget>[];
    final keys = _content.sections.isEmpty
        ? const ['hero', 'quick_actions', 'services', 'reviews', 'products', 'social']
        : _content.sections.map((section) => section.key).toList(growable: false);

    for (final key in keys) {
      final widget = _buildSection(key, serviceColumns, productColumns);
      if (widget != null) widgets.add(widget);
    }
    return widgets;
  }

  Widget? _buildSection(String key, int serviceColumns, int productColumns) {
    const horizontal = EdgeInsets.symmetric(horizontal: 16);
    switch (key) {
      case 'hero':
        if (_content.banners.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.only(top: 16),
          child: HeroCarousel(
            banners: _content.banners,
            onBannerTap: (banner) => _openUrl(banner.ctaUrl ?? ''),
          ),
        );
      case 'quick_actions':
        if (_content.quickActions.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: QuickActionsBar(actions: _content.quickActions, onAction: _handleQuickAction),
        );
      case 'services':
        if (_content.services.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.only(top: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: horizontal,
                child: SectionHeader(section: _content.sectionFor('services', 'Our services')),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: horizontal,
                child: GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _content.services.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: serviceColumns,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    mainAxisExtent: 360,
                  ),
                  itemBuilder: (context, index) {
                    final service = _content.services[index];
                    return ServiceCard(
                      service: service,
                      onCall: () => _call(service.phoneNumber ?? _supportPhone),
                      onWhatsApp: () => _whatsApp(
                        service.whatsappNumber ?? _supportWhatsApp,
                        'Hello, I would like to know more about ${service.name}.',
                      ),
                      onOrder: () => _startOrder(
                        itemType: 'service',
                        itemId: service.id,
                        itemName: service.name,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      case 'reviews':
        if (_content.reviews.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.only(top: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: horizontal,
                child: SectionHeader(section: _content.sectionFor('reviews', 'Customer reviews')),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 190,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: horizontal,
                  itemCount: _content.reviews.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) => ReviewCard(review: _content.reviews[index]),
                ),
              ),
            ],
          ),
        );
      case 'products':
        if (_content.products.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.only(top: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: horizontal,
                child: SectionHeader(section: _content.sectionFor('products', 'Other products')),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: horizontal,
                child: GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _content.products.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: productColumns,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    mainAxisExtent: 250,
                  ),
                  itemBuilder: (context, index) {
                    final product = _content.products[index];
                    return ProductCard(
                      product: product,
                      onOrder: () => _startOrder(
                        itemType: 'product',
                        itemId: product.id,
                        itemName: product.name,
                      ),
                      onWhatsApp: () => _whatsApp(
                        product.whatsappNumber ?? _supportWhatsApp,
                        'Hello, I would like to order ${product.name}.',
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      case 'social':
        if (_content.socialLinks.isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionHeader(section: _content.sectionFor('social', 'Follow us')),
              const SizedBox(height: 12),
              SocialLinksBar(links: _content.socialLinks, onTap: (link) => _openUrl(link.url)),
            ],
          ),
        );
      default:
        return null;
    }
  }
}

class _CityPicker extends StatelessWidget {
  const _CityPicker({required this.cities, required this.selectedSlug, required this.onChanged});

  final List<CityOption> cities;
  final String? selectedSlug;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    if (cities.isEmpty) return const Text('Pari Home Healthcare');
    final selected = cities.firstWhere(
      (city) => city.slug == selectedSlug,
      orElse: () => cities.first,
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.location_on_outlined, size: 20),
        const SizedBox(width: 6),
        PopupMenuButton<String>(
          initialValue: selected.slug,
          tooltip: 'Change city',
          onSelected: onChanged,
          itemBuilder: (context) => cities
              .map((city) => PopupMenuItem(value: city.slug, child: Text(city.name)))
              .toList(growable: false),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(selected.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              const Icon(Icons.keyboard_arrow_down),
            ],
          ),
        ),
      ],
    );
  }
}
