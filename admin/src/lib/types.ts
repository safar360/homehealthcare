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

export type StaffRole = 'nurse' | 'assistant' | 'therapist' | 'care_coordinator' | 'supervisor';

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

export type DashboardSummary = {
  total_managers: number;
  total_staff: number;
  total_cities: number;
  staff_by_role: Record<string, number>;
  staff_by_city: Record<string, number>;
  managers_by_city: Record<string, number>;
  orders_by_status: Record<string, number>;
};

export const STAFF_ROLES: StaffRole[] = [
  'nurse',
  'assistant',
  'therapist',
  'care_coordinator',
  'supervisor',
];

export const AVAILABILITY_STATUSES: AvailabilityStatus[] = [
  'available',
  'on_leave',
  'inactive',
  'training',
];

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
