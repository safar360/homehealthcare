import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import AttendancePanel from './AttendancePanel';
import MonthlyPanel from './MonthlyPanel';
import PatientsPanel from './PatientsPanel';
import {
  AVAILABILITY_STATUSES,
  humanise,
  slugify,
  splitList,
  type City,
  type DashboardSummary,
  type ManagerWithCount,
  type Staff,
  type StaffRoleRow,
} from './lib/types';

// Transfers are hidden for now. The transfer_staff RPCs and the audit table are
// still in the schema, so re-enabling is a UI change only. Until then an admin
// reassigns a staff member through Edit, which does NOT write an audit row.
type Tab = 'dashboard' | 'managers' | 'staff' | 'patients' | 'day' | 'month' | 'roles' | 'cities';

const TABS: Tab[] = [
  'dashboard',
  'managers',
  'staff',
  'patients',
  'day',
  'month',
  'roles',
  'cities',
];

/** Tab keys whose label is not just the humanised key. */
const TAB_LABELS: Partial<Record<Tab, string>> = {
  patients: 'Patients & rates',
  day: 'Day sheet',
  month: 'Monthly bills',
};

type ManagerForm = {
  full_name: string;
  email: string;
  phone_number: string;
  city_slug: string;
  managed_locations: string;
};

type StaffForm = {
  full_name: string;
  email: string;
  phone_number: string;
  city_slug: string;
  staff_role: string;
  assigned_manager_id: string;
  assigned_location: string;
  qualifications: string;
  experience_years: string;
  availability_status: string;
};

type RoleForm = { slug: string; label: string; description: string; sort_order: string };
type CityForm = {
  slug: string;
  name: string;
  support_phone: string;
  whatsapp_number: string;
  sort_order: string;
};

const emptyManagerForm: ManagerForm = {
  full_name: '', email: '', phone_number: '', city_slug: '', managed_locations: '',
};
const emptyStaffForm: StaffForm = {
  full_name: '', email: '', phone_number: '', city_slug: '', staff_role: '',
  assigned_manager_id: '', assigned_location: '', qualifications: '',
  experience_years: '0', availability_status: 'available',
};
const emptyRoleForm: RoleForm = { slug: '', label: '', description: '', sort_order: '10' };
const emptyCityForm: CityForm = {
  slug: '', name: '', support_phone: '', whatsapp_number: '', sort_order: '10',
};

