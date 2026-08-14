# Staff Management System - Setup & Usage Guide

## Overview

This system provides a complete staff management hierarchy with:
- **Admin Portal**: Full system access to manage all managers and staff across locations
- **Manager Portal**: Managers can manage their assigned staff
- **Backend**: Supabase database with RLS policies for role-based access

## Database Schema

### Key Tables

1. **admins** - System administrators with full access
2. **location_managers** - Managers assigned to specific cities/locations
3. **location_staff** - Staff members assigned to managers and locations
4. **staff_transfer_history** - Audit trail of staff movements
5. **staff_performance** - Performance reviews and ratings

### Staff Roles
- nurse
- assistant
- therapist
- care_coordinator
- supervisor

### Availability Status
- available
- on_leave
- inactive
- training

## Backend Setup

### 1. Create Database Schema

Run this SQL in Supabase SQL Editor:

```bash
# Copy the entire contents of supabase-staff-schema.sql and execute in Supabase
```

This creates:
- Tables for admins, managers, staff
- Row Level Security (RLS) policies
- Helper RPC functions for admin operations
- Audit trail tables

### 2. RPC Functions Created

#### `get_admin_dashboard_summary()`
Returns overview stats:
- Total managers, staff, cities
- Staff breakdown by role and city
- Managers breakdown by city

Usage:
```typescript
const { data } = await supabase.rpc('get_admin_dashboard_summary');
```

#### `get_managers_with_staff_count()`
Returns all managers with their staff count

Usage:
```typescript
const { data } = await supabase.rpc('get_managers_with_staff_count');
```

#### `transfer_staff(p_staff_id, p_new_manager_id, p_reason)`
Transfer staff to a different manager

Usage:
```typescript
const { data } = await supabase.rpc('transfer_staff', {
  p_staff_id: staffId,
  p_new_manager_id: managerId,
  p_reason: 'Relocation'
});
```

#### `transfer_staff_to_city(p_staff_id, p_new_city_slug, p_new_manager_id, p_reason)`
Transfer staff to a different city

Usage:
```typescript
const { data } = await supabase.rpc('transfer_staff_to_city', {
  p_staff_id: staffId,
  p_new_city_slug: 'mumbai',
  p_new_manager_id: managerId,
  p_reason: 'New location'
});
```

#### `get_city_staff(p_city_slug, p_role, p_status)`
Get filtered staff for a city

Usage:
```typescript
const { data } = await supabase.rpc('get_city_staff', {
  p_city_slug: 'mumbai',
  p_role: 'nurse',
  p_status: 'available'
});
```

## Admin Portal Features

### Access Control
- Only users in the `admins` table can access
- Full visibility of all managers and staff

### Dashboard Tab
Shows overview:
- Total counts (managers, staff, cities)
- Staff distribution by role (pie/breakdown)
- Staff distribution by city
- Manager distribution by city

### Managers Tab
- View all location managers
- Add new managers
- Edit manager details
- Delete/deactivate managers
- See staff count per manager

### Staff Tab
- View all staff members
- Add new staff
- Edit staff details
- Delete/deactivate staff
- **Filters:**
  - By city (dropdown)
  - By role (nurse, assistant, etc.)
  - By availability status (available, on_leave, etc.)
  - Search by name or email
- **Bulk operations** (coming soon):
  - Transfer staff between managers
  - Move staff to different cities
  - Update availability status

### Transfers Tab
- View transfer history (coming soon)
- Approve/process transfers
- Audit trail of all movements

## Manager Portal (Coming Soon)

### Features
- View only their assigned staff
- Add staff to their team
- Edit staff details
- View staff availability
- Track staff qualifications
- Request staff transfers (to admin)
- Performance notes

### Access Control
- Restricted to managers via RLS policy
- Can only see/edit their own staff

## Running the Portals

### Admin Portal

```bash
cd admin
npm install
npm run dev
# Access at http://localhost:5173
```

**Requires:**
- VITE_SUPABASE_URL environment variable
- VITE_SUPABASE_ANON_KEY environment variable

### Manager Portal (Setup)

Create a new React app in `manager/` directory:

```bash
npm create vite@latest manager -- --template react-ts
cd manager
npm install
npm install @supabase/supabase-js
```

Copy the manager portal component code (see below).

## Data Structure Examples

### Creating a Manager

```typescript
const newManager = {
  full_name: "Rajesh Kumar",
  email: "rajesh@paricare.com",
  phone_number: "+91-9876543210",
  city_slug: "mumbai",
  managed_locations: ["North Center", "Central Hub"],
  is_active: true
};

await supabase.from('location_managers').insert([newManager]);
```

### Creating Staff

