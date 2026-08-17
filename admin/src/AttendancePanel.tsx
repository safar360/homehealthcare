import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  clockTime,
  today,
  type AssignmentRate,
  type CareAssignment,
  type Patient,
  type ServiceType,
  type Staff,
} from './lib/types';
import type { PatientsScope } from './PatientsPanel';

/**
 * The day sheet. One row per engagement running on the chosen date, whether
 * anyone has recorded it yet or not.
 *
 * A manager fills this in today; when staff start checking in from their
 * phones, the same screen is where a manager corrects the times, adds a visit
 * that was served but not recorded, and approves the day.
 */

type Attendance = {
  id: string;
  assignment_id: string;
  service_date: string;
  service_type: string;
  status: string;
  day_fraction: number;
  check_in_at: string | null;
  check_out_at: string | null;
  verified_at: string | null;
  note: string | null;
};

type Draft = {
  service_type: string;
  status: '' | 'present' | 'absent' | 'leave';
  day_fraction: string;
  check_in: string;
  check_out: string;
};

const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

/** "09:30" on the service date, as an instant. Local time — these are IST shifts. */
const toInstant = (date: string, hhmm: string): string | null =>
  hhmm ? new Date(`${date}T${hhmm}:00`).toISOString() : null;

/** The reverse, for populating a <input type="time">. */
const toHHMM = (ts: string | null): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const draftOf = (row: Attendance | undefined, fallbackType: string): Draft => ({
  service_type: row?.service_type ?? fallbackType,
  status: (row?.status as Draft['status']) ?? '',
  day_fraction: row ? String(Number(row.day_fraction)) : '1',
  check_in: toHHMM(row?.check_in_at ?? null),
  check_out: toHHMM(row?.check_out_at ?? null),
});

