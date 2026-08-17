import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import {
  ASSIGNMENT_STATUSES,
  PATIENT_STATUSES,
  humanise,
  inr,
  today,
  type AssignmentRate,
  type CareAssignment,
  type Patient,
  type ServiceType,
  type Staff,
} from './lib/types';

/**
 * Patients, the staff assigned to them, and the per-service-type rates those
 * assignments are priced at.
 *
 * A manager sees only their own patients and can only assign their own team —
 * both enforced by RLS, not by this component. Admin scope sees everything.
 */
export type PatientsScope =
  | { kind: 'manager'; managerId: string; citySlug: string | null }
  | { kind: 'admin' };

type PatientForm = {
  full_name: string;
  phone_number: string;
  alt_phone: string;
  address: string;
  area: string;
  status: string;
  started_on: string;
  notes: string;
};

type AssignmentForm = {
  staff_id: string;
  billing_mode: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string;
};

const emptyPatient: PatientForm = {
  full_name: '',
  phone_number: '',
  alt_phone: '',
  address: '',
  area: '',
  status: 'active',
  started_on: today(),
  notes: '',
};

const emptyAssignment: AssignmentForm = {
  staff_id: '',
  billing_mode: 'monthly',
  start_date: today(),
  end_date: '',
  status: 'active',
  notes: '',
};

