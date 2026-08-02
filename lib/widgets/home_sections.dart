import 'package:flutter/material.dart';

import '../models.dart';
import 'remote_image.dart';

class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.section});

  final HomeSection section;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          section.title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (section.subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            section.subtitle!,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

IconData iconForName(String name) {
  switch (name) {
    case 'whatsapp':
      return Icons.chat_bubble_outline;
    case 'emergency':
      return Icons.emergency_outlined;
    case 'ambulance':
      return Icons.local_shipping_outlined;
    case 'nurse':
      return Icons.medical_services_outlined;
    case 'facebook':
      return Icons.facebook;
    case 'instagram':
      return Icons.camera_alt_outlined;
    case 'youtube':
      return Icons.play_circle_outline;
    case 'link':
      return Icons.link;
    default:
      return Icons.call;
  }
}

class QuickActionsBar extends StatelessWidget {
  const QuickActionsBar({super.key, required this.actions, required this.onAction});

  final List<QuickAction> actions;
  final ValueChanged<QuickAction> onAction;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: actions
          .map(
            (action) => ActionChip(
              avatar: Icon(iconForName(action.icon), size: 18),
              label: Text(action.label),
              onPressed: () => onAction(action),
            ),
          )
          .toList(growable: false),
    );
  }
}

class ServiceCard extends StatelessWidget {
  const ServiceCard({
    super.key,
    required this.service,
    required this.onCall,
    required this.onWhatsApp,
    required this.onOrder,
  });

  final ServiceItem service;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  final VoidCallback onOrder;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 130,
            width: double.infinity,
            child: RemoteImage(
              url: service.imageUrl,
              fallbackIcon: Icons.medical_services_outlined,
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          service.name,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                      ),
                      if (service.price > 0)
                        Text(
                          '₹${service.price.toStringAsFixed(0)}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Expanded(
                    child: Text(
                      service.shortDescription,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onWhatsApp,
                          icon: const Icon(Icons.chat_bubble_outline, size: 18),
                          label: const Text('WhatsApp'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onCall,
                          icon: const Icon(Icons.call, size: 18),
                          label: const Text('Call'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onOrder,
                      icon: const Icon(Icons.shopping_bag_outlined, size: 18),
                      label: const Text('Order'),
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

class ReviewCard extends StatelessWidget {
  const ReviewCard({super.key, required this.review});

  final ReviewItem review;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 280,
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundImage: review.avatarUrl == null
                        ? null
                        : NetworkImage(review.avatarUrl!),
                    child: review.avatarUrl == null
                        ? Text(review.authorName.characters.first.toUpperCase())
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      review.authorName,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: List.generate(
                  5,
                  (index) => Icon(
                    index < review.rating ? Icons.star : Icons.star_border,
                    size: 16,
                    color: Colors.amber,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: Text(
                  review.comment,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.onOrder,
    required this.onWhatsApp,
  });

  final ProductItem product;
  final VoidCallback onOrder;
  final VoidCallback onWhatsApp;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 110,
            width: double.infinity,
            child: RemoteImage(url: product.imageUrl, fallbackIcon: Icons.inventory_2_outlined),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  product.price > 0
                      ? '₹${product.price.toStringAsFixed(0)}${product.unit.isEmpty ? '' : ' · ${product.unit}'}'
                      : product.unit,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.tonal(onPressed: onOrder, child: const Text('Order')),
                    ),
                    IconButton(
                      onPressed: onWhatsApp,
                      tooltip: 'WhatsApp',
                      icon: const Icon(Icons.chat_bubble_outline),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SocialLinksBar extends StatelessWidget {
  const SocialLinksBar({super.key, required this.links, required this.onTap});

  final List<SocialLink> links;
  final ValueChanged<SocialLink> onTap;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: links
          .map(
            (link) => IconButton.filledTonal(
              tooltip: link.platform,
              onPressed: () => onTap(link),
              icon: Icon(iconForName(link.platform)),
            ),
          )
          .toList(growable: false),
    );
  }
}