export default function AdminPortal() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [managers, setManagers] = useState<ManagerWithCount[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [roles, setRoles] = useState<StaffRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterCity, setFilterCity] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const [managerForm, setManagerForm] = useState<ManagerForm | null>(null);
  const [managerEditId, setManagerEditId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm | null>(null);
  const [staffEditId, setStaffEditId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm | null>(null);
  const [roleEditSlug, setRoleEditSlug] = useState<string | null>(null);
  const [cityForm, setCityForm] = useState<CityForm | null>(null);
  const [cityEditSlug, setCityEditSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [citiesRes, rolesRes, dashRes, managersRes, staffRes] = await Promise.all([
      supabase.from('cities').select('*').order('sort_order'),
      supabase.from('staff_roles').select('*').order('sort_order'),
      supabase.rpc('get_admin_dashboard_summary'),
      supabase.rpc('get_managers_with_staff_count'),
      supabase.from('location_staff').select('*').eq('is_active', true).order('full_name'),
    ]);

    // supabase-js resolves with an { error } field rather than throwing.
    const failure = [citiesRes, rolesRes, dashRes, managersRes, staffRes].find((r) => r.error);
    if (failure?.error) setError(failure.error.message);

    setCities((citiesRes.data as City[]) ?? []);
    setRoles((rolesRes.data as StaffRoleRow[]) ?? []);
    setDashboard((dashRes.data as DashboardSummary) ?? null);
    setManagers((managersRes.data as ManagerWithCount[]) ?? []);
    setStaff((staffRes.data as Staff[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const managerNameById = useMemo(() => {
    const m = new Map<string, string>();
    managers.forEach((x) => m.set(x.id, x.full_name));
    return m;
  }, [managers]);

  const cityNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    cities.forEach((c) => m.set(c.slug, c.name));
    return m;
  }, [cities]);

  const roleLabelBySlug = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.slug, r.label));
    return m;
  }, [roles]);

  const activeRoles = useMemo(() => roles.filter((r) => r.is_active), [roles]);

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (filterCity && s.city_slug !== filterCity) return false;
      if (filterRole && s.staff_role !== filterRole) return false;
      if (filterStatus && s.availability_status !== filterStatus) return false;
      if (!term) return true;
      return (
        s.full_name.toLowerCase().includes(term) ||
        (s.email ?? '').toLowerCase().includes(term) ||
        (s.assigned_location ?? '').toLowerCase().includes(term)
      );
    });
  }, [staff, filterCity, filterRole, filterStatus, search]);

  const saveManager = async () => {
    if (!managerForm) return;
    if (!managerForm.full_name.trim() || !managerForm.city_slug) {
      setError('A manager needs at least a name and a city.');
      return;
    }
    const payload = {
      full_name: managerForm.full_name.trim(),
      email: managerForm.email.trim() || null,
      phone_number: managerForm.phone_number.trim() || null,
      city_slug: managerForm.city_slug,
      managed_locations: splitList(managerForm.managed_locations),
      updated_at: new Date().toISOString(),
    };
    const { error: e } = managerEditId
      ? await supabase.from('location_managers').update(payload).eq('id', managerEditId)
      : await supabase.from('location_managers').insert([payload]);
    if (e) { setError(e.message); return; }
    setManagerForm(null); setManagerEditId(null);
    setNotice(managerEditId ? 'Manager updated.' : 'Manager added.');
    await load();
  };

  const saveStaff = async () => {
    if (!staffForm) return;
    if (!staffForm.full_name.trim() || !staffForm.city_slug || !staffForm.staff_role) {
      setError('A staff member needs a name, a city and a role.');
      return;
    }
    const payload = {
      full_name: staffForm.full_name.trim(),
      email: staffForm.email.trim() || null,
      phone_number: staffForm.phone_number.trim() || null,
      city_slug: staffForm.city_slug,
      staff_role: staffForm.staff_role,
      assigned_manager_id: staffForm.assigned_manager_id || null,
      assigned_location: staffForm.assigned_location.trim() || null,
      qualifications: splitList(staffForm.qualifications),
      experience_years: Number(staffForm.experience_years) || 0,
      availability_status: staffForm.availability_status,
      updated_at: new Date().toISOString(),
    };
    const { error: e } = staffEditId
      ? await supabase.from('location_staff').update(payload).eq('id', staffEditId)
      : await supabase.from('location_staff').insert([payload]);
    if (e) { setError(e.message); return; }
    setStaffForm(null); setStaffEditId(null);
    setNotice(staffEditId ? 'Staff member updated.' : 'Staff member added.');
    await load();
  };

  const saveRole = async () => {
    if (!roleForm) return;
    const label = roleForm.label.trim();
    if (!label) { setError('A role needs a name.'); return; }
    const slug = roleEditSlug ?? (roleForm.slug.trim() || slugify(label));
    if (!slug) { setError('Could not derive an identifier from that name.'); return; }

    const payload = {
      slug,
      label,
      description: roleForm.description.trim() || null,
      sort_order: Number(roleForm.sort_order) || 0,
    };
    const { error: e } = roleEditSlug
      ? await supabase.from('staff_roles').update(payload).eq('slug', roleEditSlug)
      : await supabase.from('staff_roles').insert([payload]);
    if (e) { setError(e.message); return; }
    setRoleForm(null); setRoleEditSlug(null);
    setNotice(roleEditSlug ? 'Role updated.' : `Role "${label}" added.`);
    await load();
  };

  const saveCity = async () => {
    if (!cityForm) return;
    const name = cityForm.name.trim();
    if (!name) { setError('A city needs a name.'); return; }
    const slug = cityEditSlug ?? (cityForm.slug.trim() || slugify(name.split(',')[0]));
    if (!slug) { setError('Could not derive an identifier from that name.'); return; }

    const payload = {
      slug,
      name,
      support_phone: cityForm.support_phone.trim() || null,
      whatsapp_number: cityForm.whatsapp_number.trim() || null,
      sort_order: Number(cityForm.sort_order) || 0,
    };
    const { error: e } = cityEditSlug
      ? await supabase.from('cities').update(payload).eq('slug', cityEditSlug)
      : await supabase.from('cities').insert([payload]);
    if (e) { setError(e.message); return; }
    setCityForm(null); setCityEditSlug(null);
    setNotice(cityEditSlug ? 'City updated.' : `${name} added.`);
    await load();
  };

  const deactivate = async (
    table: 'location_managers' | 'location_staff',
    id: string,
    label: string
  ) => {
    if (!window.confirm(`Deactivate ${label}? The record is kept for the audit trail.`)) return;
    const { error: e } = await supabase
      .from(table)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (e) { setError(e.message); return; }
    setNotice(`${label} deactivated.`);
    await load();
  };

  const toggleActive = async (
    table: 'staff_roles' | 'cities',
    slug: string,
    next: boolean,
    label: string
  ) => {
    const { error: e } = await supabase.from(table).update({ is_active: next }).eq('slug', slug);
    if (e) { setError(e.message); return; }
    setNotice(`${label} ${next ? 'activated' : 'deactivated'}.`);
    await load();
  };

  return (
    <>
      <nav className="tabs">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key] ?? humanise(key)}
            {key === 'managers' && ` (${managers.length})`}
            {key === 'staff' && ` (${staff.length})`}
            {key === 'roles' && ` (${activeRoles.length})`}
            {key === 'cities' && ` (${cities.filter((c) => c.is_active !== false).length})`}
          </button>
        ))}
      </nav>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="banner banner-success">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}

      {/* Admin scope: every city's patients, days and money, not one team's. */}
      {tab === 'patients' && (
        <PatientsPanel scope={{ kind: 'admin' }} onError={setError} onNotice={setNotice} />
      )}
      {tab === 'day' && (
        <AttendancePanel scope={{ kind: 'admin' }} onError={setError} onNotice={setNotice} />
      )}
      {tab === 'month' && (
        <MonthlyPanel scope={{ kind: 'admin' }} onError={setError} onNotice={setNotice} />
      )}

      {/* ------------------------------------------------------- dashboard */}
      {!loading && tab === 'dashboard' && dashboard && (
        <>
          <div className="dashboard-grid">
            <StatCard label="Cities" value={dashboard.total_cities} />
            <StatCard label="Managers" value={dashboard.total_managers} />
            <StatCard label="Staff" value={dashboard.total_staff} />
            <StatCard label="Roles" value={dashboard.total_roles} />
            <StatCard label="Orders" value={dashboard.total_orders} />
            <StatCard
              label="Unassigned staff"
              value={dashboard.unassigned_staff}
              tone={dashboard.unassigned_staff > 0 ? 'warn' : undefined}
            />
          </div>

          {(dashboard.cities_without_manager?.length ?? 0) > 0 && (
            <div className="banner banner-warn">
              <span>
                No manager covering: <strong>{dashboard.cities_without_manager.join(', ')}</strong>
              </span>
            </div>
          )}

          <section className="content-section">
            <h2>Coverage by location</h2>
            <p className="muted">
              Every active city, the team covering it, and the areas staff are assigned to.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Managers</th>
                    <th>Staff</th>
                    <th>Available</th>
                    <th>Areas covered</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard.by_location ?? []).map((row) => (
                    <tr key={row.slug}>
                      <td><strong>{row.city}</strong></td>
                      <td className={row.managers === 0 ? 'cell-warn' : ''}>{row.managers}</td>
                      <td>{row.staff}</td>
                      <td>{row.available}</td>
                      <td>
                        <div className="qualifications">
                          {row.areas.map((a) => <span key={a} className="qual-tag">{a}</span>)}
                          {row.areas.length === 0 && <span className="muted">—</span>}
                        </div>
                      </td>
                      <td>{row.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(dashboard.by_location?.length ?? 0) === 0 && (
                <div className="no-data">No active cities yet.</div>
              )}
            </div>
          </section>

          <div className="dashboard-grid">
            <BreakdownCard title="Staff by role" data={dashboard.staff_by_role} />
            <BreakdownCard title="Staff by city" data={dashboard.staff_by_city} />
            <BreakdownCard title="Staff by availability" data={dashboard.staff_by_availability} />
            <BreakdownCard title="Managers by city" data={dashboard.managers_by_city} />
            <BreakdownCard title="Orders by status" data={dashboard.orders_by_status} />
          </div>
        </>
      )}

      {/* -------------------------------------------------------- managers */}
      {!loading && tab === 'managers' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Location managers</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => { setManagerEditId(null); setManagerForm({ ...emptyManagerForm }); }}
            >
              + Add manager
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Phone</th><th>City</th>
                  <th>Areas</th><th>Staff</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>{m.email ?? '—'}</td>
                    <td>{m.phone_number ?? '—'}</td>
                    <td>{cityNameBySlug.get(m.city_slug ?? '') ?? m.city_slug ?? '—'}</td>
                    <td>{m.managed_locations.join(', ') || '—'}</td>
                    <td>{m.staff_count}</td>
                    <td className="actions">
                      <button
                        className="btn-small"
                        type="button"
                        onClick={() => {
                          setManagerEditId(m.id);
                          setManagerForm({
                            full_name: m.full_name,
                            email: m.email ?? '',
                            phone_number: m.phone_number ?? '',
                            city_slug: m.city_slug ?? '',
                            managed_locations: m.managed_locations.join(', '),
                          });
                        }}
                      >Edit</button>
                      <button
                        className="btn-danger-small"
                        type="button"
                        onClick={() => deactivate('location_managers', m.id, m.full_name)}
                      >Deactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {managers.length === 0 && <div className="no-data">No managers yet.</div>}
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- staff */}
      {!loading && tab === 'staff' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Staff</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                setStaffEditId(null);
                setStaffForm({ ...emptyStaffForm, staff_role: activeRoles[0]?.slug ?? '' });
              }}
            >
              + Add staff
            </button>
          </div>

          <div className="filters">
            <input
              type="search" className="filter-input"
              placeholder="Search name, email or area…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <select className="filter-select" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <select className="filter-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
            </select>
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
            </select>
            <button
              className="btn-secondary" type="button"
              onClick={() => { setSearch(''); setFilterCity(''); setFilterRole(''); setFilterStatus(''); }}
            >Clear</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Contact</th><th>Role</th><th>City</th>
                  <th>Area</th><th>Manager</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>
                      {s.email ?? '—'}<br />
                      <span className="muted">{s.phone_number ?? ''}</span>
                    </td>
                    <td>
                      <span className="badge badge-role">
                        {roleLabelBySlug.get(s.staff_role) ?? humanise(s.staff_role)}
                      </span>
                    </td>
                    <td>{cityNameBySlug.get(s.city_slug ?? '') ?? s.city_slug ?? '—'}</td>
                    <td>{s.assigned_location ?? <span className="muted">—</span>}</td>
                    <td>
                      {s.assigned_manager_id
                        ? managerNameById.get(s.assigned_manager_id) ?? 'Unknown'
                        : <span className="cell-warn">Unassigned</span>}
                    </td>
                    <td>
                      <span className={`status ${s.availability_status === 'available' ? 'active' : 'inactive'}`}>
                        {humanise(s.availability_status)}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        className="btn-small" type="button"
                        onClick={() => {
                          setStaffEditId(s.id);
                          setStaffForm({
                            full_name: s.full_name,
                            email: s.email ?? '',
                            phone_number: s.phone_number ?? '',
                            city_slug: s.city_slug ?? '',
                            staff_role: s.staff_role,
                            assigned_manager_id: s.assigned_manager_id ?? '',
                            assigned_location: s.assigned_location ?? '',
                            qualifications: s.qualifications.join(', '),
                            experience_years: String(s.experience_years ?? 0),
                            availability_status: s.availability_status,
                          });
                        }}
                      >Edit</button>
                      <button
                        className="btn-danger-small" type="button"
                        onClick={() => deactivate('location_staff', s.id, s.full_name)}
                      >Deactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && (
              <div className="no-data">
                {staff.length === 0 ? 'No staff yet.' : 'No staff match these filters.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- roles */}
      {!loading && tab === 'roles' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Staff roles</h2>
            <button
              className="btn-primary" type="button"
              onClick={() => { setRoleEditSlug(null); setRoleForm({ ...emptyRoleForm }); }}
            >+ Add role</button>
          </div>
          <p className="muted">
            Roles available when adding a staff member. Deactivating one hides it from new
            entries; staff already holding it keep it.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Role</th><th>Identifier</th><th>Description</th><th>In use</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const inUse = staff.filter((s) => s.staff_role === r.slug).length;
                  return (
                    <tr key={r.slug}>
                      <td><strong>{r.label}</strong></td>
                      <td><code>{r.slug}</code></td>
                      <td>{r.description ?? <span className="muted">—</span>}</td>
                      <td>{inUse}</td>
                      <td>
                        <span className={`status ${r.is_active ? 'active' : 'inactive'}`}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions">
                        <button
                          className="btn-small" type="button"
                          onClick={() => {
                            setRoleEditSlug(r.slug);
                            setRoleForm({
                              slug: r.slug, label: r.label,
                              description: r.description ?? '',
                              sort_order: String(r.sort_order ?? 0),
                            });
                          }}
                        >Edit</button>
                        <button
                          className={r.is_active ? 'btn-danger-small' : 'btn-small'}
                          type="button"
                          onClick={() => toggleActive('staff_roles', r.slug, !r.is_active, r.label)}
                        >{r.is_active ? 'Deactivate' : 'Activate'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {roles.length === 0 && <div className="no-data">No roles yet.</div>}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- cities */}
      {!loading && tab === 'cities' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Cities</h2>
            <button
              className="btn-primary" type="button"
              onClick={() => { setCityEditSlug(null); setCityForm({ ...emptyCityForm }); }}
            >+ Add city</button>
          </div>
          <p className="muted">
            Cities the service operates in. These drive the patient app's city picker as well as
            manager and staff assignment.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>City</th><th>Identifier</th><th>Support phone</th><th>WhatsApp</th><th>Managers</th><th>Staff</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.slug}>
                    <td><strong>{c.name}</strong></td>
                    <td><code>{c.slug}</code></td>
                    <td>{c.support_phone ?? '—'}</td>
                    <td>{c.whatsapp_number ?? '—'}</td>
                    <td>{managers.filter((m) => m.city_slug === c.slug).length}</td>
                    <td>{staff.filter((s) => s.city_slug === c.slug).length}</td>
                    <td>
                      <span className={`status ${c.is_active !== false ? 'active' : 'inactive'}`}>
                        {c.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        className="btn-small" type="button"
                        onClick={() => {
                          setCityEditSlug(c.slug);
                          setCityForm({
                            slug: c.slug, name: c.name,
                            support_phone: c.support_phone ?? '',
                            whatsapp_number: c.whatsapp_number ?? '',
                            sort_order: String(c.sort_order ?? 0),
                          });
                        }}
                      >Edit</button>
                      <button
                        className={c.is_active !== false ? 'btn-danger-small' : 'btn-small'}
                        type="button"
                        onClick={() => toggleActive('cities', c.slug, c.is_active === false, c.name)}
                      >{c.is_active !== false ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cities.length === 0 && <div className="no-data">No cities yet.</div>}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- modals */}
      {managerForm && (
        <Modal
          title={managerEditId ? 'Edit manager' : 'Add manager'}
          onClose={() => setManagerForm(null)}
          onSave={saveManager}
        >
          <Field label="Full name" required>
            <input value={managerForm.full_name}
              onChange={(e) => setManagerForm({ ...managerForm, full_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" value={managerForm.email}
              onChange={(e) => setManagerForm({ ...managerForm, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={managerForm.phone_number}
              onChange={(e) => setManagerForm({ ...managerForm, phone_number: e.target.value })} />
          </Field>
          <Field label="City" required>
            <select value={managerForm.city_slug}
              onChange={(e) => setManagerForm({ ...managerForm, city_slug: e.target.value })}>
              <option value="">Select a city</option>
              {cities.filter((c) => c.is_active !== false)
                .map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Areas covered (comma-separated)">
            <input value={managerForm.managed_locations}
              placeholder="Arera Colony, MP Nagar"
              onChange={(e) => setManagerForm({ ...managerForm, managed_locations: e.target.value })} />
          </Field>
        </Modal>
      )}

      {staffForm && (
        <Modal
          title={staffEditId ? 'Edit staff member' : 'Add staff member'}
          onClose={() => setStaffForm(null)}
          onSave={saveStaff}
        >
          <Field label="Full name" required>
            <input value={staffForm.full_name}
              onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={staffForm.phone_number}
              onChange={(e) => setStaffForm({ ...staffForm, phone_number: e.target.value })} />
          </Field>
          <Field label="City" required>
            <select value={staffForm.city_slug}
              onChange={(e) => setStaffForm({ ...staffForm, city_slug: e.target.value })}>
              <option value="">Select a city</option>
              {cities.filter((c) => c.is_active !== false)
                .map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Role" required>
            <select value={staffForm.staff_role}
              onChange={(e) => setStaffForm({ ...staffForm, staff_role: e.target.value })}>
              <option value="">Select a role</option>
              {activeRoles.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Reporting manager">
            <select value={staffForm.assigned_manager_id}
              onChange={(e) => setStaffForm({ ...staffForm, assigned_manager_id: e.target.value })}>
              <option value="">Unassigned</option>
              {managers
                .filter((m) => !staffForm.city_slug || m.city_slug === staffForm.city_slug)
                .map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
          <Field label="Area within the city">
            <input value={staffForm.assigned_location} placeholder="Arera Colony"
              onChange={(e) => setStaffForm({ ...staffForm, assigned_location: e.target.value })} />
          </Field>
          <Field label="Qualifications (comma-separated)">
            <input value={staffForm.qualifications} placeholder="BSc Nursing, RN License"
              onChange={(e) => setStaffForm({ ...staffForm, qualifications: e.target.value })} />
          </Field>
          <Field label="Years of experience">
            <input type="number" min="0" value={staffForm.experience_years}
              onChange={(e) => setStaffForm({ ...staffForm, experience_years: e.target.value })} />
          </Field>
          <Field label="Availability">
            <select value={staffForm.availability_status}
              onChange={(e) => setStaffForm({ ...staffForm, availability_status: e.target.value })}>
              {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
            </select>
          </Field>
        </Modal>
      )}

      {roleForm && (
        <Modal
          title={roleEditSlug ? 'Edit role' : 'Add role'}
          onClose={() => setRoleForm(null)}
          onSave={saveRole}
        >
          <Field label="Role name" required>
            <input value={roleForm.label} placeholder="Physiotherapist"
              onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })} />
          </Field>
          <Field label="Identifier">
            <input
              value={roleEditSlug ?? (roleForm.slug || slugify(roleForm.label))}
              disabled={!!roleEditSlug}
              onChange={(e) => setRoleForm({ ...roleForm, slug: e.target.value })}
            />
          </Field>
          {!roleEditSlug && (
            <p className="muted">
              Derived from the name and fixed once saved, because staff records reference it.
            </p>
          )}
          <Field label="Description">
            <input value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
          </Field>
          <Field label="Sort order">
            <input type="number" value={roleForm.sort_order}
              onChange={(e) => setRoleForm({ ...roleForm, sort_order: e.target.value })} />
          </Field>
        </Modal>
      )}

      {cityForm && (
        <Modal
          title={cityEditSlug ? 'Edit city' : 'Add city'}
          onClose={() => setCityForm(null)}
          onSave={saveCity}
        >
          <Field label="City name" required>
            <input value={cityForm.name} placeholder="Ujjain, Madhya Pradesh"
              onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })} />
          </Field>
          <Field label="Identifier">
            <input
              value={cityEditSlug ?? (cityForm.slug || slugify(cityForm.name.split(',')[0]))}
              disabled={!!cityEditSlug}
              onChange={(e) => setCityForm({ ...cityForm, slug: e.target.value })}
            />
          </Field>
          {!cityEditSlug && (
            <p className="muted">
              Taken from the part before the comma and fixed once saved, because managers, staff
              and orders reference it.
            </p>
          )}
          <Field label="Support phone">
            <input type="tel" value={cityForm.support_phone} placeholder="+919999999999"
              onChange={(e) => setCityForm({ ...cityForm, support_phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp number">
            <input type="tel" value={cityForm.whatsapp_number} placeholder="+919999999999"
              onChange={(e) => setCityForm({ ...cityForm, whatsapp_number: e.target.value })} />
          </Field>
          <Field label="Sort order">
            <input type="number" value={cityForm.sort_order}
              onChange={(e) => setCityForm({ ...cityForm, sort_order: e.target.value })} />
          </Field>
        </Modal>
      )}
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="stat-card">
      <h3>{label}</h3>
      <p className={`stat-number ${tone === 'warn' ? 'stat-warn' : ''}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      <div className="role-breakdown">
        {entries.map(([k, v]) => (
          <div key={k} className="role-item">
            <span>{humanise(k)}</span>
            <strong>{v}</strong>
          </div>
        ))}
        {entries.length === 0 && <span className="muted">No data</span>}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="form-group">
      <label>{label} {required && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}

function Modal({
  title, children, onClose, onSave, saveLabel = 'Save',
}: {
  title: string; children: ReactNode; onClose: () => void; onSave: () => void; saveLabel?: string;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={onSave}>{saveLabel}</button>
          <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
