import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  AVAILABILITY_STATUSES,
  humanise,
  type AvailabilityStatus,
  type Profile,
  type Staff,
} from './lib/types';

/**
 * A field staff member's own record. RLS lets them read and update the row whose
 * user_id is theirs and nothing else, so this deliberately stays a self-service
 * view. Assigned visits arrive when the visit/scheduling model is built.
 */
export default function StaffPortal({ profile }: { profile: Profile }) {
  const [record, setRecord] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('location_staff')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (loadError) setError(loadError.message);
    setRecord((data as Staff) ?? null);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateAvailability = async (status: AvailabilityStatus) => {
    if (!record) return;
    setSaving(true);

    const { error: saveError } = await supabase
      .from('location_staff')
      .update({ availability_status: status, updated_at: new Date().toISOString() })
      .eq('id', record.id);

    setSaving(false);

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
              disabled={saving || record.availability_status === status}
              className={record.availability_status === status ? 'btn-primary' : 'btn-secondary'}
              onClick={() => updateAvailability(status)}
            >
              {humanise(status)}
            </button>
          ))}
        </div>
      </section>

      <section className="content-section">
        <h2>Assigned visits</h2>
        <p className="muted">
          Visit assignment and check-in are not built yet — orders are still triaged by managers.
        </p>
      </section>
    </>
  );
}
