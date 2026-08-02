import 'package:flutter/material.dart';

import '../models.dart';

/// Collects the details required to fulfil an order: name, phone, city and
/// location. Returns an [OrderRequest] to the caller, which persists it.
class OrderFormSheet extends StatefulWidget {
  const OrderFormSheet({
    super.key,
    required this.itemType,
    required this.itemId,
    required this.itemName,
    required this.cities,
    required this.selectedCitySlug,
  });

  final String itemType;
  final String itemId;
  final String itemName;
  final List<CityOption> cities;
  final String selectedCitySlug;

  @override
  State<OrderFormSheet> createState() => _OrderFormSheetState();
}

class _OrderFormSheetState extends State<OrderFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _timeController = TextEditingController(text: 'As soon as possible');
  final _noteController = TextEditingController();
  late String _citySlug = widget.selectedCitySlug;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _timeController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.pop(
      context,
      OrderRequest(
        serviceId: widget.itemType == 'service' ? widget.itemId : null,
        productId: widget.itemType == 'product' ? widget.itemId : null,
        itemType: widget.itemType,
        itemName: widget.itemName,
        patientName: _nameController.text.trim(),
        phoneNumber: _phoneController.text.trim(),
        citySlug: _citySlug,
        address: _addressController.text.trim(),
        preferredTime: _timeController.text.trim(),
        note: _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Order ${widget.itemName}',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                'Share your details and our care team will call you back to confirm.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Full name *'),
                validator: (value) =>
                    (value == null || value.trim().length < 2) ? 'Please enter a name' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone number *'),
                validator: (value) {
                  final digits = (value ?? '').replaceAll(RegExp(r'[^0-9]'), '');
                  return digits.length < 10 ? 'Enter a valid phone number' : null;
                },
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: widget.cities.any((city) => city.slug == _citySlug)
                    ? _citySlug
                    : null,
                decoration: const InputDecoration(labelText: 'City *'),
                items: widget.cities
                    .map((city) => DropdownMenuItem(value: city.slug, child: Text(city.name)))
                    .toList(growable: false),
                onChanged: (value) => setState(() => _citySlug = value ?? _citySlug),
                validator: (value) => value == null ? 'Select a city' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _addressController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Location / address *'),
                validator: (value) =>
                    (value == null || value.trim().length < 5) ? 'Please enter a location' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _timeController,
                decoration: const InputDecoration(labelText: 'Preferred time'),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _noteController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Additional note'),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: _submit, child: const Text('Submit order')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
