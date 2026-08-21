export type Role = 'patient' | 'staff' | 'manager' | 'admin';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  email: string | null;
  phone_number: string | null;
  city_slug: string | null;
};

export type City = {
  slug: string;
  name: string;
  support_phone?: string | null;
  whatsapp_number?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export type Manager = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  city_slug: string | null;
  managed_locations: string[];
  is_active: boolean;
};

/** Shape returned by the get_managers_with_staff_count() RPC. */
export type ManagerWithCount = Omit<Manager, 'user_id'> & { staff_count: number };

/** Roles are admin-managed rows now, not a fixed union. */
export type StaffRole = string;

export type StaffRoleRow = {
  slug: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export type AvailabilityStatus = 'available' | 'on_leave' | 'inactive' | 'training';

export type Staff = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  staff_role: StaffRole;
  city_slug: string | null;
  assigned_manager_id: string | null;
  assigned_location: string | null;
  qualifications: string[];
  experience_years: number;
  availability_status: AvailabilityStatus;
  is_active: boolean;
  created_at: string;
};

export type Transfer = {
  id: string;
  staff_id: string;
  from_manager_id: string | null;
  to_manager_id: string | null;
  from_city: string | null;
  to_city: string | null;
  reason: string | null;
  transferred_at: string;
};

/** One city's rollup, as returned by get_admin_dashboard_summary(). */
export type LocationRollup = {
  city: string;
  slug: string;
  managers: number;
  staff: number;
  available: number;
  areas: string[];
  orders: number;
};

export type DashboardSummary = {
  total_managers: number;
  total_staff: number;
  total_cities: number;
  total_roles: number;
  total_orders: number;
  unassigned_staff: number;
  cities_without_manager: string[];
  staff_by_role: Record<string, number>;
  staff_by_city: Record<string, number>;
  staff_by_availability: Record<string, number>;
  managers_by_city: Record<string, number>;
  by_location: LocationRollup[];
  orders_by_status: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Phase 2 — patients, care assignments, attendance and money
// ---------------------------------------------------------------------------

export type ServiceType = {
  slug: string;
  label: string;
  hours: number | null;
  is_active: boolean;
  sort_order: number;
};

export type PatientStatus = 'prospect' | 'active' | 'paused' | 'closed';

export type Patient = {
  id: string;
  full_name: string;
  phone_number: string | null;
  alt_phone: string | null;
  address: string | null;
  city_slug: string | null;
  area: string | null;
  assigned_manager_id: string | null;
  status: PatientStatus;
  started_on: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

/** monthly rates are per 30-day month; per_day rates are per day served. */
export type BillingMode = 'monthly' | 'per_day';

export type AssignmentStatus = 'active' | 'paused' | 'ended';

export type CareAssignment = {
  id: string;
  patient_id: string;
  staff_id: string | null;
  manager_id: string | null;
  billing_mode: BillingMode;
  start_date: string;
  end_date: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_at: string;
};

export type AssignmentRate = {
  id: string;
  assignment_id: string;
  service_type: string;
  patient_rate: number;
  staff_rate: number;
};

/** One assignment as the staff check-in screen sees it — rates deliberately absent. */
export type StaffDay = {
  assignment_id: string;
  patient_name: string;
  phone_number: string | null;
  address: string | null;
  area: string | null;
  service_types: { slug: string; label: string }[];
  today: {
    id: string;
    service_type: string;
    check_in_at: string | null;
    check_out_at: string | null;
    status: string;
  } | null;
};

/** A priced line on a bill or a payout: days of one type at one frozen rate. */
export type MoneyLine = {
  service_type: string;
  label: string;
  days: number;
  rate: number;
  billing_mode: BillingMode;
  amount: number;
};

/** Shape returned by build_staff_payout(). */
export type StaffPayout = {
  payout_id: string | null;
  staff_id: string;
  month: string;
  lines: MoneyLine[];
  days_served: number;
  total_payable: number;
  paid_amount: number;
  balance: number;
  status: 'pending' | 'part_paid' | 'paid';
};

export const PATIENT_STATUSES: PatientStatus[] = ['prospect', 'active', 'paused', 'closed'];
export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ['active', 'paused', 'ended'];

/** ₹14,200.00 — Indian digit grouping, always two decimals. */
export function inr(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Today as YYYY-MM-DD in local time — `toISOString()` would shift IST back a day. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The 1st of the month a date falls in — every bill and payout keys on this. */
export function monthStart(date: string = today()): string {
  return `${date.slice(0, 7)}-01`;
}

/** "2026-08-01" -> "August 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** "09:12" from a timestamptz, or an em dash when it never happened. */
export function clockTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export const AVAILABILITY_STATUSES: AvailabilityStatus[] = [
  'available',
  'on_leave',
  'inactive',
  'training',
];

/**
 * A dialable tel: target, or null when the number is too short to call.
 * A bare 10-digit number is assumed Indian, which is what every number in this
 * system is.
 */
export function telHref(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (cleaned.startsWith('+')) return `tel:${cleaned}`;
  if (digits.length === 10) return `tel:+91${digits}`;
  return `tel:+${digits}`;
}

/** "+919812345678" -> "+91 98123 45678". Left alone if it is not dialable. */
export function prettyPhone(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 10) return cleaned;
  const last10 = digits.slice(-10);
  const cc = digits.slice(0, -10) || '91';
  return `+${cc} ${last10.slice(0, 5)} ${last10.slice(5)}`;
}

export type PhoneCheck = {
  ok: boolean;
  /** Normalised as +91XXXXXXXXXX, ready to store. Null when blank or invalid. */
  e164: string | null;
  reason: string | null;
};

/**
 * Validates an Indian mobile number on entry.
 *
 * Ten digits beginning 6, 7, 8 or 9 — the mobile series in India. Landline STD
 * numbers are deliberately rejected: this number is what a manager signs in
 * with and what a colleague taps to call, so it has to be a mobile.
 *
 * Accepts what people actually type — +91, 91, a leading 0, spaces, dashes,
 * brackets — and normalises all of it to one stored form, so the same person
 * cannot end up in the system twice under two spellings of one number.
 */
export function checkIndianMobile(raw: string, options: { required?: boolean } = {}): PhoneCheck {
  const trimmed = (raw ?? '').trim();

  if (!trimmed) {
    return options.required
      ? { ok: false, e164: null, reason: 'A mobile number is needed.' }
      : { ok: true, e164: null, reason: null };
  }

  if (/[^\d\s+()-]/.test(trimmed)) {
    return { ok: false, e164: null, reason: 'Use digits only — no letters or symbols.' };
  }

  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length !== 10) {
    return {
      ok: false,
      e164: null,
      reason:
        digits.length < 10
          ? `An Indian mobile number has 10 digits — that is ${digits.length}.`
          : `An Indian mobile number has 10 digits — that is ${digits.length}.`,
    };
  }

  if (!/^[6-9]/.test(digits)) {
    return {
      ok: false,
      e164: null,
      reason: `An Indian mobile number starts with 6, 7, 8 or 9 — that one starts with ${digits[0]}.`,
    };
  }

  return { ok: true, e164: `+91${digits}`, reason: null };
}

/** "care_coordinator" -> "Care coordinator" */
export function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Splits the comma-separated text inputs used for arrays, dropping blanks. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** "Care coordinator" -> "care_coordinator", for new role and city slugs. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
