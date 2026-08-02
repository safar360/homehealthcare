import '../models.dart';

const String _nursingImage =
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80';
const String _icuImage =
    'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80';
const String _physioImage =
    'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80';
const String _elderImage =
    'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=900&q=80';
const String _supportPhone = '+919999999999';

/// Mirror of the Supabase seed data. Used when the app is built without
/// Supabase credentials or when the backend is unreachable, so the home screen
/// always renders something meaningful.
final Map<String, dynamic> demoHomeContentJson = {
  'cities': [
    {
      'slug': 'mumbai',
      'name': 'Mumbai',
      'support_phone': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'slug': 'pune',
      'name': 'Pune',
      'support_phone': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'slug': 'bengaluru',
      'name': 'Bengaluru',
      'support_phone': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'slug': 'delhi',
      'name': 'Delhi',
      'support_phone': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
  ],
  'sections': [
    {'key': 'hero', 'title': 'Trusted home care at your doorstep'},
    {'key': 'quick_actions', 'title': 'Quick help'},
    {
      'key': 'services',
      'title': 'Our services',
      'subtitle': 'Care delivered at home by verified professionals',
    },
    {'key': 'reviews', 'title': 'What families say'},
    {
      'key': 'products',
      'title': 'Other products',
      'subtitle': 'Home care essentials delivered to you',
    },
    {'key': 'social', 'title': 'Follow us'},
  ],
  'banners': [
    {
      'id': 'banner-nursing',
      'title': '24x7 home nursing',
      'subtitle': 'Verified nurses at your door within 2 hours',
      'image_url': _nursingImage,
      'cta_label': 'Book now',
      'cta_url': 'tel:$_supportPhone',
    },
    {
      'id': 'banner-icu',
      'title': 'ICU setup at home',
      'subtitle': 'Complete critical care equipment and trained staff',
      'image_url': _icuImage,
      'cta_label': 'Talk to us',
      'cta_url': 'tel:$_supportPhone',
    },
    {
      'id': 'banner-elder',
      'title': 'Elder care plans',
      'subtitle': 'Monthly caregiver plans for seniors',
      'image_url': _elderImage,
      'cta_label': 'See plans',
      'cta_url': 'tel:$_supportPhone',
    },
  ],
  'quick_actions': [
    {
      'id': 'qa-call',
      'label': 'Call us',
      'icon': 'call',
      'action_type': 'call',
      'action_value': _supportPhone,
    },
    {
      'id': 'qa-whatsapp',
      'label': 'WhatsApp',
      'icon': 'whatsapp',
      'action_type': 'whatsapp',
      'action_value': _supportPhone,
    },
    {
      'id': 'qa-emergency',
      'label': 'Emergency',
      'icon': 'emergency',
      'action_type': 'call',
      'action_value': '+919999999900',
    },
  ],
  'services': [
    {
      'id': 'svc-nursing',
      'name': 'Home Nursing Care',
      'category': 'Nursing',
      'description':
          'Professional nursing support for injections, dressing, catheter care and monitoring.',
      'short_description': 'Injections, dressing, catheter and vitals monitoring at home.',
      'duration': '12h / 24h',
      'price': 1200,
      'image_url': _nursingImage,
      'phone_number': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'svc-icu',
      'name': 'ICU Setup at Home',
      'category': 'Critical Care',
      'description': 'Complete home ICU support with equipment and trained staff.',
      'short_description': 'Ventilator, monitor and critical care nurses at home.',
      'duration': '24h',
      'price': 4500,
      'image_url': _icuImage,
      'phone_number': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'svc-physio',
      'name': 'Physiotherapy at Home',
      'category': 'Therapy',
      'description': 'On-demand physiotherapy for recovery and rehabilitation.',
      'short_description': 'Rehab sessions by certified physiotherapists.',
      'duration': '60 min',
      'price': 900,
      'image_url': _physioImage,
      'phone_number': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'svc-elder',
      'name': 'Elder Care Attendant',
      'category': 'Elder Care',
      'description': 'Trained attendants for daily activities, mobility and companionship.',
      'short_description': 'Day and night attendants for seniors.',
      'duration': '12h shift',
      'price': 1100,
      'image_url': _elderImage,
      'phone_number': _supportPhone,
      'whatsapp_number': _supportPhone,
    },
  ],
  'products': [
    {
      'id': 'prd-diapers',
      'name': 'Adult Diapers',
      'description': 'Leak-proof adult diapers, medium and large sizes.',
      'price': 750,
      'unit': 'pack of 10',
      'image_url':
          'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=80',
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'prd-bed',
      'name': 'Hospital Bed on Rent',
      'description': 'Electric or manual hospital bed delivered and installed.',
      'price': 2500,
      'unit': 'per month',
      'image_url':
          'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80',
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'prd-oxygen',
      'name': 'Oxygen Concentrator',
      'description': '5L / 10L oxygen concentrator on rent with delivery.',
      'price': 4500,
      'unit': 'per month',
      'image_url':
          'https://images.unsplash.com/photo-1583912268183-a34d41fe464a?auto=format&fit=crop&w=900&q=80',
      'whatsapp_number': _supportPhone,
    },
    {
      'id': 'prd-wheelchair',
      'name': 'Wheelchair',
      'description': 'Foldable wheelchair for indoor and outdoor use.',
      'price': 1200,
      'unit': 'per month',
      'image_url':
          'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=900&q=80',
      'whatsapp_number': _supportPhone,
    },
  ],
  'reviews': [
    {
      'id': 'rev-anita',
      'author_name': 'Anita Sharma',
      'rating': 5,
      'comment': 'The nurse arrived within an hour and took excellent care of my father.',
    },
    {
      'id': 'rev-rakesh',
      'author_name': 'Rakesh Verma',
      'rating': 5,
      'comment': 'ICU setup at home was done in a day. The team was professional and calm.',
    },
    {
      'id': 'rev-meera',
      'author_name': 'Meera Iyer',
      'rating': 4,
      'comment': 'Physiotherapy sessions at home helped my mother walk again after surgery.',
    },
  ],
  'social_links': [
    {'id': 'sl-whatsapp', 'platform': 'whatsapp', 'url': 'https://wa.me/919999999999'},
    {'id': 'sl-facebook', 'platform': 'facebook', 'url': 'https://facebook.com/parihomehealthcare'},
    {
      'id': 'sl-instagram',
      'platform': 'instagram',
      'url': 'https://instagram.com/parihomehealthcare',
    },
    {'id': 'sl-youtube', 'platform': 'youtube', 'url': 'https://youtube.com/@parihomehealthcare'},
  ],
};

HomeContent demoHomeContent() => HomeContent.fromJson(demoHomeContentJson);