export default function AttendancePanel({
  scope,
  onError,
  onNotice,
}: {
  scope: PatientsScope;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const managerId = scope.kind === 'manager' ? scope.managerId : null;

  const [date, setDate] = useState(today());
  const [assignments, setAssignments] = useState<CareAssignment[]>([]);
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [staff, setStaff] = useState<Record<string, Staff>>({});
  const [rates, setRates] = useState<AssignmentRate[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [rows, setRows] = useState<Record<string, Attendance>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [baseline, setBaseline] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    let assignmentQuery = supabase
      .from('care_assignments')
      .select('*')
      .neq('status', 'ended')
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`);
    if (managerId) assignmentQuery = assignmentQuery.eq('manager_id', managerId);

    const [asgRes, typeRes] = await Promise.all([
      assignmentQuery,
      supabase.from('service_types').select('*').eq('is_active', true).order('sort_order'),
    ]);

    if (asgRes.error || typeRes.error) {
      onError((asgRes.error ?? typeRes.error)!.message);
      setLoading(false);
      return;
    }

    const asgList = (asgRes.data as CareAssignment[]) ?? [];
    setServiceTypes((typeRes.data as ServiceType[]) ?? []);
    setAssignments(asgList);

    if (asgList.length === 0) {
      setRows({});
      setDrafts({});
      setBaseline({});
      setLoading(false);
      return;
    }

    const ids = asgList.map((a) => a.id);
    const [patRes, staffRes, rateRes, attRes] = await Promise.all([
      supabase.from('patients').select('*').in('id', [...new Set(asgList.map((a) => a.patient_id))]),
      supabase
        .from('location_staff')
        .select('*')
        .in('id', [...new Set(asgList.map((a) => a.staff_id).filter(Boolean))] as string[]),
      supabase.from('assignment_rates').select('*').in('assignment_id', ids),
      supabase.from('attendance').select('*').in('assignment_id', ids).eq('service_date', date),
    ]);

    const failure = patRes.error ?? staffRes.error ?? rateRes.error ?? attRes.error;
    if (failure) onError(failure.message);

    setPatients(Object.fromEntries(((patRes.data as Patient[]) ?? []).map((p) => [p.id, p])));
    setStaff(Object.fromEntries(((staffRes.data as Staff[]) ?? []).map((s) => [s.id, s])));

    const rateRows = (rateRes.data as AssignmentRate[]) ?? [];
    setRates(rateRows);

    const attRows = (attRes.data as Attendance[]) ?? [];
    const byAssignment = Object.fromEntries(attRows.map((r) => [r.assignment_id, r]));
    setRows(byAssignment);

    const fresh = Object.fromEntries(
      asgList.map((a) => {
        const firstType = rateRows.find((r) => r.assignment_id === a.id)?.service_type ?? '';
        return [a.id, draftOf(byAssignment[a.id], firstType)];
      })
    );
    setDrafts(fresh);
    setBaseline(fresh);
    setLoading(false);
  }, [date, managerId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const typesFor = (assignmentId: string) =>
    rates
      .filter((r) => r.assignment_id === assignmentId)
      .map((r) => ({
        slug: r.service_type,
        label: serviceTypes.find((t) => t.slug === r.service_type)?.label ?? r.service_type,
      }));

  const dirty = useMemo(
    () =>
      assignments.filter((a) => {
        const d = drafts[a.id];
        const b = baseline[a.id];
        if (!d || !b) return false;
        return (
          d.service_type !== b.service_type ||
          d.status !== b.status ||
          d.day_fraction !== b.day_fraction ||
          d.check_in !== b.check_in ||
          d.check_out !== b.check_out
        );
      }),
    [assignments, drafts, baseline]
  );

  const summary = useMemo(() => {
    const recorded = assignments.filter((a) => rows[a.id]).length;
    const present = assignments.filter((a) => rows[a.id]?.status === 'present').length;
    const approved = assignments.filter((a) => rows[a.id]?.verified_at).length;
    return { recorded, present, approved, total: assignments.length };
  }, [assignments, rows]);

  const saveDay = async () => {
    if (dirty.length === 0) return;
    setSaving(true);

    for (const a of dirty) {
      const d = drafts[a.id];

      if (d.status === '') {
        // Cleared back to "not recorded" — the day is removed entirely rather
        // than left as a zero, so it cannot be mistaken for an absence.
        if (rows[a.id]) {
          const { error } = await supabase.rpc('clear_attendance', {
            p_assignment_id: a.id,
            p_service_date: date,
          });
          if (error) {
            setSaving(false);
            onError(describe(error.message));
            return;
          }
        }
        continue;
      }

      if (!d.service_type) {
        setSaving(false);
        onError(
          `${patients[a.patient_id]?.full_name ?? 'This patient'} has no rate set, so a day cannot be recorded. Set the rates first.`
        );
        return;
      }

      const { error } = await supabase.rpc('mark_attendance', {
        p_assignment_id: a.id,
        p_service_date: date,
        p_service_type: d.service_type,
        p_status: d.status,
        p_day_fraction: Number(d.day_fraction),
        p_check_in_at: toInstant(date, d.check_in),
        p_check_out_at: toInstant(date, d.check_out),
      });

      if (error) {
        setSaving(false);
        onError(describe(error.message));
        return;
      }
    }

    setSaving(false);
    onNotice(`${dirty.length} ${dirty.length === 1 ? 'entry' : 'entries'} saved for ${date}.`);
    await load();
  };

  const approve = async (assignmentId: string, verified: boolean) => {
    const row = rows[assignmentId];
    if (!row) return;

    const { error } = await supabase.rpc('verify_attendance', {
      p_id: row.id,
      p_verified: verified,
    });
    if (error) {
      onError(describe(error.message));
      return;
    }
    await load();
  };

  const markAllPresent = () => {
    const next = { ...drafts };
    for (const a of assignments) {
      if (rows[a.id]) continue;
      const first = typesFor(a.id)[0]?.slug;
      if (!first) continue;
      next[a.id] = { ...next[a.id], status: 'present', service_type: next[a.id].service_type || first };
    }
    setDrafts(next);
  };

  const isFuture = date > today();

  return (
    <section className="content-section">
      <div className="section-header">
        <div>
          <h2>Day sheet</h2>
          <p className="muted">
            {summary.recorded} of {summary.total} recorded · {summary.present} served ·{' '}
            {summary.approved} approved
          </p>
        </div>
        <div className="actions">
          <button className="btn-secondary" type="button" onClick={() => setDate(shiftDate(date, -1))}>
            ← Previous
          </button>
          <input
            type="date"
            className="filter-input"
            value={date}
            onChange={(e) => setDate(e.target.value || today())}
          />
          <button className="btn-secondary" type="button" onClick={() => setDate(shiftDate(date, 1))}>
            Next →
          </button>
          <button className="btn-secondary" type="button" onClick={() => setDate(today())}>
            Today
          </button>
        </div>
      </div>

      {isFuture && (
        <div className="banner banner-warn">
          This date is in the future. Record a day after it has been served.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading the day…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Staff</th>
                  <th>Service</th>
                  <th>Day</th>
                  <th>Part</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const d = drafts[a.id];
                  const row = rows[a.id];
                  const types = typesFor(a.id);
                  if (!d) return null;

                  return (
                    <tr key={a.id} className={row ? '' : 'row-unrecorded'}>
                      <td>
                        {patients[a.patient_id]?.full_name ?? '—'}
                        <br />
                        <span className="muted">{patients[a.patient_id]?.area ?? ''}</span>
                      </td>
                      <td>{a.staff_id ? (staff[a.staff_id]?.full_name ?? '—') : 'Unassigned'}</td>
                      <td>
                        {types.length === 0 ? (
                          <span className="cell-warn">No rate set</span>
                        ) : (
                          <select
                            className="cell-select"
                            value={d.service_type}
                            onChange={(e) =>
                              setDrafts({ ...drafts, [a.id]: { ...d, service_type: e.target.value } })
                            }
                          >
                            {types.map((t) => (
                              <option key={t.slug} value={t.slug}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <select
                          className="cell-select"
                          value={d.status}
                          disabled={types.length === 0}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [a.id]: { ...d, status: e.target.value as Draft['status'] },
                            })
                          }
                        >
                          <option value="">Not recorded</option>
                          <option value="present">Served</option>
                          <option value="absent">Absent</option>
                          <option value="leave">Leave</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="cell-select"
                          value={d.day_fraction}
                          disabled={d.status !== 'present'}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [a.id]: { ...d, day_fraction: e.target.value } })
                          }
                        >
                          <option value="1">Full</option>
                          <option value="0.5">Half</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="time"
                          className="cell-time"
                          value={d.check_in}
                          disabled={d.status !== 'present'}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [a.id]: { ...d, check_in: e.target.value } })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          className="cell-time"
                          value={d.check_out}
                          disabled={d.status !== 'present'}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [a.id]: { ...d, check_out: e.target.value } })
                          }
                        />
                      </td>
                      <td>
                        {row ? (
                          <label className="approve">
                            <input
                              type="checkbox"
                              checked={Boolean(row.verified_at)}
                              onChange={(e) => void approve(a.id, e.target.checked)}
                            />
                            <span className="muted">
                              {row.verified_at ? clockTime(row.verified_at) : 'Pending'}
                            </span>
                          </label>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {assignments.length === 0 && (
              <div className="no-data">
                No engagement was running on {date}. Assign staff to a patient on the Patients &amp;
                rates tab first.
              </div>
            )}
          </div>

          {assignments.length > 0 && (
            <div className="day-actions">
              <button
                className="btn-primary"
                type="button"
                disabled={saving || dirty.length === 0}
                onClick={saveDay}
              >
                {saving
                  ? 'Saving…'
                  : dirty.length === 0
                    ? 'No changes'
                    : `Save ${dirty.length} ${dirty.length === 1 ? 'change' : 'changes'}`}
              </button>
              <button className="btn-secondary" type="button" onClick={markAllPresent}>
                Mark all served
              </button>
              {dirty.length > 0 && (
                <button className="btn-secondary" type="button" onClick={() => setDrafts(baseline)}>
                  Discard changes
                </button>
              )}
              <span className="muted">
                A day counts towards the bill only when it is marked Served. Approving records who
                confirmed it.
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Turns the database's own errors into something a manager can act on. */
function describe(message: string): string {
  if (message.includes('Could not find the function')) {
    return 'This screen needs docs/patch-phase2-attendance.sql to be run on the database.';
  }
  if (message.includes('No rate is set')) {
    return `${message}. Set the rates on the Patients & rates tab first.`;
  }
  return message;
}
