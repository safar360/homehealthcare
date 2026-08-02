import 'package:url_launcher/url_launcher.dart';

String _digitsOnly(String value) => value.replaceAll(RegExp(r'[^0-9+]'), '');

Future<bool> launchPhoneCall(String phoneNumber) =>
    _launch(Uri.parse('tel:${_digitsOnly(phoneNumber)}'));

Future<bool> launchWhatsApp(String phoneNumber, {String? message}) {
  final number = _digitsOnly(phoneNumber).replaceAll('+', '');
  final query = message == null || message.isEmpty ? '' : '?text=${Uri.encodeComponent(message)}';
  return _launch(Uri.parse('https://wa.me/$number$query'));
}

Future<bool> launchExternalUrl(String url) => _launch(Uri.parse(url));

Future<bool> _launch(Uri uri) async {
  if (!await canLaunchUrl(uri)) return false;
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
