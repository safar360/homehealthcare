import { checkIndianMobile, prettyPhone } from './lib/types';

/**
 * A mobile number input that says what is wrong while it is being typed,
 * rather than after Save.
 *
 * It stays quiet until there is enough typed to judge — complaining "10 digits"
 * at the second keystroke trains people to ignore the message.
 */
export default function PhoneField({
  label,
  value,
  onChange,
  required,
  hint,
  id,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  hint?: string;
  id?: string;
}) {
  const digits = value.replace(/\D/g, '');
  const check = checkIndianMobile(value, { required });

  // Judge only once it is long enough to be a real attempt, or the moment it is
  // clearly too long.
  const judge = digits.length >= 10 || (digits.length > 0 && digits.length > 10);
  const showError = judge && !check.ok;
  const showOk = check.ok && Boolean(check.e164);

  return (
    <div className="form-group">
      <label htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      <div className={`phone-input ${showError ? 'phone-bad' : ''} ${showOk ? 'phone-good' : ''}`}>
        <span className="phone-cc">+91</span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98123 45678"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      {showError && <p className="phone-msg phone-msg-bad">{check.reason}</p>}
      {showOk && <p className="phone-msg phone-msg-good">Saved as {prettyPhone(check.e164)}</p>}
      {!showError && !showOk && hint && <p className="phone-msg muted">{hint}</p>}
    </div>
  );
}
