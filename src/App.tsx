import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

type City = {
  slug: string;
  name: string;
  support_phone: string;
  whatsapp_number: string;
};

type HomeSection = {
  key: string;
  title: string;
  subtitle?: string;
};

type HeroBanner = {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  cta_label?: string;
  cta_url?: string;
};

type QuickAction = {
  id: string;
  label: string;
  icon: string;
  action_type: 'call' | 'whatsapp' | 'url' | 'section';
  action_value: string;
};

type Service = {
  id: string;
  name: string;
  category: string;
  short_description?: string;
  duration?: string;
  price: number;
  image_url?: string;
  phone_number?: string;
  whatsapp_number?: string;
};

type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit?: string;
  image_url?: string;
  whatsapp_number?: string;
};

type Review = {
  id: string;
  author_name: string;
  rating: number;
  comment: string;
  avatar_url?: string;
};

type SocialLink = {
  id: string;
  platform: string;
  url: string;
};

type TeamMember = {
  id: string;
  full_name: string;
  email?: string;
  phone_number?: string;
  role: 'manager' | 'staff';
  city_slug?: string;
  is_active: boolean;
  created_at: string;
};

type Order = {
  id: string;
  item_name: string;
  patient_name: string;
  phone_number: string;
  city_slug?: string;
  status: string;
  assigned_manager?: string | null;
  assigned_staff_member?: string | null;
};

type HomeContent = {
  cities: City[];
  sections: HomeSection[];
  banners: HeroBanner[];
  quick_actions: QuickAction[];
  services: Service[];
  reviews: Review[];
  products: Product[];
  social_links: SocialLink[];
};

