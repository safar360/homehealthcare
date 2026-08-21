import { useEffect, useRef, useState } from 'react';
import { initials, removeAvatar, uploadAvatar, type PhotoOwner } from './lib/photo';

/**
 * Photograph for one person.
 *
 * Two separate inputs rather than one: `capture` opens the camera directly on a
 * phone but hides the gallery, so a single control would force a manager
 * standing in an office to take a fresh photo of a printout. "Take photo" uses
 * the camera; "Choose file" uses the gallery or the computer.
 *
 * The record must exist before a photo can be attached, because the file is
 * stored under its id — so this is disabled while a person is being created.
 */
export default function PhotoPicker({
  owner,
  id,
  name,
  path,
  signedUrl,
  onChange,
  onError,
}: {
  owner: PhotoOwner;
  id: string | null;
  name: string;
  path: string | null;
  signedUrl?: string | null;
  onChange: (nextPath: string | null) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // A local preview shows the new face immediately; the signed URL for the
  // uploaded file arrives on the next load.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const take = async (file: File | undefined) => {
    if (!file || !id) return;
    setBusy(true);
    onError('');

    const { path: nextPath, error } = await uploadAvatar(owner, id, file);
    if (error) {
      setBusy(false);
      onError(error);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    await onChange(nextPath);
    setBusy(false);
  };

  const clear = async () => {
    if (!path) return;
    if (!window.confirm(`Remove ${name}'s photo?`)) return;
    setBusy(true);
    const error = await removeAvatar(path);
    if (error) {
      setBusy(false);
      onError(error);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    await onChange(null);
    setBusy(false);
  };

  const shown = preview ?? signedUrl ?? null;

  return (
    <div className="photo-picker">
      <div className="avatar avatar-lg">
        {shown ? (
          <img src={shown} alt={`${name}'s photograph`} />
        ) : (
          <span className="avatar-initials">{initials(name)}</span>
        )}
      </div>

      <div className="photo-controls">
        {id ? (
          <>
            <div className="photo-buttons">
              <button
                className="btn-small"
                type="button"
                disabled={busy}
                onClick={() => cameraRef.current?.click()}
              >
                {busy ? 'Saving…' : 'Take photo'}
              </button>
              <button
                className="btn-secondary btn-tiny"
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </button>
              {(path || preview) && (
                <button
                  className="btn-danger-small"
                  type="button"
                  disabled={busy}
                  onClick={clear}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="photo-note">
              Resized to 320px and saved at about 20&nbsp;KB, so a few hundred photos cost
              almost nothing to store.
            </p>
          </>
        ) : (
          <p className="photo-note">Save this record first, then a photo can be added.</p>
        )}
      </div>

      {/* capture opens the camera on a phone; the second input deliberately
          omits it so the gallery and the file system stay reachable. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
