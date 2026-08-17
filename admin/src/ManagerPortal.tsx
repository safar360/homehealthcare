import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import AttendancePanel from './AttendancePanel';
import MonthlyPanel from './MonthlyPanel';
import PatientsPanel from './PatientsPanel';
import { isEnabled } from './lib/features';
import {
  AVAILABILITY_STATUSES,
  humanise,
  splitList,
  type Manager,
  type Profile,
  type Staff,
  type StaffRoleRow,
} from './lib/types';

type Tab = 'overview' | 'staff' | 'patients' | 'day' | 'month';

type StaffForm = {
  full_name: string;
  email: string;
  phone_number: string;
  staff_role: string;
  assigned_location: string;
  qualifications: string;
  experience_years: string;
  availability_status: string;
};

const emptyForm: StaffForm = {
  full_name: '',
  email: '',
  phone_number: '',
  staff_role: 'assistant',
  assigned_location: '',
  qualifications: '',
  experience_years: '0',
  availability_status: 'available',
};

// A hidden screen is hidden, not forbidden — RLS is what actually protects the
// data. These flags only control the rollout.
const visibleTabs: Tab[] = [
  'overview',
  'staff',
  ...(isEnabled('patients') ? (['patients'] as Tab[]) : []),
  ...(isEnabled('daySheet') ? (['day'] as Tab[]) : []),
  ...(isEnabled('monthlyBills') ? (['month'] as Tab[]) : []),
];

