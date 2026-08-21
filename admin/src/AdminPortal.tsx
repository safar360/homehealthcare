import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import AttendancePanel from './AttendancePanel';
import MonthlyPanel from './MonthlyPanel';
import PatientsPanel from './PatientsPanel';
import PersonCard from './PersonCard';
import PhoneField from './PhoneField';
import PhotoPicker from './PhotoPicker';
import DocumentsModal from './DocumentsModal';
import { signAvatars } from './lib/photo';
import { isEnabled } from './lib/features';
import { provisionLogin, type ProvisionResult } from './lib/auth';
import {
  AVAILABILITY_STATUSES,
  checkIndianMobile,
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

// The Phase 2 screens roll out one at a time. A hidden tab is hidden, not
// forbidden — RLS is what actually protects the data.
const TABS: Tab[] = [
  'dashboard',
  'managers',
  'staff',
  ...(isEnabled('patients') ? (['patients'] as Tab[]) : []),
  ...(isEnabled('daySheet') ? (['day'] as Tab[]) : []),
  ...(isEnabled('monthlyBills') ? (['month'] as Tab[]) : []),
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
  const [hasLogin, setHasLogin] = useState<Set<string>>(new Set());
  const [credential, setCredential] = useState<ProvisionResult | null>(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [docCounts, setDocCounts] = useState<Map<string, { total: number; verified: number }>>(new Map());
  const [docsFor, setDocsFor] = useState<{ id: string; name: string } | null>(null);
  const [managerPhoto, setManagerPhoto] = useState<Map<string, string | null>>(new Map());
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

    const [citiesRes, rolesRes, dashRes, managersRes, staffRes, linkedRes] = await Promise.all([
      supabase.from('cities').select('*').order('sort_order'),
      supabase.from('staff_roles').select('*').order('sort_order'),
      supabase.rpc('get_admin_dashboard_summary'),
      supabase.rpc('get_managers_with_staff_count'),
      supabase.from('location_staff').select('*').eq('is_active', true).order('full_name'),
      // The staff-count RPC does not return user_id or photo_path, and this
      // screen needs both before it can offer a login or show a face.
      supabase.from('location_managers').select('id, user_id, photo_path').eq('is_active', true),
    ]);

    // supabase-js resolves with an { error } field rather than throwing.
    const failure = [citiesRes, rolesRes, dashRes, managersRes, staffRes, linkedRes].find(
      (r) => r.error
    );
    if (failure?.error) setError(failure.error.message);

    setCities((citiesRes.data as City[]) ?? []);
    setRoles((rolesRes.data as StaffRoleRow[]) ?? []);
    setDashboard((dashRes.data as DashboardSummary) ?? null);
    setManagers((managersRes.data as ManagerWithCount[]) ?? []);
    setStaff((staffRes.data as Staff[]) ?? []);
    setHasLogin(
      new Set(
        ((linkedRes.data as { id: string; user_id: string | null }[]) ?? [])
          .filter((r) => r.user_id)
          .map((r) => r.id)
      )
    );
    // Photographs live in a private bucket, so every visible one is signed in a
    // single request rather than one round trip per card.
    const managerRows =
      (linkedRes.data as { id: string; user_id: string | null; photo_path: string | null }[]) ?? [];
    const staffRows = (staffRes.data as Staff[]) ?? [];
    setAvatars(
      await signAvatars([
        ...managerRows.map((m) => m.photo_path),
        ...staffRows.map((s) => s.photo_path),
      ])
    );
    setManagerPhoto(new Map(managerRows.map((m) => [m.id, m.photo_path])));

    // Documents are optional: a project without the patch simply shows none.
    const { data: docRows } = await supabase
      .from('staff_documents')
      .select('staff_id, is_verified');
    const counts = new Map<string, { total: number; verified: number }>();
    for (const d of (docRows as { staff_id: string; is_verified: boolean }[]) ?? []) {
      const c = counts.get(d.staff_id) ?? { total: 0, verified: 0 };
      c.total += 1;
      if (d.is_verified) c.verified += 1;
      counts.set(d.staff_id, c);
    }
    setDocCounts(counts);

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Create, reset or revoke a portal login. The password comes back once, from
   * the server, and is never stored anywhere the admin can look it up again —
   * so it is shown in a dialog they have to dismiss deliberately.
   */
  const manageLogin = async (
    action: 'create' | 'reset' | 'revoke',
    kind: 'manager' | 'staff',
    recordId: string,
    fullName: string
  ) => {
    if (action === 'revoke') {
      const ok = window.confirm(
        `Revoke ${fullName}'s login?\n\nThey will not be able to sign in. Their name stays on every record they have already touched.`
      );
      if (!ok) return;
    }
    if (action === 'reset') {
      const ok = window.confirm(
        `Reset ${fullName}'s password?\n\nTheir current password stops working immediately and you will need to read them the new one.`
      );
      if (!ok) return;
    }

    setProvisioning(recordId);
    setError(null);
    const { data, error: failed } = await provisionLogin({ action, kind, recordId });
    setProvisioning(null);

    if (failed) {
      setError(failed);
      return;
    }
    if (data?.password) {
      setCredential(data);
    } else {
      setNotice(`${fullName}'s login has been revoked.`);
    }
    await load();
  };

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
    const managerPhone = checkIndianMobile(managerForm.phone_number);
    if (!managerPhone.ok) {
      setError(`Mobile number: ${managerPhone.reason}`);
      return;
    }
    const payload = {
      full_name: managerForm.full_name.trim(),
      email: managerForm.email.trim() || null,
      phone_number: managerPhone.e164,
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
    const staffPhone = checkIndianMobile(staffForm.phone_number);
    if (!staffPhone.ok) {
      setError(`Mobile number: ${staffPhone.reason}`);
      return;
    }
    const payload = {
      full_name: staffForm.full_name.trim(),
      email: staffForm.email.trim() || null,
      phone_number: staffPhone.e164,
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

    const support = checkIndianMobile(cityForm.support_phone);
    if (!support.ok) { setError(`Support phone: ${support.reason}`); return; }
    const whatsapp = checkIndianMobile(cityForm.whatsapp_number);
    if (!whatsapp.ok) { setError(`WhatsApp number: ${whatsapp.reason}`); return; }

    const payload = {
      slug,
      name,
      support_phone: support.e164,
      whatsapp_number: whatsapp.e164,
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
      {tab === 'patients' && isEnabled('patients') && (
        <PatientsPanel scope={{ kind: 'admin' }} onError={setError} onNotice={setNotice} />
      )}
      {tab === 'day' && isEnabled('daySheet') && (
        <AttendancePanel scope={{ kind: 'admin' }} onError={setError} onNotice={setNotice} />
      )}
      {tab === 'month' && isEnabled('monthlyBills') && (
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
              note={
                dashboard.unassigned_staff > 0
                  ? 'Nobody manages them — assign a manager'
                  : 'Everyone has a manager'
              }
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
          <div className="person-grid">
            {managers.map((m) => (
              <PersonCard
                key={m.id}
                name={m.full_name}
                photoUrl={avatars.get(managerPhoto.get(m.id) ?? '') ?? null}
                badge={
                  <span className="badge">
                    {cityNameBySlug.get(m.city_slug ?? '') ?? m.city_slug ?? 'No city'}
                  </span>
                }
                meta={m.managed_locations.join(', ') || 'All areas'}
                phone={m.phone_number}
                email={m.email}
                status={
                  hasLogin.has(m.id)
                    ? { label: 'Can sign in', ok: true }
                    : { label: 'No login', ok: false }
                }
                facts={[
                  { label: 'Staff', value: m.staff_count },
                  {
                    label: 'Portal access',
                    value: hasLogin.has(m.id) ? 'Active' : 'Not issued',
                  },
                ]}
                actions={
                  <>
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
                      {hasLogin.has(m.id) ? (
                        <>
                          <button
                            className="btn-small"
                            type="button"
                            disabled={provisioning === m.id}
                            onClick={() => manageLogin('reset', 'manager', m.id, m.full_name)}
                          >{provisioning === m.id ? '…' : 'Reset password'}</button>
                          <button
                            className="btn-danger-small"
                            type="button"
                            disabled={provisioning === m.id}
                            onClick={() => manageLogin('revoke', 'manager', m.id, m.full_name)}
                          >Revoke login</button>
                        </>
                      ) : (
                        <button
                          className="btn-small"
                          type="button"
                          disabled={provisioning === m.id}
                          title={
                            m.phone_number
                              ? 'Create a portal login for this manager'
                              : 'Add their mobile number first — it is what they sign in with'
                          }
                          onClick={() => manageLogin('create', 'manager', m.id, m.full_name)}
                        >{provisioning === m.id ? 'Creating…' : 'Create login'}</button>
                      )}
                    <button
                      className="btn-danger-small"
                      type="button"
                      onClick={() => deactivate('location_managers', m.id, m.full_name)}
                    >Deactivate</button>
                  </>
                }
              />
            ))}
          </div>
          {managers.length === 0 && <div className="no-data">No managers yet.</div>}
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

          <div className="person-grid">
            {filteredStaff.map((s) => (
              <PersonCard
                key={s.id}
                name={s.full_name}
                photoUrl={avatars.get(s.photo_path ?? '') ?? null}
                badge={
                  <span className="badge badge-role">
                    {roleLabelBySlug.get(s.staff_role) ?? humanise(s.staff_role)}
                  </span>
                }
                meta={
                  <>
                    {cityNameBySlug.get(s.city_slug ?? '') ?? s.city_slug ?? 'No city'}
                    {s.assigned_location ? ` · ${s.assigned_location}` : ''}
                  </>
                }
                phone={s.phone_number}
                email={s.email}
                status={{
                  label: humanise(s.availability_status),
                  ok: s.availability_status === 'available',
                }}
                warn={s.assigned_manager_id ? null : 'No manager assigned'}
                facts={[
                  {
                    label: 'Manager',
                    value: s.assigned_manager_id
                      ? managerNameById.get(s.assigned_manager_id) ?? 'Unknown'
                      : '—',
                  },
                  { label: 'Experience', value: `${s.experience_years} yr` },
                  {
                    label: 'Qualifications',
                    value: s.qualifications.length ? s.qualifications.join(', ') : '—',
                  },
                  {
                    label: 'Documents',
                    value: (() => {
                      const c = docCounts.get(s.id);
                      if (!c || c.total === 0) return <span className="cell-warn">None</span>;
                      return c.verified === c.total ? (
                        <span className="doc-ok">All {c.total} verified</span>
                      ) : (
                        <span className="cell-warn">
                          {c.verified} of {c.total} verified
                        </span>
                      );
                    })(),
                  },
                ]}
                actions={
                  <>
                    <button
                      className="btn-small" type="button"
                      onClick={() => setDocsFor({ id: s.id, name: s.full_name })}
                    >Documents</button>
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
                  </>
                }
              />
            ))}
          </div>
          {filteredStaff.length === 0 && (
            <div className="no-data">
              {staff.length === 0 ? 'No staff yet.' : 'No staff match these filters.'}
            </div>
          )}
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
      {docsFor && (
        <DocumentsModal
          staffId={docsFor.id}
          staffName={docsFor.name}
          isAdmin
          onClose={() => setDocsFor(null)}
          onError={setError}
          onNotice={setNotice}
          onChanged={() => void load()}
        />
      )}

      {credential && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{credential.action === 'create' ? 'Login created' : 'Password reset'}</h2>
            <p className="muted">
              Read these to {credential.full_name}. They will be asked to choose their own password
              the first time they sign in.
            </p>

            <div className="credential">
              <div>
                <span className="credential-label">Mobile number</span>
                <span className="credential-value">{credential.login_number}</span>
              </div>
              <div>
                <span className="credential-label">Temporary password</span>
                <span className="credential-value">{credential.password}</span>
              </div>
            </div>

            <div className="banner banner-warn">
              This password is shown once and is not stored anywhere. If you close this without
              noting it down, reset it and start again.
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    `Pari Home Healthcare portal\nMobile number: ${credential.login_number}\nTemporary password: ${credential.password}`
                  )
                }
              >
                Copy
              </button>
              <button className="btn-primary" type="button" onClick={() => setCredential(null)}>
                I have noted it down
              </button>
            </div>
          </div>
        </div>
      )}

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
          <PhotoPicker
            owner="manager"
            id={managerEditId}
            name={managerForm.full_name || 'this manager'}
            path={managerEditId ? managerPhoto.get(managerEditId) ?? null : null}
            signedUrl={avatars.get(managerPhoto.get(managerEditId ?? '') ?? '') ?? null}
            onError={(m) => m && setError(m)}
            onChange={async (next) => {
              if (!managerEditId) return;
              const { error: e } = await supabase
                .from('location_managers')
                .update({ photo_path: next })
                .eq('id', managerEditId);
              if (e) setError(e.message);
              else await load();
            }}
          />
          <PhoneField
            label="Mobile number"
            id="manager-phone"
            value={managerForm.phone_number}
            onChange={(v) => setManagerForm({ ...managerForm, phone_number: v })}
            hint="This is what they sign in with, and what colleagues tap to call."
          />
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
          <PhotoPicker
            owner="staff"
            id={staffEditId}
            name={staffForm.full_name || 'this staff member'}
            path={staffEditId ? staff.find((x) => x.id === staffEditId)?.photo_path ?? null : null}
            signedUrl={
              avatars.get(staff.find((x) => x.id === staffEditId)?.photo_path ?? '') ?? null
            }
            onError={(m) => m && setError(m)}
            onChange={async (next) => {
              if (!staffEditId) return;
              const { error: e } = await supabase
                .from('location_staff')
                .update({ photo_path: next })
                .eq('id', staffEditId);
              if (e) setError(e.message);
              else await load();
            }}
          />
          <PhoneField
            label="Mobile number"
            id="staff-phone"
            value={staffForm.phone_number}
            onChange={(v) => setStaffForm({ ...staffForm, phone_number: v })}
            hint="Used to call them, and to sign in once staff logins are issued."
          />
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
          <PhoneField
            label="Support phone"
            id="city-support"
            value={cityForm.support_phone}
            onChange={(v) => setCityForm({ ...cityForm, support_phone: v })}
          />
          <PhoneField
            label="WhatsApp number"
            id="city-whatsapp"
            value={cityForm.whatsapp_number}
            onChange={(v) => setCityForm({ ...cityForm, whatsapp_number: v })}
          />
          <Field label="Sort order">
            <input type="number" value={cityForm.sort_order}
              onChange={(e) => setCityForm({ ...cityForm, sort_order: e.target.value })} />
          </Field>
        </Modal>
      )}
    </>
  );
}

/**
 * One headline number.
 *
 * Every tile carries the portal's own colour rather than a colour of its own:
 * these are unrelated measures, not a series, so six different hues would be
 * decoration dressed as information. A tile only changes colour when its value
 * *means* something — and then it says so in words too, because colour alone
 * carries nothing to a reader who cannot see it.
 */
function StatCard({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'good';
  note?: string;
}) {
  return (
    <div className={`stat-card ${tone ? `stat-card-${tone}` : ''}`}>
      <h3>{label}</h3>
      <p className="stat-number">{value}</p>
      {note && <p className="stat-note">{note}</p>}
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="stat-card breakdown-card">
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
