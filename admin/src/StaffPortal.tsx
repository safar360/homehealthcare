import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  AVAILABILITY_STATUSES,
  clockTime,
  humanise,
  inr,
  monthLabel,
  monthStart,
  today,
  type AvailabilityStatus,
  type Profile,
  type Staff,
  type StaffDay,
  type StaffPayout,
} from './lib/types';

type Tab = 'today' | 'month' | 'profile';

/**
 * A field staff member's own screen: today's patients with check-in/out, their
 * days served and earnings this month, and their own record.
 *
 * Everything here is scoped to them by RLS. They never see a patient's rate —
 * only what they themselves earn.
 */
export default function StaffPortal({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('today');
  const [record, setRecord] = useState<Staff | null>(null);
  const [day, setDay] = useState<StaffDay[]>([]);
  const [payout, setPayout] = useState<StaffPayout | null>(null);
  const [month, setMonth] = useState(monthStart());
  const [chosenType, setChosenType] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDay = useCallback(async () => {
    const { data, error: dayError } = await supabase.rpc('my_day', { p_date: today() });

    if (dayError) {
      // The screen is useless without this RPC, so say exactly what is missing
      // rather than showing an empty day as though there were no patients.
      setError(
        dayError.code === 'PGRST202'
          ? 'Today’s visits need docs/patch-phase2-ui.sql to be run on the database.'
          : dayError.message
      );
      setDay([]);
      return;
    }
    setDay((data as StaffDay[]) ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('location_staff')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (loadError) setError(loadError.message);
    setRecord((data as Staff) ?? null);

    if (data) await loadDay();
    setLoading(false);
  }, [profile.id, loadDay]);

  useEffect(() => {
    void load();
  }, [load]);

  // Earnings are computed from the same attendance rows the bill uses, priced
  // with the staff rate instead of the patient rate.
  useEffect(() => {
    if (!record) return;
    void (async () => {
      const { data, error: payError } = await supabase.rpc('build_staff_payout', {
        p_staff_id: record.id,
        p_month: month,
      });
      if (payError) {
        setError(payError.message);
        return;
      }
      setPayout(data as StaffPayout);
    })();
  }, [record, month]);

  const checkIn = async (visit: StaffDay) => {
    const type = chosenType[visit.assignment_id] ?? visit.service_types[0]?.slug;
    if (!type) {
      setError(
        `No rate is set for ${visit.patient_name} yet. Ask your manager to set it before checking in.`
      );
      return;
    }

    setBusy(visit.assignment_id);
    const { error: rpcError } = await supabase.rpc('check_in', {
      p_assignment_id: visit.assignment_id,
      p_service_type: type,
      p_service_date: today(),
    });
    setBusy(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`Checked in at ${visit.patient_name}.`);
    await loadDay();
  };

  const checkOut = async (visit: StaffDay) => {
    setBusy(visit.assignment_id);
    const { error: rpcError } = await supabase.rpc('check_out', {
      p_assignment_id: visit.assignment_id,
      p_service_date: today(),
    });
    setBusy(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`Checked out from ${visit.patient_name}.`);
    await loadDay();
  };

  const updateAvailability = async (status: AvailabilityStatus) => {
    if (!record) return;
    setBusy('availability');

    const { error: saveError } = await supabase
      .from('location_staff')
      .update({ availability_status: status, updated_at: new Date().toISOString() })
      .eq('id', record.id);

    setBusy(null);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setNotice(`Availability set to "${humanise(status)}".`);
    await load();
  };

  if (loading) return <p className="muted">Loading…</p>;

  if (!record) {
    return (
      <div className="content-section">
        <h2>No staff record</h2>
        <p className="muted">
          Your profile has the staff role, but no row in <code>location_staff</code> is linked to it.
          Ask your manager to add you to their team and link the record to your account.
        </p>
      </div>
    );
  }

  return (
    <>
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

      <nav className="tabs">
        {(['today', 'month', 'profile'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'today' && `Today (${day.length})`}
            {key === 'month' && 'My earnings'}
            {key === 'profile' && 'My details'}
          </button>
        ))}
      </nav>

      {tab === 'today' && (
        <section className="content-section">
          <div className="section-header">
            <div>
              <h2>Today</h2>
              <p className="muted">
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>
            <button className="btn-secondary" type="button" onClick={() => void loadDay()}>
              Refresh
            </button>
          </div>

          {day.length === 0 && (
            <div className="no-data">
              No patients assigned to you today. Your manager assigns them from their portal.
            </div>
          )}

          {day.map((visit) => {
            const att = visit.today;
            const done = Boolean(att?.check_out_at);
            const inProgress = Boolean(att?.check_in_at) && !done;
            const selectedType = chosenType[visit.assignment_id] ?? visit.service_types[0]?.slug;

            return (
              <div key={visit.assignment_id} className="visit-card">
                <div className="visit-head">
                  <div>
                    <h3>{visit.patient_name}</h3>
                    <p className="muted">
                      {visit.address ?? 'No address on file'}
                      {visit.area ? ` · ${visit.area}` : ''}
                    </p>
                    {visit.phone_number && (
                      <a className="visit-phone" href={`tel:${visit.phone_number}`}>
                        {visit.phone_number}
                      </a>
                    )}
                  </div>
                  {att && (
                    <span className={`status ${done ? 'inactive' : 'active'}`}>
                      {done ? 'Done' : 'On duty'}
                    </span>
                  )}
                </div>

                {visit.service_types.length === 0 && (
                  <div className="banner banner-warn">
                    No rate is set for this patient yet, so check-in is not possible. Ask your
                    manager.
                  </div>
                )}

                {!att && visit.service_types.length > 1 && (
                  <div className="type-choice">
                    {visit.service_types.map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        className={`chip ${selectedType === t.slug ? 'chip-on' : ''}`}
                        onClick={() =>
                          setChosenType({ ...chosenType, [visit.assignment_id]: t.slug })
                        }
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                {att ? (
                  <div className="visit-times">
                    <span>
                      In <strong>{clockTime(att.check_in_at)}</strong>
                    </span>
                    <span>
                      Out <strong>{clockTime(att.check_out_at)}</strong>
                    </span>
                    <span className="muted">
                      {visit.service_types.find((t) => t.slug === att.service_type)?.label ??
                        humanise(att.service_type)}
                    </span>
                  </div>
                ) : null}

                {done ? (
                  <p className="muted">Recorded for today. Your manager can correct it if needed.</p>
                ) : (
                  <button
                    type="button"
                    className={inProgress ? 'btn-checkout' : 'btn-checkin'}
                    disabled={busy === visit.assignment_id || visit.service_types.length === 0}
                    onClick={() => (inProgress ? void checkOut(visit) : void checkIn(visit))}
                  >
                    {busy === visit.assignment_id
                      ? 'Saving…'
                      : inProgress
                        ? 'Check out'
                        : 'Check in'}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === 'month' && (
        <section className="content-section">
          <div className="section-header">
            <h2>{monthLabel(month)}</h2>
            <input
              type="month"
              className="filter-input"
              value={month.slice(0, 7)}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
            />
          </div>

          <div className="dashboard-grid">
            <div className="stat-card">
              <h3>Days served</h3>
              <p className="stat-number">{Number(payout?.days_served ?? 0)}</p>
            </div>
            <div className="stat-card">
              <h3>Earned</h3>
              <p className="stat-number stat-good">{inr(payout?.total_payable)}</p>
            </div>
            <div className="stat-card">
              <h3>Paid</h3>
              <p className="stat-number">{inr(payout?.paid_amount)}</p>
            </div>
            <div className="stat-card">
              <h3>Outstanding</h3>
              <p className="stat-number stat-warn">{inr(payout?.balance)}</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Days</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(payout?.lines ?? []).map((line) => (
                  <tr key={`${line.service_type}-${line.rate}`}>
                    <td>{line.label}</td>
                    <td>{Number(line.days)}</td>
                    <td>
                      {inr(line.rate)}
                      <span className="muted">
                        {line.billing_mode === 'monthly' ? '/month' : '/day'}
                      </span>
                    </td>
                    <td>{inr(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(payout?.lines ?? []).length === 0 && (
              <div className="no-data">No days recorded this month.</div>
            )}
          </div>

          <p className="muted">
            A monthly rate is paid as rate × days served ÷ 30. Payment is recorded by your manager.
          </p>
        </section>
      )}

      {tab === 'profile' && (
        <>
          <section className="content-section">
            <h2>{record.full_name}</h2>
            <dl className="detail-list">
              <div>
                <dt>Role</dt>
                <dd>
                  <span className="badge badge-role">{humanise(record.staff_role)}</span>
                </dd>
              </div>
              <div>
                <dt>City</dt>
                <dd>{record.city_slug ?? '—'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{record.assigned_location ?? '—'}</dd>
              </div>
              <div>
                <dt>Experience</dt>
                <dd>{record.experience_years} year(s)</dd>
              </div>
              <div>
                <dt>Qualifications</dt>
                <dd>
                  <div className="qualifications">
                    {record.qualifications.map((q) => (
                      <span key={q} className="qual-tag">
                        {q}
                      </span>
                    ))}
                    {record.qualifications.length === 0 && '—'}
                  </div>
                </dd>
              </div>
            </dl>
          </section>

          <section className="content-section">
            <h2>My availability</h2>
            <p className="muted">Your manager sees this when planning assignments.</p>
            <div className="filters">
              {AVAILABILITY_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy === 'availability' || record.availability_status === status}
                  className={record.availability_status === status ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => updateAvailability(status)}
                >
                  {humanise(status)}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