export default function ManagerPortal({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [manager, setManager] = useState<Manager | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<StaffRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState<StaffForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Resolve the manager record from the signed-in user. The earlier draft
    // loaded "the first active manager" instead, which showed whoever happened
    // to sort first their own team.
    const { data: managerRow, error: managerError } = await supabase
      .from('location_managers')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();

    if (managerError) {
      setError(managerError.message);
      setLoading(false);
      return;
    }

    if (!managerRow) {
      setManager(null);
      setLoading(false);
      return;
    }

    setManager(managerRow as Manager);

    const { data: roleRows } = await supabase
      .from('staff_roles')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setRoles((roleRows as StaffRoleRow[]) ?? []);

    const { data: staffRows, error: staffError } = await supabase
      .from('location_staff')
      .select('*')
      .eq('assigned_manager_id', managerRow.id)
      .eq('is_active', true)
      .order('full_name');

    if (staffError) setError(staffError.message);
    setStaff((staffRows as Staff[]) ?? []);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (filterStatus && s.availability_status !== filterStatus) return false;
      if (!term) return true;
      return (
        s.full_name.toLowerCase().includes(term) || (s.email ?? '').toLowerCase().includes(term)
      );
    });
  }, [staff, search, filterStatus]);

  const stats = useMemo(
    () => ({
      total: staff.length,
      available: staff.filter((s) => s.availability_status === 'available').length,
      onLeave: staff.filter((s) => s.availability_status === 'on_leave').length,
      training: staff.filter((s) => s.availability_status === 'training').length,
      byRole: roles.reduce<Record<string, number>>((acc, role) => {
        const count = staff.filter((s) => s.staff_role === role.slug).length;
        if (count > 0) acc[role.label] = count;
        return acc;
      }, {}),
    }),
    [staff, roles]
  );

  const save = async () => {
    if (!form || !manager) return;
    if (!form.full_name.trim()) {
      setError('A staff member needs a name.');
      return;
    }

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone_number: form.phone_number.trim() || null,
      staff_role: form.staff_role,
      assigned_location: form.assigned_location.trim() || null,
      qualifications: splitList(form.qualifications),
      experience_years: Number(form.experience_years) || 0,
      availability_status: form.availability_status,
      // A manager can only create and hold staff inside their own city and team;
      // the matching RLS policy rejects anything else.
      city_slug: manager.city_slug,
      assigned_manager_id: manager.id,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = editId
      ? await supabase.from('location_staff').update(payload).eq('id', editId)
      : await supabase.from('location_staff').insert([payload]);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setForm(null);
    setEditId(null);
    setNotice(editId ? 'Staff member updated.' : 'Staff member added to your team.');
    await load();
  };

  const deactivate = async (member: Staff) => {
    if (!window.confirm(`Remove ${member.full_name} from your team? An admin can restore them.`)) {
      return;
    }

    const { error: delError } = await supabase
      .from('location_staff')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', member.id);

    if (delError) {
      setError(delError.message);
      return;
    }
    setNotice(`${member.full_name} removed from your team.`);
    await load();
  };

  if (loading) return <p className="muted">Loading…</p>;

  if (!manager) {
    return (
      <div className="content-section">
        <h2>No manager record</h2>
        <p className="muted">
          Your profile has the manager role, but no row in <code>location_managers</code> is linked
          to it. An admin needs to create one and set its <code>user_id</code> to your account before
          this portal can show your team.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="content-section manager-header">
        <div>
          <h2>{manager.full_name}</h2>
          <p className="muted">
            {manager.city_slug ?? 'No city'} ·{' '}
            {manager.managed_locations.length > 0
              ? manager.managed_locations.join(', ')
              : 'All locations'}
          </p>
        </div>
        <div className="muted">
          {manager.email ?? '—'}
          <br />
          {manager.phone_number ?? '—'}
        </div>
      </section>

      <nav className="tabs">
        {visibleTabs.map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'overview' && 'Overview'}
            {key === 'staff' && `My team (${staff.length})`}
            {key === 'patients' && 'Patients & rates'}
            {key === 'day' && 'Day sheet'}
            {key === 'month' && 'Monthly bills'}
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

      {tab === 'overview' && (
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>Team size</h3>
            <p className="stat-number">{stats.total}</p>
          </div>
          <div className="stat-card">
            <h3>Available</h3>
            <p className="stat-number stat-good">{stats.available}</p>
          </div>
          <div className="stat-card">
            <h3>On leave</h3>
            <p className="stat-number stat-warn">{stats.onLeave}</p>
          </div>
          <div className="stat-card">
            <h3>In training</h3>
            <p className="stat-number">{stats.training}</p>
          </div>
          <div className="stat-card">
            <h3>By role</h3>
            <div className="role-breakdown">
              {Object.entries(stats.byRole).map(([role, count]) => (
                <div key={role} className="role-item">
                  <span>{role}</span>
                  <strong>{count}</strong>
                </div>
              ))}
              {Object.keys(stats.byRole).length === 0 && <span className="muted">No staff yet</span>}
            </div>
          </div>
        </div>
      )}

      {tab === 'patients' && isEnabled('patients') && (
        <PatientsPanel
          scope={{ kind: 'manager', managerId: manager.id, citySlug: manager.city_slug }}
          onError={setError}
          onNotice={setNotice}
        />
      )}

      {tab === 'day' && isEnabled('daySheet') && (
        <AttendancePanel
          scope={{ kind: 'manager', managerId: manager.id, citySlug: manager.city_slug }}
          onError={setError}
          onNotice={setNotice}
        />
      )}

      {tab === 'month' && isEnabled('monthlyBills') && (
        <MonthlyPanel
          scope={{ kind: 'manager', managerId: manager.id, citySlug: manager.city_slug }}
          onError={setError}
          onNotice={setNotice}
        />
      )}

      {tab === 'staff' && (
        <section className="content-section">
          <div className="section-header">
            <h2>My team</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                setEditId(null);
                setForm({ ...emptyForm });
              }}
            >
              + Add staff
            </button>
          </div>

          <div className="filters">
            <input
              type="search"
              className="filter-input"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
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
                  <th>Location</th>
                  <th>Status</th>
                  <th>Qualifications</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>
                      {s.email ?? '—'}
                      <br />
                      <span className="muted">{s.phone_number ?? ''}</span>
                    </td>
                    <td>
                      <span className="badge badge-role">
                        {roles.find((r) => r.slug === s.staff_role)?.label ?? humanise(s.staff_role)}
                      </span>
                    </td>
                    <td>{s.assigned_location ?? '—'}</td>
                    <td>
                      <span
                        className={`status ${s.availability_status === 'available' ? 'active' : 'inactive'}`}
                      >
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
                          setEditId(s.id);
                          setForm({
                            full_name: s.full_name,
                            email: s.email ?? '',
                            phone_number: s.phone_number ?? '',
                            staff_role: s.staff_role,
                            assigned_location: s.assigned_location ?? '',
                            qualifications: s.qualifications.join(', '),
                            experience_years: String(s.experience_years ?? 0),
                            availability_status: s.availability_status,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn-danger-small" type="button" onClick={() => deactivate(s)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="no-data">
                {staff.length === 0
                  ? 'No staff on your team yet. Use "Add staff" to begin.'
                  : 'No staff match these filters.'}
              </div>
            )}
          </div>

          <p className="muted">
            Moving someone to another manager or city is an admin action — ask an admin to run the
            transfer so it lands in the audit trail.
          </p>
        </section>
      )}

      {form && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{editId ? 'Edit staff member' : 'Add staff member'}</h2>

            <ManagerField label="Full name" required>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </ManagerField>
            <ManagerField label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </ManagerField>
            <ManagerField label="Phone">
              <input
                type="tel"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </ManagerField>
            <ManagerField label="Role">
              <select value={form.staff_role} onChange={(e) => setForm({ ...form, staff_role: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </ManagerField>
            <ManagerField label="Assigned location">
              <input
                value={form.assigned_location}
                onChange={(e) => setForm({ ...form, assigned_location: e.target.value })}
                placeholder="North Center"
              />
            </ManagerField>
            <ManagerField label="Qualifications (comma-separated)">
              <input
                value={form.qualifications}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                placeholder="BSN, RN License, First Aid"
              />
            </ManagerField>
            <ManagerField label="Years of experience">
              <input
                type="number"
                min="0"
                value={form.experience_years}
                onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
              />
            </ManagerField>
            <ManagerField label="Availability">
              <select
                value={form.availability_status}
                onChange={(e) => setForm({ ...form, availability_status: e.target.value })}
              >
                {AVAILABILITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            </ManagerField>

            <div className="modal-actions">
              <button className="btn-primary" type="button" onClick={save}>
                Save
              </button>
              <button className="btn-secondary" type="button" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ManagerField({
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