```typescript
const newStaff = {
  full_name: "Priya Singh",
  email: "priya@paricare.com",
  phone_number: "+91-9123456789",
  staff_role: "nurse",
  city_slug: "mumbai",
  assigned_manager_id: managerId,
  assigned_location: "North Center",
  qualifications: ["BSN", "RN License", "First Aid"],
  availability_status: "available",
  is_active: true
};

await supabase.from('location_staff').insert([newStaff]);
```

## Security Model

### Row Level Security Policies

**Admins:**
- Full access to all tables

**Managers:**
- Can view only their assigned staff
- Can update their assigned staff
- Can view other managers (read-only)

**Staff:**
- Can view/edit only their own profile
- No access to other staff

**Public Content:**
- `location_managers` and `location_staff` visible to authenticated admins only
- Transfer history visible only to admins

## Workflow: Adding Staff to a Location

1. **Admin** logs into Admin Portal
2. **Admin** navigates to Staff tab
3. **Admin** clicks "Add Staff"
4. **Admin** fills in:
   - Name, email, phone
   - Select city
   - Select staff role (nurse, assistant, etc.)
   - Select manager from dropdown (to be enhanced)
   - Assigned location (e.g., "North Center")
   - Qualifications (comma-separated)
   - Availability status
5. **Admin** clicks Save
6. Staff record created in database with manager assigned
7. **Manager** can see new staff in Manager Portal
8. **Staff** can see their profile in Staff Portal (phase 3)

## Workflow: Transfer Staff Between Managers

1. **Admin** navigates to Staff tab
2. **Admin** finds staff member
3. **Admin** clicks Edit
4. **Admin** changes manager assignment
5. **Admin** saves changes
6. Transfer logged in `staff_transfer_history` table
7. New manager sees staff in their list

## Workflow: Transfer Staff to Different City

1. **Admin** navigates to Staff tab
2. **Admin** finds staff member
3. **Admin** clicks Edit
4. **Admin** changes city dropdown
5. **Admin** optionally selects new manager in target city
6. **Admin** saves changes
7. Transfer logged in `staff_transfer_history` table
8. Staff removed from old manager's list
9. Staff appears in new manager's list and city

## Environment Variables

Create `.env.local` in admin/ directory:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Testing the System

### 1. Create Test Data

```sql
-- Insert test city
INSERT INTO public.cities (slug, name, is_active) 
VALUES ('mumbai', 'Mumbai', true);

-- Create test manager
INSERT INTO public.location_managers (
  full_name, email, phone_number, city_slug, managed_locations, is_active
) VALUES (
  'Test Manager', 'manager@test.com', '9876543210', 'mumbai', 
  '{"North", "South"}', true
);

-- Get manager ID
SELECT id FROM public.location_managers WHERE email = 'manager@test.com';

-- Create test staff (replace manager_id with actual ID)
INSERT INTO public.location_staff (
  full_name, email, phone_number, staff_role, city_slug, 
  assigned_manager_id, assigned_location, qualifications, 
  availability_status, is_active
) VALUES (
  'Test Staff', 'staff@test.com', '9123456789', 'nurse', 'mumbai',
  'actual-manager-uuid-here', 'North Center',
  '{"BSN", "RN License"}', 'available', true
);
```

### 2. Access Admin Portal

1. Set up Supabase environment variables
2. Run `npm run dev` in admin/ directory
3. Check dashboard shows test data
4. Create, edit, delete managers and staff
5. Verify filters work correctly

### 3. Verify Transfer History

Check `staff_transfer_history` table to see audit trail of all transfers.

## Roadmap

### Phase 1 (Current)
- [x] Database schema with RLS
- [x] Admin portal with dashboard
- [x] CRUD operations for managers and staff
- [x] Filters and search
- [x] Transfer logging

### Phase 2
- [ ] Manager Portal UI (view own staff, request transfers)
- [ ] Staff Portal (view own profile)
- [ ] Attendance tracking
- [ ] Performance ratings integration
- [ ] Email notifications for transfers
- [ ] Bulk staff import/export

### Phase 3
- [ ] Advanced analytics and reporting
- [ ] Scheduling system for staff shifts
- [ ] Availability calendar
- [ ] Skill-based assignments
- [ ] Staff rating system
- [ ] Integration with visit tracking

## Troubleshooting

### Can't see data in Admin Portal

1. Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. Verify SQL schema was executed in Supabase
3. Ensure you're logged in with an admin user
4. Check RLS policies are enabled on tables

### Can't add staff to manager

1. Verify manager exists and is active
2. Check city_slug matches existing city
3. Look at browser console for API errors
4. Verify RLS policy allows insert

### Transfer not showing in history

1. Check `staff_transfer_history` table directly in Supabase
2. Verify RLS policy on transfer history table
3. Check if transfer actually executed (no error)

## Contact & Support

For issues or questions about the staff management system, refer to:
- Database schema: `supabase-staff-schema.sql`
- Admin portal source: `admin/src/App.tsx`
- This documentation: `STAFF_MANAGEMENT.md`
