# Staff Management System - Quick Implementation Guide

## What You Have

### Backend
- **Database Schema**: `supabase-staff-schema.sql` 
  - 5 new tables: admins, location_managers, location_staff, staff_transfer_history, staff_performance
  - RLS policies for role-based access
  - 4 RPC functions for admin operations

### Frontend
- **Admin Portal**: Already integrated in `admin/src/App.tsx`
  - Dashboard with statistics
  - Manager management (CRUD)
  - Staff management (CRUD) with filters
  - Professional UI with modal forms
  
- **Manager Portal Component**: `MANAGER_PORTAL_COMPONENT.tsx`
  - Ready-to-use React component
  - Show own team's staff
  - Add/edit/delete staff
  - Overview dashboard

## Implementation Steps

### Step 1: Set Up Database (5 minutes)

1. Open your Supabase project SQL Editor
2. Copy entire contents of `supabase-staff-schema.sql`
3. Paste and execute in SQL Editor
4. Verify all tables were created:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
   ```

### Step 2: Configure Admin Portal (Already Done!)

The admin portal is already updated in `admin/src/App.tsx` with:
- Dashboard showing all statistics
- Manager CRUD operations  
- Staff CRUD with filters (city, role, status, search)
- Transfer tracking

**To use it:**
```bash
cd admin
npm install
npm run dev
# Visit http://localhost:5173
```

### Step 3: Add Manager Portal (Optional)

Create a new React app for managers:

```bash
# Create new manager app
npm create vite@latest manager -- --template react-ts
cd manager
npm install @supabase/supabase-js

# Copy component into src/App.tsx
# Copy styles from admin/src/styles.css into src/styles.css
```

Then copy the code from `MANAGER_PORTAL_COMPONENT.tsx` into `manager/src/App.tsx`.

Create `.env.local` in manager/:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run:
```bash
npm run dev
# Visit http://localhost:5174
```

### Step 4: Seed Test Data (Optional)

Run this SQL to create test data:

```sql
-- Create test cities
INSERT INTO public.cities (slug, name, is_active) VALUES 
  ('mumbai', 'Mumbai', true),
  ('delhi', 'Delhi', true),
  ('bangalore', 'Bangalore', true);

-- Create test managers
INSERT INTO public.location_managers (
  full_name, email, phone_number, city_slug, managed_locations, is_active
) VALUES 
  ('Rajesh Kumar', 'rajesh@paricare.com', '+91-9876543210', 'mumbai', '{"North Center", "South Center"}', true),
  ('Priya Sharma', 'priya@paricare.com', '+91-9123456789', 'delhi', '{"Central Hub"}', true),
  ('Amit Patel', 'amit@paricare.com', '+91-8765432109', 'bangalore', '{"Tech Park"}', true);

-- Create test staff
INSERT INTO public.location_staff (
  full_name, email, phone_number, staff_role, city_slug, 
  assigned_manager_id, assigned_location, qualifications, 
  availability_status, is_active
) VALUES 
  ('Nurse John', 'john@paricare.com', '+91-9111111111', 'nurse', 'mumbai',
   (SELECT id FROM public.location_managers WHERE email = 'rajesh@paricare.com'), 
   'North Center', '{"BSN", "RN License", "First Aid"}', 'available', true),
  
  ('Assistant Maria', 'maria@paricare.com', '+91-9222222222', 'assistant', 'mumbai',
   (SELECT id FROM public.location_managers WHERE email = 'rajesh@paricare.com'),
   'South Center', '{"CNA Certificate"}', 'available', true),
  
  ('Therapist Rahul', 'rahul@paricare.com', '+91-9333333333', 'therapist', 'delhi',
   (SELECT id FROM public.location_managers WHERE email = 'priya@paricare.com'),
   'Central Hub', '{"PT License", "CPR"}', 'available', true),
  
  ('Supervisor Lisa', 'lisa@paricare.com', '+91-9444444444', 'supervisor', 'bangalore',
   (SELECT id FROM public.location_managers WHERE email = 'amit@paricare.com'),
   'Tech Park', '{"MSN", "Leadership"}', 'available', true);
