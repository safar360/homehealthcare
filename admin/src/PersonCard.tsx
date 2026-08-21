import type { ReactNode } from 'react';
import { prettyPhone, telHref } from './lib/types';

/**
 * One person — manager or staff — as a card rather than a table row.
 *
 * The number is the primary action, not a field: most of what an admin or
 * manager does with a person on this screen is ring them. It is a full-width
 * tap target so it works one-handed on a phone, and it degrades to a plain
 * "no number" state rather than a dead link when there is nothing to dial.
 */
export default function PersonCard({
  name,
  status,
  badge,
  meta,
  phone,
  email,
  facts,
  warn,
  actions,
}: {
  name: string;
  status?: { label: string; ok: boolean };
  badge?: ReactNode;
  meta?: ReactNode;
  phone: string | null | undefined;
  email?: string | null;
  facts?: { label: string; value: ReactNode }[];
  warn?: string | null;
  actions?: ReactNode;
}) {
  const href = telHref(phone);

  return (
    <article className="person-card">
      <div className="person-head">
        <div>
          <h3 className="person-name">{name}</h3>
          {badge}
        </div>
        {status && (
          <span className={`status ${status.ok ? 'active' : 'inactive'}`}>{status.label}</span>
        )}
      </div>

      {meta && <p className="person-meta">{meta}</p>}

      {warn && <p className="person-warn">{warn}</p>}

      {href ? (
        <a className="call-cta" href={href}>
          <PhoneIcon />
          <span className="call-number">{prettyPhone(phone)}</span>
          <span className="call-word">Call</span>
        </a>
      ) : (
        <div className="call-cta call-cta-off">
          <PhoneIcon />
          <span className="call-number">
            {phone ? `${phone} — not a full number` : 'No number on file'}
          </span>
        </div>
      )}

      {email && (
        <a className="person-email" href={`mailto:${email}`}>
          {email}
        </a>
      )}

      {facts && facts.length > 0 && (
        <dl className="person-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {actions && <div className="person-actions">{actions}</div>}
    </article>
  );
}

function PhoneIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
