import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

/**
 * Identity and qualification documents for one staff member.
 *
 * The link is attached by whoever onboards them; the tick is an admin's word.
 * That split is enforced in the database — a manager PATCHing is_verified is
 * refused — so this screen only has to reflect it, not police it.
 *
 * Nothing here holds an Aadhaar or PAN number. Only the type, where the scan
 * lives, and whether someone checked it.
 */

type DocumentType = { slug: string; label: string; sort_order: number };

export type StaffDocument = {
  id: string;
  staff_id: string;
  doc_type: string;
  drive_url: string;
  label: string | null;
  is_verified: boolean;
  verified_at: string | null;
  note: string | null;
};

/** Accepts any https link but says when it does not look like Drive. */
function checkLink(raw: string): { ok: boolean; reason: string | null; warn: string | null } {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'Paste the link to the uploaded document.', warn: null };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'That is not a complete link — it should start with https://', warn: null };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'The link must start with https://', warn: null };
  }

  const drive = /(^|\.)(drive|docs)\.google\.com$/.test(url.hostname);
  return {
    ok: true,
    reason: null,
    warn: drive ? null : 'That is not a Google Drive link. Save it only if you meant to.',
  };
}

export default function DocumentsModal({
  staffId,
  staffName,
  isAdmin,
  onClose,
  onError,
  onNotice,
  onChanged,
}: {
  staffId: string;
  staffName: string;
  isAdmin: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onChanged?: () => void;
}) {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [docType, setDocType] = useState('');
  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [typeRes, docRes] = await Promise.all([
      supabase.from('document_types').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('staff_documents').select('*').eq('staff_id', staffId),
    ]);

    if (typeRes.error) {
      onError(
        /does not exist|schema cache/i.test(typeRes.error.message)
          ? 'Document tracking needs docs/patch-phase3-docs-photos.sql to be run on the database.'
          : typeRes.error.message
      );
      setLoading(false);
      return;
    }
    if (docRes.error) onError(docRes.error.message);

    const list = (typeRes.data as DocumentType[]) ?? [];
    setTypes(list);
    setDocs((docRes.data as StaffDocument[]) ?? []);
    setDocType((current) => current || list[0]?.slug || '');
    setLoading(false);
  }, [staffId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const check = checkLink(link);
  const existing = docs.find((d) => d.doc_type === docType);

  const save = async () => {
    if (!check.ok) {
      onError(check.reason ?? 'Check the link.');
      return;
    }
    if (docType === 'other' && !label.trim()) {
      onError('Say what the document is when the type is "Other".');
      return;
    }

    setBusy('save');
    const { error } = await supabase.from('staff_documents').upsert(
      [
        {
          staff_id: staffId,
          doc_type: docType,
          drive_url: link.trim(),
          label: label.trim() || null,
        },
      ],
      { onConflict: 'staff_id,doc_type' }
    );
    setBusy(null);

    if (error) {
      onError(error.message);
      return;
    }
    setLink('');
    setLabel('');
    onNotice(
      existing?.is_verified
        ? 'Link replaced. It needs verifying again.'
        : 'Document link saved.'
    );
    await load();
    onChanged?.();
  };

  const setVerified = async (doc: StaffDocument, verified: boolean) => {
    setBusy(doc.id);
    const { error } = await supabase.rpc('verify_document', {
      p_id: doc.id,
      p_verified: verified,
    });
    setBusy(null);

    if (error) {
      onError(error.message);
      return;
    }
    await load();
    onChanged?.();
  };

  const drop = async (doc: StaffDocument) => {
    const typeLabel = types.find((t) => t.slug === doc.doc_type)?.label ?? doc.doc_type;
    if (!window.confirm(`Remove the ${typeLabel} link for ${staffName}?`)) return;

    setBusy(doc.id);
    const { error } = await supabase.from('staff_documents').delete().eq('id', doc.id);
    setBusy(null);

    if (error) {
      onError(error.message);
      return;
    }
    await load();
    onChanged?.();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <h2>Documents — {staffName}</h2>
        <p className="muted">
          {isAdmin
            ? 'Attach the link to each uploaded document, then tick it once you have opened and checked it.'
            : 'Attach the link to each uploaded document. An admin does the verifying.'}
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Link</th>
                    <th>Verified</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => {
                    const typeLabel = types.find((t) => t.slug === d.doc_type)?.label ?? d.doc_type;
                    return (
                      <tr key={d.id}>
                        <td>
                          {typeLabel}
                          {d.label && <><br /><span className="muted">{d.label}</span></>}
                        </td>
                        <td>
                          <a href={d.drive_url} target="_blank" rel="noopener noreferrer">
                            Open
                          </a>
                        </td>
                        <td>
                          {isAdmin ? (
                            <label className="approve">
                              <input
                                type="checkbox"
                                checked={d.is_verified}
                                disabled={busy === d.id}
                                onChange={(e) => void setVerified(d, e.target.checked)}
                              />
                              <span className="muted">
                                {d.is_verified ? 'Checked' : 'Not checked'}
                              </span>
                            </label>
                          ) : (
                            <span className={`status ${d.is_verified ? 'active' : 'inactive'}`}>
                              {d.is_verified ? 'Verified' : 'Pending'}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn-danger-small"
                            type="button"
                            disabled={busy === d.id}
                            onClick={() => void drop(d)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {docs.length === 0 && <div className="no-data">No documents attached yet.</div>}
            </div>

            <h3 style={{ marginTop: 24 }}>
              {existing ? 'Replace a link' : 'Attach a document'}
            </h3>

            <div className="form-group">
              <label htmlFor="doc-type">Document</label>
              <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {docType === 'other' && (
              <div className="form-group">
                <label htmlFor="doc-label">What is it? <span className="req">*</span></label>
                <input
                  id="doc-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Nursing council registration"
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="doc-link">Google Drive link <span className="req">*</span></label>
              <input
                id="doc-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/…"
              />
              {link.trim() && !check.ok && <p className="phone-msg phone-msg-bad">{check.reason}</p>}
              {check.warn && <p className="phone-msg" style={{ color: 'var(--warning)' }}>{check.warn}</p>}
              {existing?.is_verified && (
                <p className="phone-msg" style={{ color: 'var(--warning)' }}>
                  This document is already verified. Replacing the link clears that tick.
                </p>
              )}
            </div>

            <div className="banner banner-warn">
              Set the Drive file to <b>restricted</b> sharing, not “anyone with the link”. These
              are identity documents — a link that leaks is the document itself leaking.
            </div>
          </>
        )}

        <div className="modal-actions">
          <button
            className="btn-primary"
            type="button"
            disabled={busy === 'save' || loading}
            onClick={save}
          >
            {busy === 'save' ? 'Saving…' : 'Save link'}
          </button>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