```

### Step 5: Access the Portals

#### Admin Portal
```bash
cd admin
npm run dev
# http://localhost:5173
```

**Features:**
- Dashboard tab shows all stats
- Managers tab lists all managers
- Staff tab shows all staff with filters
- Click "Add Manager" or "Add Staff" to create new entries
- Click "Edit" to modify existing entries
- Click "Delete" to deactivate entries (soft delete)

#### Manager Portal
```bash
cd manager  
npm run dev
# http://localhost:5174
```

**Features:**
- Overview tab shows team stats
- My Staff tab shows manager's assigned staff
- Can add/edit/delete staff on their team
- Can filter and search staff

## Common Workflows

### Adding a New Manager to Mumbai

1. Open Admin Portal
2. Go to Managers tab
3. Click "+ Add Manager"
4. Fill in:
   - Name: Rajesh Kumar
   - Email: rajesh@paricare.com
   - Phone: +91-9876543210
   - City: Mumbai
   - Locations: North Center, South Center
5. Click Save

### Adding Staff to a Manager

1. Open Admin Portal
2. Go to Staff tab
3. Click "+ Add Staff"
4. Fill in:
   - Name: Priya Singh
   - Email: priya@paricare.com
   - Phone: +91-9123456789
   - City: Mumbai
   - Role: Nurse
   - Location: North Center
   - Qualifications: BSN, RN License
   - Status: Available
5. Click Save
6. Staff appears in manager's "My Staff" list

### Transferring Staff to Different Manager

1. Open Admin Portal
2. Go to Staff tab
3. Find staff member
4. Click Edit
5. Staff role/location/status can be updated
6. Transfer handled via API (coming soon)

### Transferring Staff to Different City

1. Open Admin Portal (Admin only)
2. Go to Staff tab
3. Find staff member
4. Click Edit
5. Change City dropdown
6. Change Manager if needed
7. Click Save
8. Transfer logged in database

## Key Files Created

| File | Purpose |
|------|---------|
| `supabase-staff-schema.sql` | Database schema with RLS and RPC functions |
| `admin/src/App.tsx` | Enhanced admin portal with staff management |
| `admin/src/styles.css` | Professional styling for admin portal |
| `MANAGER_PORTAL_COMPONENT.tsx` | Manager portal React component |
| `STAFF_MANAGEMENT.md` | Comprehensive documentation |
| `STAFF_MANAGEMENT_QUICK_GUIDE.md` | This file |

## Environment Variables

Create `.env.local` in both `admin/` and `manager/` directories:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## What's Ready Now

✅ Database schema with 5 tables  
✅ RLS policies for role-based access  
✅ 4 RPC functions  
✅ Admin Portal fully functional  
✅ Manager Portal component (ready to deploy)  
✅ Comprehensive documentation  
✅ Professional UI/UX  

## What's Coming Next

- [ ] Staff transfer workflows (move between managers/cities)
- [ ] Performance ratings integration
- [ ] Attendance tracking
- [ ] Email notifications
- [ ] Bulk import/export
- [ ] Advanced reporting and analytics
- [ ] Skill-based staff matching

## Troubleshooting

### Can't see data in Admin Portal
- Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
- Run SQL schema in Supabase
- Check browser console for errors

### Can't add staff
- Verify manager exists and is active
- Check city_slug matches existing city
- Verify RLS policies (user must be admin)

### Manager Portal shows "Unable to load"
- Make sure location_managers table has data
- Check RLS policy allows read access
- Verify VITE_SUPABASE_* environment variables

## Support

For detailed information, see:
- `STAFF_MANAGEMENT.md` - Complete reference documentation
- Database schema - `supabase-staff-schema.sql`
- Admin portal source - `admin/src/App.tsx`
- Manager portal source - `MANAGER_PORTAL_COMPONENT.tsx`
