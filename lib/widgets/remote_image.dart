import 'package:flutter/material.dart';

/// Network image with a graceful placeholder, since image URLs are supplied by
/// the backend and may be missing or unreachable.
class RemoteImage extends StatelessWidget {
  const RemoteImage({
    super.key,
    required this.url,
    this.fallbackIcon = Icons.image_outlined,
    this.height,
    this.width,
  });

  final String url;
  final IconData fallbackIcon;
  final double? height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) return _placeholder(context);
    return Image.network(
      url,
      height: height,
      width: width,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => _placeholder(context),
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : _placeholder(context),
    );
  }

  Widget _placeholder(BuildContext context) => Container(
    height: height,
    width: width,
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    alignment: Alignment.center,
    child: Icon(fallbackIcon, size: 36, color: Theme.of(context).colorScheme.primary),
  );
}