export default function PatientsPanel({
  scope,
  onError,
  onNotice,
}: {
  scope: PatientsScope;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [staffOptions, setStaffOptions] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [selected, setSelected] = useState<Patient | null>(null);
  const [assignments, setAssignments] = useState<CareAssignment[]>([]);
  const [rates, setRates] = useState<AssignmentRate[]>([]);

  const [patientForm, setPatientForm] = useState<PatientForm | null>(null);
  const [patientEditId, setPatientEditId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm | null>(null);
  const [assignmentEditId, setAssignmentEditId] = useState<string | null>(null);
  const [ratesFor, setRatesFor] = useState<CareAssignment | null>(null);
  const [saving, setSaving] = useState(false);

  // Depend on the id, not on the scope object — the parent builds that literal
  // fresh on every render, and a reload loop would follow.
  const managerId = scope.kind === 'manager' ? scope.managerId : null;

  const load = useCallback(async () => {
    setLoading(true);

    let patientQuery = supabase.from('patients').select('*').eq('is_active', true);
    let staffQuery = supabase.from('location_staff').select('*').eq('is_active', true);
    if (managerId) {
      patientQuery = patientQuery.eq('assigned_manager_id', managerId);
      staffQuery = staffQuery.eq('assigned_manager_id', managerId);
    }

    const [patientRes, staffRes, typeRes] = await Promise.all([
      patientQuery.order('full_name'),
      staffQuery.order('full_name'),
      supabase.from('service_types').select('*').eq('is_active', true).order('sort_order'),
    ]);

    // supabase-js returns errors, it does not throw them — an unchecked call
    // here would report a successful load of nothing at all.
    const failure = patientRes.error ?? staffRes.error ?? typeRes.error;
    if (failure) onError(failure.message);

    setPatients((patientRes.data as Patient[]) ?? []);
    setStaffOptions((staffRes.data as Staff[]) ?? []);
    setServiceTypes((typeRes.data as ServiceType[]) ?? []);
    setLoading(false);
  }, [managerId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCare = useCallback(
    async (patient: Patient) => {
      const { data: rows, error } = await supabase
        .from('care_assignments')
        .select('*')
        .eq('patient_id', patient.id)
        .order('start_date', { ascending: false });

      if (error) {
        onError(error.message);
        return;
      }

      const list = (rows as CareAssignment[]) ?? [];
      setAssignments(list);

      if (list.length === 0) {
        setRates([]);
        return;
      }

      const { data: rateRows, error: rateError } = await supabase
        .from('assignment_rates')
        .select('*')
        .in(
          'assignment_id',
          list.map((a) => a.id)
        );

      if (rateError) onError(rateError.message);
      setRates((rateRows as AssignmentRate[]) ?? []);
    },
    [onError]
  );

  const select = async (patient: Patient) => {
    setSelected(patient);
    await loadCare(patient);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (!term) return true;
      return (
        p.full_name.toLowerCase().includes(term) ||
        (p.phone_number ?? '').includes(term) ||
        (p.area ?? '').toLowerCase().includes(term)
      );
    });
  }, [patients, search, filterStatus]);

  const staffName = (id: string | null) =>
    staffOptions.find((s) => s.id === id)?.full_name ?? 'Unassigned';

  const ratesOf = (assignmentId: string) => rates.filter((r) => r.assignment_id === assignmentId);

  const savePatient = async () => {
    if (!patientForm) return;
    if (!patientForm.full_name.trim()) {
      onError('A patient needs a name.');
      return;
    }

    const payload: Record<string, unknown> = {
      full_name: patientForm.full_name.trim(),
      phone_number: patientForm.phone_number.trim() || null,
      alt_phone: patientForm.alt_phone.trim() || null,
      address: patientForm.address.trim() || null,
      area: patientForm.area.trim() || null,
      status: patientForm.status,
      started_on: patientForm.started_on || null,
      notes: patientForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    // A manager may only hold patients in their own city and under their own
    // name; the matching RLS policy rejects anything else, so send it explicitly
    // rather than letting a default decide.
    if (scope.kind === 'manager' && !patientEditId) {
      payload.assigned_manager_id = scope.managerId;
      payload.city_slug = scope.citySlug;
    }

    setSaving(true);
    const { error } = patientEditId
      ? await supabase.from('patients').update(payload).eq('id', patientEditId)
      : await supabase.from('patients').insert([payload]);
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setPatientForm(null);
    setPatientEditId(null);
    onNotice(patientEditId ? 'Patient updated.' : 'Patient added.');
    await load();
  };

  const saveAssignment = async () => {
    if (!assignmentForm || !selected) return;
    if (!assignmentForm.staff_id) {
      onError('Choose the staff member who will serve this patient.');
      return;
    }

    const payload: Record<string, unknown> = {
      patient_id: selected.id,
      staff_id: assignmentForm.staff_id,
      billing_mode: assignmentForm.billing_mode,
      start_date: assignmentForm.start_date || today(),
      end_date: assignmentForm.end_date || null,
      status: assignmentForm.status,
      notes: assignmentForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (!assignmentEditId) {
      payload.manager_id =
        scope.kind === 'manager' ? scope.managerId : selected.assigned_manager_id;
    }

    setSaving(true);
    const { error } = assignmentEditId
      ? await supabase.from('care_assignments').update(payload).eq('id', assignmentEditId)
      : await supabase.from('care_assignments').insert([payload]);
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setAssignmentForm(null);
    setAssignmentEditId(null);
    onNotice(
      assignmentEditId
        ? 'Assignment updated.'
        : 'Staff assigned. Set the rates before the first check-in.'
    );
    await loadCare(selected);
  };

  const endAssignment = async (assignment: CareAssignment) => {
    if (
      !window.confirm(
        `End ${staffName(assignment.staff_id)}'s assignment? Attendance already recorded is kept and still bills.`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from('care_assignments')
      .update({ status: 'ended', end_date: today(), updated_at: new Date().toISOString() })
      .eq('id', assignment.id);

    if (error) {
      onError(error.message);
      return;
    }
    onNotice('Assignment ended.');
    if (selected) await loadCare(selected);
  };

  if (loading) return <p className="muted">Loading patients…</p>;

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <h2>Patients</h2>
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setPatientEditId(null);
              setPatientForm({ ...emptyPatient });
            }}
          >
            + Add patient
          </button>
        </div>

        <div className="filters">
          <input
            type="search"
            className="filter-input"
            placeholder="Search name, phone or area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {PATIENT_STATUSES.map((s) => (
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
                <th>Area</th>
                <th>Since</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={selected?.id === p.id ? 'row-selected' : ''}>
                  <td>{p.full_name}</td>
                  <td>
                    {p.phone_number ?? '—'}
                    <br />
                    <span className="muted">{p.address ?? ''}</span>
                  </td>
                  <td>{p.area ?? '—'}</td>
                  <td>{p.started_on ?? '—'}</td>
                  <td>
                    <span className={`status ${p.status === 'active' ? 'active' : 'inactive'}`}>
                      {humanise(p.status)}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn-small" type="button" onClick={() => void select(p)}>
                      Care &amp; rates
                    </button>
                    <button
                      className="btn-small"
                      type="button"
                      onClick={() => {
                        setPatientEditId(p.id);
                        setPatientForm({
                          full_name: p.full_name,
                          phone_number: p.phone_number ?? '',
                          alt_phone: p.alt_phone ?? '',
                          address: p.address ?? '',
                          area: p.area ?? '',
                          status: p.status,
                          started_on: p.started_on ?? '',
                          notes: p.notes ?? '',
                        });
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="no-data">
              {patients.length === 0
                ? 'No patients yet. Use "Add patient" to onboard the first one.'
                : 'No patients match these filters.'}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <section className="content-section">
          <div className="section-header">
            <div>
              <h2>Care for {selected.full_name}</h2>
              <p className="muted">
                {selected.address ?? 'No address'} · {selected.phone_number ?? 'No phone'}
              </p>
            </div>
            <div className="actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setAssignmentEditId(null);
                  setAssignmentForm({ ...emptyAssignment });
                }}
              >
                + Assign staff
              </button>
              <button className="btn-secondary" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>

          {assignments.length === 0 && (
            <div className="no-data">
              Nobody is assigned to this patient yet. Assign a staff member, then set the rates.
            </div>
          )}

          {assignments.map((a) => {
            const rateRows = ratesOf(a.id);
            const unpriced = a.status === 'active' && rateRows.length === 0;
            return (
              <div key={a.id} className="assignment-card">
                <div className="assignment-head">
                  <div>
                    <strong>{staffName(a.staff_id)}</strong>
                    <span className={`status ${a.status === 'active' ? 'active' : 'inactive'}`}>
                      {humanise(a.status)}
                    </span>
                    <p className="muted">
                      {a.billing_mode === 'monthly' ? 'Monthly rates' : 'Per-day rates'} ·{' '}
                      {a.start_date} → {a.end_date ?? 'ongoing'}
                    </p>
                  </div>
                  <div className="actions">
                    <button className="btn-small" type="button" onClick={() => setRatesFor(a)}>
                      Set rates
                    </button>
                    <button
                      className="btn-small"
                      type="button"
                      onClick={() => {
                        setAssignmentEditId(a.id);
                        setAssignmentForm({
                          staff_id: a.staff_id ?? '',
                          billing_mode: a.billing_mode,
                          start_date: a.start_date,
                          end_date: a.end_date ?? '',
                          status: a.status,
                          notes: a.notes ?? '',
                        });
                      }}
                    >
                      Edit
                    </button>
                    {a.status !== 'ended' && (
                      <button
                        className="btn-danger-small"
                        type="button"
                        onClick={() => void endAssignment(a)}
                      >
                        End
                      </button>
                    )}
                  </div>
                </div>

                {unpriced ? (
                  <div className="banner banner-warn">
                    No rates set — this staff member cannot check in until at least one service
                    type has a rate.
                  </div>
                ) : (
                  <div className="rate-chips">
                    {rateRows.map((r) => {
                      const label =
                        serviceTypes.find((t) => t.slug === r.service_type)?.label ?? r.service_type;
                      const per = a.billing_mode === 'monthly' ? '/month' : '/day';
                      return (
                        <div key={r.id} className="rate-chip">
                          <span className="rate-chip-label">{label}</span>
                          <span>
                            Patient <strong>{inr(r.patient_rate)}</strong>
                            {per}
                          </span>
                          <span>
                            Staff <strong>{inr(r.staff_rate)}</strong>
                            {per}
                          </span>
                          <span className={r.patient_rate - r.staff_rate < 0 ? 'stat-bad' : 'muted'}>
                            Margin {inr(r.patient_rate - r.staff_rate)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {patientForm && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{patientEditId ? 'Edit patient' : 'Add patient'}</h2>

            <Field label="Full name" required>
              <input
                value={patientForm.full_name}
                onChange={(e) => setPatientForm({ ...patientForm, full_name: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={patientForm.phone_number}
                onChange={(e) => setPatientForm({ ...patientForm, phone_number: e.target.value })}
                placeholder="+91…"
              />
            </Field>
            <Field label="Alternate phone">
              <input
                type="tel"
                value={patientForm.alt_phone}
                onChange={(e) => setPatientForm({ ...patientForm, alt_phone: e.target.value })}
              />
            </Field>
            <Field label="Address">
              <textarea
                rows={2}
                value={patientForm.address}
                onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
              />
            </Field>
            <Field label="Area">
              <input
                value={patientForm.area}
                onChange={(e) => setPatientForm({ ...patientForm, area: e.target.value })}
                placeholder="Arera Colony"
              />
            </Field>
            <Field label="Status">
              <select
                value={patientForm.status}
                onChange={(e) => setPatientForm({ ...patientForm, status: e.target.value })}
              >
                {PATIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service started on">
              <input
                type="date"
                value={patientForm.started_on}
                onChange={(e) => setPatientForm({ ...patientForm, started_on: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                rows={2}
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
              />
            </Field>

            <div className="modal-actions">
              <button className="btn-primary" type="button" disabled={saving} onClick={savePatient}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setPatientForm(null);
                  setPatientEditId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentForm && selected && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{assignmentEditId ? 'Edit assignment' : `Assign staff to ${selected.full_name}`}</h2>

            <Field label="Staff member" required>
              <select
                value={assignmentForm.staff_id}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, staff_id: e.target.value })}
              >
                <option value="">Choose…</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {humanise(s.staff_role)}
                    {s.availability_status !== 'available' ? ` (${humanise(s.availability_status)})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rates are">
              <select
                value={assignmentForm.billing_mode}
                onChange={(e) =>
                  setAssignmentForm({ ...assignmentForm, billing_mode: e.target.value })
                }
              >
                <option value="monthly">Monthly — charged as rate × days ÷ 30</option>
                <option value="per_day">Per day — charged as rate × days</option>
              </select>
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={assignmentForm.start_date}
                onChange={(e) =>
                  setAssignmentForm({ ...assignmentForm, start_date: e.target.value })
                }
              />
            </Field>
            <Field label="End date (leave blank while ongoing)">
              <input
                type="date"
                value={assignmentForm.end_date}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, end_date: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                value={assignmentForm.status}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, status: e.target.value })}
              >
                {ASSIGNMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                rows={2}
                value={assignmentForm.notes}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
              />
            </Field>

            <div className="modal-actions">
              <button
                className="btn-primary"
                type="button"
                disabled={saving}
                onClick={saveAssignment}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setAssignmentForm(null);
                  setAssignmentEditId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {ratesFor && (
        <RatesModal
          assignment={ratesFor}
          serviceTypes={serviceTypes}
          existing={ratesOf(ratesFor.id)}
          staffName={staffName(ratesFor.staff_id)}
          onError={onError}
          onClose={() => setRatesFor(null)}
          onSaved={async () => {
            setRatesFor(null);
            onNotice('Rates saved.');
            if (selected) await loadCare(selected);
          }}
        />
      )}
    </>
  );
}

/**
 * Rates for one assignment: a row per service type, with what the family pays
 * and what the staff member earns. Blank both fields to remove a type.
 *
 * Removing a rate never changes money already billed — attendance froze the
 * rate that applied on the day it was recorded.
 */
function RatesModal({
  assignment,
  serviceTypes,
  existing,
  staffName,
  onError,
  onClose,
  onSaved,
}: {
  assignment: CareAssignment;
  serviceTypes: ServiceType[];
  existing: AssignmentRate[];
  staffName: string;
  onError: (message: string) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, { patient: string; staff: string }>>(() =>
    Object.fromEntries(
      serviceTypes.map((t) => {
        const row = existing.find((r) => r.service_type === t.slug);
        return [
          t.slug,
          {
            patient: row ? String(row.patient_rate) : '',
            staff: row ? String(row.staff_rate) : '',
          },
        ];
      })
    )
  );
  const [saving, setSaving] = useState(false);

  const per = assignment.billing_mode === 'monthly' ? 'per month' : 'per day';

  const save = async () => {
    const upserts: Omit<AssignmentRate, 'id'>[] = [];
    const removals: string[] = [];

    for (const type of serviceTypes) {
      const entry = draft[type.slug];
      const hasPatient = entry.patient.trim() !== '';
      const hasStaff = entry.staff.trim() !== '';

      if (!hasPatient && !hasStaff) {
        if (existing.some((r) => r.service_type === type.slug)) removals.push(type.slug);
        continue;
      }
      if (!hasPatient || !hasStaff) {
        onError(`${type.label} needs both a patient rate and a staff rate, or neither.`);
        return;
      }

      const patientRate = Number(entry.patient);
      const staffRate = Number(entry.staff);
      if (!isFinite(patientRate) || !isFinite(staffRate) || patientRate < 0 || staffRate < 0) {
        onError(`${type.label} has a rate that is not a valid amount.`);
        return;
      }

      upserts.push({
        assignment_id: assignment.id,
        service_type: type.slug,
        patient_rate: patientRate,
        staff_rate: staffRate,
      });
    }

    if (upserts.length === 0 && removals.length === 0) {
      onError('Set a rate for at least one service type.');
      return;
    }

    setSaving(true);

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('assignment_rates')
        .upsert(upserts, { onConflict: 'assignment_id,service_type' });
      if (error) {
        setSaving(false);
        onError(error.message);
        return;
      }
    }

    if (removals.length > 0) {
      const { error } = await supabase
        .from('assignment_rates')
        .delete()
        .eq('assignment_id', assignment.id)
        .in('service_type', removals);
      if (error) {
        setSaving(false);
        onError(error.message);
        return;
      }
    }

    setSaving(false);
    await onSaved();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <h2>Rates — {staffName}</h2>
        <p className="muted">
          Amounts are {per}. A month is priced as rate × days served ÷ 30, so a full 30 days
          charges exactly the monthly rate.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service type</th>
                <th>Patient pays</th>
                <th>Staff earns</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {serviceTypes.map((t) => {
                const entry = draft[t.slug];
                const patientRate = Number(entry.patient);
                const staffRate = Number(entry.staff);
                const both = entry.patient.trim() !== '' && entry.staff.trim() !== '';
                const margin = patientRate - staffRate;
                return (
                  <tr key={t.slug}>
                    <td>{t.label}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="rate-input"
                        value={entry.patient}
                        placeholder="—"
                        onChange={(e) =>
                          setDraft({ ...draft, [t.slug]: { ...entry, patient: e.target.value } })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="rate-input"
                        value={entry.staff}
                        placeholder="—"
                        onChange={(e) =>
                          setDraft({ ...draft, [t.slug]: { ...entry, staff: e.target.value } })
                        }
                      />
                    </td>
                    <td className={both && margin < 0 ? 'stat-bad' : ''}>
                      {both ? inr(margin) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="muted">Leave both boxes empty to remove a service type from this agreement.</p>

        <div className="modal-actions">
          <button className="btn-primary" type="button" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save rates'}
          </button>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
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
