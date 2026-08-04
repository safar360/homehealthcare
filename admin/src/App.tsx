import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Order = {
  id: string;
  item_name: string;
  patient_name: string;
  phone_number: string;
  city_slug: string | null;
  address: string;
  note: string | null;
  status: string;
  assigned_manager_name: string | null;
  assigned_manager_phone: string | null;
  assigned_manager_email: string | null;
  assigned_at: string | null;
  created_at: string;
};

type Manager = {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  city_slug: string | null;
  is_active: boolean;
};

type Staff = {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  city_slug: string | null;
  role: string;
  is_active: boolean;
};

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const statusOptions = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ managerId: '', staffId: '', status: 'assigned' });

  const loadData = async () => {
    setLoading(true);
    const [{ data: ordersData }, { data: managersData }, { data: staffData }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('location_managers').select('*').eq('is_active', true).order('full_name'),
      supabase.from('location_staff').select('*').eq('is_active', true).order('full_name'),
    ]);

    setOrders((ordersData as Order[]) || []);
    setManagers((managersData as Manager[]) || []);
    setStaff((staffData as Staff[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const assignOrder = async (orderId: string) => {
    const selectedManager = managers.find((m) => m.id === form.managerId);
    const selectedStaff = staff.find((s) => s.id === form.staffId);
    if (!selectedManager) return;

    await supabase.from('orders').update({
      status: form.status,
      assigned_manager_name: selectedManager.full_name,
      assigned_manager_phone: selectedManager.phone_number,
      assigned_manager_email: selectedManager.email,
      assigned_staff_member: selectedStaff?.id ?? null,
      assigned_at: new Date().toISOString(),
    }).eq('id', orderId);

    await loadData();
  };

  const citySummary = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((order) => {
      const key = order.city_slug || 'unassigned';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([city, count]) => `${city}: ${count}`).join(' • ');
  }, [orders]);

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Operations portal</p>
          <h1>Pari Home Healthcare</h1>
          <p className="subtle">Route orders, manage city managers and monitor active staff in one place.</p>
        </div>
        <div className="summary-pill">{citySummary || 'No orders yet'}</div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Orders queue</h2>
          {loading ? <p>Loading...</p> : orders.length === 0 ? <p>No orders yet.</p> : (
            <div className="stack">
              {orders.map((order) => (
                <article key={order.id} className="order-card">
                  <div className="order-topline">
                    <strong>{order.item_name}</strong>
                    <span className="badge">{order.status}</span>
                  </div>
                  <p>{order.patient_name} • {order.phone_number}</p>
                  <p>{order.address}</p>
                  {order.note ? <p className="muted">{order.note}</p> : null}
                  <p className="muted">City: {order.city_slug || 'unassigned'}</p>
                  <div className="assign-row">
                    <select value={form.managerId} onChange={(e) => setForm((prev) => ({ ...prev, managerId: e.target.value }))}>
                      <option value="">Select manager</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>{manager.full_name}</option>
                      ))}
                    </select>
                    <select value={form.staffId} onChange={(e) => setForm((prev) => ({ ...prev, staffId: e.target.value }))}>
                      <option value="">Select staff</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>{member.full_name}</option>
                      ))}
                    </select>
                    <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <button onClick={() => assignOrder(order.id)}>Assign</button>
                  </div>
                  {order.assigned_manager_name ? (
                    <p className="muted">Assigned to {order.assigned_manager_name}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Managers and staff</h2>
          <h3>Managers</h3>
          <ul>
            {managers.map((manager) => (
              <li key={manager.id}>{manager.full_name} • {manager.city_slug || 'all cities'}</li>
            ))}
          </ul>
          <h3>Staff</h3>
          <ul>
            {staff.map((member) => (
              <li key={member.id}>{member.full_name} • {member.role}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
