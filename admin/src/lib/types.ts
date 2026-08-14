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

/** "Care coordinator" -> "care_coordinator", for new role and city slugs. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
