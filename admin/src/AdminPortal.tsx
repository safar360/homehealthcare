import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import {
  AVAILABILITY_STATUSES,
  STAFF_ROLES,
  humanise,
  splitList,
  type City,
  type DashboardSummary,
  type ManagerWithCount,
  type Staff,
  type Transfer,
} from './lib/types';

type Tab = 'dashboard' | 'managers' | 'staff' | 'transfers';

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

const emptyManagerForm: ManagerForm = {
  full_name: '',
  email: '',
  phone_number: '',
  city_slug: '',
  managed_locations: '',
};

const emptyStaffForm: StaffForm = {
  full_name: '',
  email: '',
  phone_number: '',
  city_slug: '',
  staff_role: 'assistant',
  assigned_manager_id: '',
  assigned_location: '',
  qualifications: '',
  experience_years: '0',
  availability_status: 'available',
};

export default function AdminPortal() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [managers, setManagers] = useState<ManagerWithCount[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [cities, setCities] = useState<City[]>([]);
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
  const [transferFor, setTransferFor] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [citiesRes, dashRes, managersRes, staffRes, transfersRes] = await Promise.all([
      supabase.from('cities').select('slug, name').eq('is_active', true).order('sort_order'),
      supabase.rpc('get_admin_dashboard_summary'),
      supabase.rpc('get_managers_with_staff_count'),
      supabase.from('location_staff').select('*').eq('is_active', true).order('full_name'),
      supabase
        .from('staff_transfer_history')
        .select('*')
        .order('transferred_at', { ascending: false })
        .limit(50),
    ]);

    // supabase-js resolves with an { error } field rather than throwing, so each
    // response has to be checked explicitly.
    const failure = [citiesRes, dashRes, managersRes, staffRes, transfersRes].find((r) => r.error);
    if (failure?.error) setError(failure.error.message);

    setCities((citiesRes.data as City[]) ?? []);
    setDashboard((dashRes.data as DashboardSummary) ?? null);
    setManagers((managersRes.data as ManagerWithCount[]) ?? []);
    setStaff((staffRes.data as Staff[]) ?? []);
    setTransfers((transfersRes.data as Transfer[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const managerNameById = useMemo(() => {
    const map = new Map<string, string>();
    managers.forEach((m) => map.set(m.id, m.full_name));
    return map;
  }, [managers]);

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (filterCity && s.city_slug !== filterCity) return false;
      if (filterRole && s.staff_role !== filterRole) return false;
      if (filterStatus && s.availability_status !== filterStatus) return false;
      if (!term) return true;
      return (
        s.full_name.toLowerCase().includes(term) ||
        (s.email ?? '').toLowerCase().includes(term)
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

    const { error: saveError } = managerEditId
      ? await supabase.from('location_managers').update(payload).eq('id', managerEditId)
      : await supabase.from('location_managers').insert([payload]);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setManagerForm(null);
    setManagerEditId(null);
    setNotice(managerEditId ? 'Manager updated.' : 'Manager added.');
    await load();
  };

  const saveStaff = async () => {
    if (!staffForm) return;
    if (!staffForm.full_name.trim() || !staffForm.city_slug) {
      setError('A staff member needs at least a name and a city.');
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

    const { error: saveError } = staffEditId
      ? await supabase.from('location_staff').update(payload).eq('id', staffEditId)
      : await supabase.from('location_staff').insert([payload]);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setStaffForm(null);
    setStaffEditId(null);
    setNotice(staffEditId ? 'Staff member updated.' : 'Staff member added.');
    await load();
  };

  const deactivate = async (table: 'location_managers' | 'location_staff', id: string, label: string) => {
    if (!window.confirm(`Deactivate ${label}? The record is kept for the audit trail.`)) return;

    const { error: delError } = await supabase
      .from(table)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (delError) {
      setError(delError.message);
      return;
    }
    setNotice(`${label} deactivated.`);
    await load();
  };

  return (
    <>
      <nav className="tabs">
        {(['dashboard', 'managers', 'staff', 'transfers'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {humanise(key)}
            {key === 'managers' && ` (${managers.length})`}
            {key === 'staff' && ` (${staff.length})`}
          </button>
        ))}
      </nav>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="banner banner-success">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}

      {!loading && tab === 'dashboard' && (
        <div className="dashboard-grid">
          <StatCard label="Managers" value={dashboard?.total_managers ?? 0} />
          <StatCard label="Staff" value={dashboard?.total_staff ?? 0} />
          <StatCard label="Active cities" value={dashboard?.total_cities ?? 0} />
          <BreakdownCard title="Staff by role" data={dashboard?.staff_by_role} />
          <BreakdownCard title="Staff by city" data={dashboard?.staff_by_city} />
          <BreakdownCard title="Managers by city" data={dashboard?.managers_by_city} />
          <BreakdownCard title="Orders by status" data={dashboard?.orders_by_status} />
        </div>
      )}

      {!loading && tab === 'managers' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Location managers</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                setManagerEditId(null);
                setManagerForm({ ...emptyManagerForm });
              }}
            >
              + Add manager
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Locations</th>
                  <th>Staff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>{m.email ?? '—'}</td>
                    <td>{m.phone_number ?? '—'}</td>
                    <td>{m.city_slug ?? '—'}</td>
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
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger-small"
                        type="button"
                        onClick={() => deactivate('location_managers', m.id, m.full_name)}
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {managers.length === 0 && <div className="no-data">No managers yet.</div>}
          </div>
        </section>
      )}

      {!loading && tab === 'staff' && (
        <section className="content-section">
          <div className="section-header">
            <h2>Staff</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                setStaffEditId(null);
                setStaffForm({ ...emptyStaffForm });
              }}
            >
              + Add staff
            </button>
          </div>

          <div className="filters">
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input"
            />
            <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="filter-select">
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="filter-select">
              <option value="">All roles</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanise(r)}
                </option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
              <option value="">All statuses</option>
              {AVAILABILITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setSearch('');
                setFilterCity('');
                setFilterRole('');
                setFilterStatus('');
              }}
            >
              Clear
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>City</th>
                  <th>Manager</th>
                  <th>Status</th>
                  <th>Qualifications</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>
                      {s.email ?? '—'}
                      <br />
                      <span className="muted">{s.phone_number ?? ''}</span>
                    </td>
                    <td>
                      <span className="badge badge-role">{humanise(s.staff_role)}</span>
                    </td>
                    <td>{s.city_slug ?? '—'}</td>
                    <td>
                      {s.assigned_manager_id
                        ? managerNameById.get(s.assigned_manager_id) ?? 'Unknown'
                        : <span className="muted">Unassigned</span>}
                    </td>
                    <td>
                      <span className={`status ${s.availability_status === 'available' ? 'active' : 'inactive'}`}>
                        {humanise(s.availability_status)}
                      </span>
                    </td>
                    <td>
                      <div className="qualifications">
                        {s.qualifications.map((q) => (
                          <span key={q} className="qual-tag">
                            {q}
                          </span>
                        ))}
                        {s.qualifications.length === 0 && '—'}
                      </div>
                    </td>
                    <td className="actions">
                      <button
                        className="btn-small"
                        type="button"
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
                      >
                        Edit
                      </button>
                      <button className="btn-small" type="button" onClick={() => setTransferFor(s)}>
                        Transfer
                      </button>
                      <button
                        className="btn-danger-small"
                        type="button"
                        onClick={() => deactivate('location_staff', s.id, s.full_name)}
                      >
                        Deactivate
                      </button>
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

      {!loading && tab === 'transfers' && (
        <section className="content-section">
          <h2>Transfer history</h2>
          <p className="muted">The 50 most recent staff movements.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Staff</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const staffName = staff.find((s) => s.id === t.staff_id)?.full_name ?? t.staff_id;
                  const from = t.from_manager_id ? managerNameById.get(t.from_manager_id) : null;
                  const to = t.to_manager_id ? managerNameById.get(t.to_manager_id) : null;
                  return (
                    <tr key={t.id}>
                      <td>{new Date(t.transferred_at).toLocaleString()}</td>
                      <td>{staffName}</td>
                      <td>
                        {from ?? 'Unassigned'}
                        <br />
                        <span className="muted">{t.from_city ?? '—'}</span>
                      </td>
                      <td>
                        {to ?? 'Unassigned'}
                        <br />
                        <span className="muted">{t.to_city ?? '—'}</span>
                      </td>
                      <td>{t.reason ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {transfers.length === 0 && <div className="no-data">No transfers recorded yet.</div>}
          </div>
        </section>
      )}

      {managerForm && (
        <Modal title={managerEditId ? 'Edit manager' : 'Add manager'} onClose={() => setManagerForm(null)} onSave={saveManager}>
          <Field label="Full name" required>
            <input
              value={managerForm.full_name}
              onChange={(e) => setManagerForm({ ...managerForm, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={managerForm.email}
              onChange={(e) => setManagerForm({ ...managerForm, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={managerForm.phone_number}
              onChange={(e) => setManagerForm({ ...managerForm, phone_number: e.target.value })}
            />
          </Field>
          <Field label="City" required>
            <select
              value={managerForm.city_slug}
              onChange={(e) => setManagerForm({ ...managerForm, city_slug: e.target.value })}
            >
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Managed locations (comma-separated)">
            <input
              value={managerForm.managed_locations}
              onChange={(e) => setManagerForm({ ...managerForm, managed_locations: e.target.value })}
              placeholder="North Center, South Center"
            />
          </Field>
        </Modal>
      )}

      {staffForm && (
        <Modal title={staffEditId ? 'Edit staff member' : 'Add staff member'} onClose={() => setStaffForm(null)} onSave={saveStaff}>
          <Field label="Full name" required>
            <input
              value={staffForm.full_name}
              onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={staffForm.phone_number}
              onChange={(e) => setStaffForm({ ...staffForm, phone_number: e.target.value })}
            />
          </Field>
          <Field label="City" required>
            <select
              value={staffForm.city_slug}
              onChange={(e) => setStaffForm({ ...staffForm, city_slug: e.target.value })}
            >
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select
              value={staffForm.staff_role}
              onChange={(e) => setStaffForm({ ...staffForm, staff_role: e.target.value })}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanise(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reporting manager">
            <select
              value={staffForm.assigned_manager_id}
              onChange={(e) => setStaffForm({ ...staffForm, assigned_manager_id: e.target.value })}
            >
              <option value="">Unassigned</option>
              {managers
                .filter((m) => !staffForm.city_slug || m.city_slug === staffForm.city_slug)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Assigned location">
            <input
              value={staffForm.assigned_location}
              onChange={(e) => setStaffForm({ ...staffForm, assigned_location: e.target.value })}
              placeholder="North Center"
            />
          </Field>
          <Field label="Qualifications (comma-separated)">
            <input
              value={staffForm.qualifications}
              onChange={(e) => setStaffForm({ ...staffForm, qualifications: e.target.value })}
              placeholder="BSN, RN License, First Aid"
            />
          </Field>
          <Field label="Years of experience">
            <input
              type="number"
              min="0"
              value={staffForm.experience_years}
              onChange={(e) => setStaffForm({ ...staffForm, experience_years: e.target.value })}
            />
          </Field>
          <Field label="Availability">
            <select
              value={staffForm.availability_status}
              onChange={(e) => setStaffForm({ ...staffForm, availability_status: e.target.value })}
            >
              {AVAILABILITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>
        </Modal>
      )}

      {transferFor && (
        <TransferModal
          staffMember={transferFor}
          managers={managers}
          cities={cities}
          onClose={() => setTransferFor(null)}
          onDone={async (message) => {
            setTransferFor(null);
            setNotice(message);
            await load();
          }}
          onError={setError}
        />
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <h3>{label}</h3>
      <p className="stat-number">{value}</p>
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      <div className="role-breakdown">
        {entries.map(([key, count]) => (
          <div key={key} className="role-item">
            <span>{humanise(key)}</span>
            <strong>{count}</strong>
          </div>
        ))}
        {entries.length === 0 && <span className="muted">No data</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="form-group">
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  onSave,
  saveLabel = 'Save',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={onSave}>
            {saveLabel}
          </button>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({
  staffMember,
  managers,
  cities,
  onClose,
  onDone,
  onError,
}: {
  staffMember: Staff;
  managers: ManagerWithCount[];
  cities: City[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'manager' | 'city'>('manager');
  const [managerId, setManagerId] = useState(staffMember.assigned_manager_id ?? '');
  const [citySlug, setCitySlug] = useState(staffMember.city_slug ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);

    // transfer_staff_to_city also reassigns the manager, because a manager only
    // covers their own city.
    const { data, error } =
      mode === 'manager'
        ? await supabase.rpc('transfer_staff', {
            p_staff_id: staffMember.id,
            p_new_manager_id: managerId || null,
            p_reason: reason.trim() || null,
          })
        : await supabase.rpc('transfer_staff_to_city', {
            p_staff_id: staffMember.id,
            p_new_city_slug: citySlug,
            p_new_manager_id: managerId || null,
            p_reason: reason.trim() || null,
          });

    setBusy(false);

    if (error) {
      onError(error.message);
      return;
    }
    if (data && typeof data === 'object' && 'error' in data) {
      onError(String((data as { error: unknown }).error));
      return;
    }
    await onDone(`${staffMember.full_name} transferred.`);
  };

  return (
    <Modal
      title={`Transfer ${staffMember.full_name}`}
      onClose={onClose}
      onSave={busy ? () => undefined : submit}
      saveLabel={busy ? 'Transferring…' : 'Transfer'}
    >
      <Field label="Transfer type">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'manager' | 'city')}>
          <option value="manager">To another manager (same city)</option>
          <option value="city">To another city</option>
        </select>
      </Field>

      {mode === 'city' && (
        <Field label="New city" required>
          <select
            value={citySlug}
            onChange={(e) => {
              setCitySlug(e.target.value);
              // The current manager does not cover the new city.
              setManagerId('');
            }}
          >
            <option value="">Select a city</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="New manager">
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">Unassigned</option>
          {managers
            .filter((m) =>
              mode === 'city' ? m.city_slug === citySlug : m.city_slug === staffMember.city_slug
            )
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.staff_count} staff)
              </option>
            ))}
        </select>
      </Field>

      <Field label="Reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit trail" />
      </Field>
    </Modal>
  );
}