const demoContent: HomeContent = {
  cities: [
    {
      slug: 'cairo',
      name: 'New Cairo',
      support_phone: '+201200000000',
      whatsapp_number: '201000000000',
    },
  ],
  sections: [
    { key: 'hero', title: 'Trusted home care at your doorstep', subtitle: 'A modern patient portal for daily care, appointments, and support.' },
    { key: 'quick_actions', title: 'Quick help', subtitle: 'Reach your care team with one tap.' },
    { key: 'services', title: 'Care services', subtitle: 'Browse the most common home care services.' },
    { key: 'reviews', title: 'What families say', subtitle: 'Patient feedback from the home care community.' },
    { key: 'products', title: 'Care essentials', subtitle: 'Home care supplies available for order.' },
    { key: 'social', title: 'Follow us', subtitle: 'Stay connected with support channels and updates.' },
  ],
  banners: [
    {
      id: 'hero-1',
      title: 'At-home care when you need it most',
      subtitle: 'Track your daily care plan, schedule visits, and get support from your trusted team.',
      image_url: 'https://images.unsplash.com/photo-1580281657521-6ead7f67f3a5?auto=format&fit=crop&w=1200&q=80',
      cta_label: 'See care plan',
      cta_url: '#services',
    },
    {
      id: 'hero-2',
      title: 'Comfort, support, and faster communication',
      subtitle: 'Every patient can view updated visits, request help, and stay informed from home.',
      image_url: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1200&q=80',
      cta_label: 'Contact care team',
      cta_url: 'tel:+201200000000',
    },
  ],
  quick_actions: [
    { id: 'qa-1', label: 'Call support', icon: '📞', action_type: 'call', action_value: '+201200000000' },
    { id: 'qa-2', label: 'WhatsApp team', icon: '💬', action_type: 'whatsapp', action_value: '201000000000' },
    { id: 'qa-3', label: 'View services', icon: '🩺', action_type: 'section', action_value: 'services' },
  ],
  services: [
    { id: 'svc-1', name: 'Medication reminders', category: 'Care plan', short_description: 'Personalized prompts and follow-up from your nurse.', duration: 'Daily', price: 0, image_url: 'https://images.unsplash.com/photo-1580281657521-6ead7f67f3a5?auto=format&fit=crop&w=800&q=80' },
    { id: 'svc-2', name: 'Vital signs monitoring', category: 'Health check', short_description: 'Remote tracking of blood pressure and temperature.', duration: 'As scheduled', price: 0, image_url: 'https://images.unsplash.com/photo-1580281657521-6ead7f67f3a5?auto=format&fit=crop&w=800&q=80' },
  ],
  reviews: [
    { id: 'rev-1', author_name: 'Amina', rating: 5, comment: 'The care team is responsive and always on time.', avatar_url: '' },
    { id: 'rev-2', author_name: 'Karim', rating: 5, comment: 'I can see my visit schedule clearly and request support easily.', avatar_url: '' },
  ],
  products: [
    { id: 'prod-1', name: 'Home oxygen kit', description: 'Portable oxygen delivery for at-home recovery.', price: 125.0, unit: 'each', image_url: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=800&q=80' },
    { id: 'prod-2', name: 'Care essentials box', description: 'A complete set of daily care supplies delivered to your door.', price: 49.99, unit: 'kit', image_url: 'https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?auto=format&fit=crop&w=800&q=80' },
  ],
  social_links: [
    { id: 'social-1', platform: 'Facebook', url: 'https://facebook.com' },
    { id: 'social-2', platform: 'Instagram', url: 'https://instagram.com' },
    { id: 'social-3', platform: 'WhatsApp', url: 'https://wa.me/201000000000' },
  ],
};

function App() {
  const [content, setContent] = useState<HomeContent>(demoContent);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('Loading patient home content...');
  const [activeSlide, setActiveSlide] = useState(0);
  const [currentPage, setCurrentPage] = useState<'patient' | 'admin'>('patient');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newMember, setNewMember] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    role: 'staff' as 'staff' | 'manager',
    city_slug: '',
  });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');

  useEffect(() => {
    const loadContent = async () => {
      try {
        const { data, error } = await supabase.rpc('get_home_content', { p_city_slug: null }).single();
        if (error || !data) {
          setMessage('Using demo content until Supabase content is configured.');
        } else {
          setConnected(true);
          setMessage('Live patient content loaded.');
          setContent(data as HomeContent);
        }
      } catch (err) {
        setMessage('Unable to load backend content. Showing demo page structure.');
      }
    };

    void loadContent();
  }, []);

  useEffect(() => {
    if (!content.banners.length) return;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (content.banners.length ? (current + 1) % content.banners.length : 0));
    }, 6000);
    return () => window.clearInterval(timer);
  }, [content.banners.length]);

  const selectedCity = useMemo(() => content.cities[0], [content.cities]);

  const fetchAdminData = async () => {
    setAdminLoading(true);
    setAdminMessage('Loading admin roster...');

    const [teamResponse, orderResponse] = await Promise.all([
      supabase.from('team_members').select('*').order('sort_order', { ascending: true }),
      supabase.from('orders').select('id,item_name,patient_name,phone_number,city_slug,status,assigned_manager,assigned_staff_member').order('created_at', { ascending: false }),
    ]);

    if (teamResponse.error) {
      setAdminMessage('Unable to load team members; check Supabase auth/policies.');
      setTeamMembers([]);
    } else {
      setTeamMembers(teamResponse.data ?? []);
    }

    if (orderResponse.error) {
      setAdminMessage((prev) => prev + ' Orders may not be visible until authenticated as staff/admin.');
      setOrders([]);
    } else {
      setOrders(orderResponse.data ?? []);
    }

    setAdminLoading(false);
  };

  useEffect(() => {
    if (currentPage === 'admin') {
      void fetchAdminData();
    }
  }, [currentPage]);

  const sectionOrder = content.sections.length
    ? content.sections
    : demoContent.sections;

  const actionHandler = (action: QuickAction) => {
    if (action.action_type === 'call') {
      window.open(`tel:${action.action_value}`, '_self');
    } else if (action.action_type === 'whatsapp') {
      window.open(`https://wa.me/${action.action_value}`, '_blank');
    } else if (action.action_type === 'url') {
      window.open(action.action_value, '_blank');
    } else if (action.action_type === 'section') {
      const target = document.getElementById(action.action_value);
      target?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const createTeamMember = async () => {
    if (!newMember.full_name || !newMember.city_slug) {
      setAdminMessage('Please enter a name and select a city.');
      return;
    }

    setAdminLoading(true);
    const { error } = await supabase.from('team_members').insert([newMember]);
    if (error) {
      setAdminMessage('Unable to save the team member. Check Supabase policies.');
    } else {
      setAdminMessage('Team member saved successfully. Refreshing roster.');
      setNewMember({ full_name: '', email: '', phone_number: '', role: 'staff', city_slug: content.cities?.[0]?.slug ?? '' });
      await fetchAdminData();
    }
    setAdminLoading(false);
  };

  const assignManager = async (orderId: string, managerId: string) => {
    setAdminLoading(true);
    const { error } = await supabase.from('orders').update({ assigned_manager: managerId, status: 'assigned' }).eq('id', orderId);
    if (error) {
      setAdminMessage('Unable to assign the manager. Confirm authenticated access and table policies.');
    } else {
      setAdminMessage('Manager assigned successfully.');
      await fetchAdminData();
    }
    setAdminLoading(false);
  };

  const renderSection = (section: HomeSection) => {
    switch (section.key) {
      case 'hero':
        return (
          <section className="hero-section" id="hero" key={section.key}>
            <div className="hero-meta">
              <p className="eyebrow">{section.title}</p>
              <h1>{section.subtitle ?? 'Real-time patient care, simplified for home.'}</h1>
              <p className="hero-copy">
                {selectedCity ? `Support is available in ${selectedCity.name}. Call ${selectedCity.support_phone} or WhatsApp ${selectedCity.whatsapp_number}.` : 'View your care plan, visit schedule, and support tools here.'}
              </p>
              <div className="hero-pill">{connected ? 'Live' : 'Demo'} • {message}</div>
            </div>

            <div className="hero-carousel">
              {content.banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className={`banner-card ${index === activeSlide ? 'active' : ''}`}
                  style={{ backgroundImage: `url(${banner.image_url})` }}
                >
                  <div className="banner-overlay" />
                  <div className="banner-copy">
                    <span className="banner-subtitle">{banner.subtitle}</span>
                    <h2>{banner.title}</h2>
                    {banner.cta_label && banner.cta_url && (
                      <a href={banner.cta_url} className="banner-cta">
                        {banner.cta_label}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="carousel-controls">
              <button type="button" onClick={() => setActiveSlide((current) => Math.max(current - 1, 0))}>
                ◀
              </button>
              <div className="carousel-dots">
                {content.banners.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveSlide(index)}
                    className={index === activeSlide ? 'active' : ''}
                  />
                ))}
              </div>
              <button type="button" onClick={() => setActiveSlide((current) => (current + 1) % content.banners.length)}>
                ▶
              </button>
            </div>
          </section>
        );

      case 'quick_actions':
        return (
          <section className="card section-card" id="quick_actions" key={section.key}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{section.title}</p>
                {section.subtitle && <p className="section-subtitle">{section.subtitle}</p>}
              </div>
            </div>
            <div className="action-grid">
              {content.quick_actions.map((action) => (
                <button key={action.id} type="button" className="action-pill" onClick={() => actionHandler(action)}>
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </section>
        );

      case 'services':
        return (
          <section className="card section-card" id="services" key={section.key}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{section.title}</p>
                {section.subtitle && <p className="section-subtitle">{section.subtitle}</p>}
              </div>
            </div>
            <div className="service-grid">
              {content.services.map((service) => (
                <article key={service.id} className="service-card">
                  {service.image_url && <img src={service.image_url} alt={service.name} />}
                  <div className="service-copy">
                    <h3>{service.name}</h3>
                    <p>{service.short_description ?? service.category}</p>
                    <div className="service-meta">
                      <span>{service.duration ?? 'Flexible'}</span>
                      <strong>{service.price === 0 ? 'Included' : `EGP ${service.price}`}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );

      case 'reviews':
        return (
          <section className="card section-card" id="reviews" key={section.key}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{section.title}</p>
                {section.subtitle && <p className="section-subtitle">{section.subtitle}</p>}
              </div>
            </div>
            <div className="review-grid">
              {content.reviews.map((review) => (
                <article key={review.id} className="review-card">
                  <p className="review-rating">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                  <p>{review.comment}</p>
                  <strong>{review.author_name}</strong>
                </article>
              ))}
            </div>
          </section>
        );

      case 'products':
        return (
          <section className="card section-card" id="products" key={section.key}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{section.title}</p>
                {section.subtitle && <p className="section-subtitle">{section.subtitle}</p>}
              </div>
            </div>
            <div className="product-grid">
              {content.products.map((product) => (
                <article key={product.id} className="product-card">
                  {product.image_url && <img src={product.image_url} alt={product.name} />}
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div className="product-meta">
                      <strong>EGP {product.price.toFixed(2)}</strong>
                      <span>{product.unit ?? 'item'}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );

      case 'social':
        return (
          <section className="card section-card" id="social" key={section.key}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{section.title}</p>
                {section.subtitle && <p className="section-subtitle">{section.subtitle}</p>}
              </div>
            </div>
            <div className="social-grid">
              {content.social_links.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="social-pill">
                  {link.platform}
                </a>
              ))}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  const renderAdminPortal = () => {
    const managersByCity = content.cities.map((city) => ({
      city,
      managers: teamMembers.filter((member) => member.role === 'manager' && member.city_slug === city.slug),
      staff: teamMembers.filter((member) => member.role === 'staff' && member.city_slug === city.slug),
    }));

    return (
      <div className="admin-shell">
        <section className="card admin-hero">
          <div className="admin-hero-copy">
            <p className="eyebrow">Admin portal</p>
            <h1>Manage city teams, managers, and order assignment</h1>
            <p className="hero-copy">
              Add managers and staff per location, then assign new orders to the right team.
            </p>
            <div className="hero-pill">{adminLoading ? 'Loading admin data...' : 'Admin roster loaded'}</div>
            {adminMessage && <div className="status-pill">{adminMessage}</div>}
          </div>
        </section>

        <section className="card admin-grid">
          <div className="admin-column">
            <h2>Add manager or staff</h2>
            <div className="form-grid">
              <label>
                Name
                <input
                  type="text"
                  value={newMember.full_name}
                  onChange={(event) => setNewMember((prev) => ({ ...prev, full_name: event.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={newMember.email}
                  onChange={(event) => setNewMember((prev) => ({ ...prev, email: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={newMember.phone_number}
                  onChange={(event) => setNewMember((prev) => ({ ...prev, phone_number: event.target.value }))}
                />
              </label>
              <label>
                Role
                <select
                  value={newMember.role}
                  onChange={(event) => setNewMember((prev) => ({ ...prev, role: event.target.value as 'staff' | 'manager' }))}
                >
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <label>
                Location
                <select
                  value={newMember.city_slug}
                  onChange={(event) => setNewMember((prev) => ({ ...prev, city_slug: event.target.value }))}
                >
                  <option value="">Choose a city</option>
                  {content.cities.map((city) => (
                    <option key={city.slug} value={city.slug}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn btn-primary" type="button" onClick={createTeamMember} disabled={adminLoading}>
              Save team member
            </button>
          </div>

          <div className="admin-column">
            <h2>Team roster by location</h2>
            {managersByCity.map(({ city, managers, staff }) => (
              <div key={city.slug} className="city-roster">
                <h3>{city.name}</h3>
                <p className="muted">Managers: {managers.length} • Staff: {staff.length}</p>
                <div className="staff-list">
                  {[...managers, ...staff].map((member) => (
                    <div key={member.id} className="staff-card">
                      <strong>{member.full_name}</strong>
                      <span>{member.role}</span>
                      <small>{member.email ?? member.phone_number ?? 'No contact'}</small>
                    </div>
                  ))}
                  {!managers.length && !staff.length && <p className="muted">No team members added yet for this city.</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Order assignment</h2>
          <p className="muted">
            Assign orders to a manager. This section works when a signed-in staff/admin session is available.
          </p>
          <div className="orders-list">
            {orders.length === 0 ? (
              <p className="muted">No orders available or permission denied. Sign in as staff/admin to load orders.</p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="order-card">
                  <div className="order-meta">
                    <strong>{order.item_name}</strong>
                    <span>{order.city_slug ?? 'Unknown location'}</span>
                  </div>
                  <div className="order-copy">
                    <p>{order.patient_name} · {order.phone_number}</p>
                    <p className="muted">Status: {order.status}</p>
                  </div>
                  <div className="order-actions">
                    <select
                      value={order.assigned_manager ?? ''}
                      onChange={(event) => assignManager(order.id, event.target.value)}
                    >
                      <option value="">Assign manager</option>
                      {teamMembers.filter((member) => member.role === 'manager').map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.full_name} ({manager.city_slug})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="page-tabs">
        <button className={currentPage === 'patient' ? 'tab active' : 'tab'} type="button" onClick={() => setCurrentPage('patient')}>
          Patient app
        </button>
        <button className={currentPage === 'admin' ? 'tab active' : 'tab'} type="button" onClick={() => setCurrentPage('admin')}>
          Admin portal
        </button>
      </div>
      {currentPage === 'patient' ? (
        <>
          {renderSection({ key: 'hero', title: 'Hero', subtitle: content.sections.find((section) => section.key === 'hero')?.subtitle })}
          <main className="page-grid">
            {sectionOrder.map((section) => section.key !== 'hero' && renderSection(section))}
          </main>
        </>
      ) : (
        renderAdminPortal()
      )}
    </div>
  );
}

export default App;
