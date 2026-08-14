# Staff Management System - Feature Matrix

## System Overview

This document outlines the complete staff management system with Admin Portal, Manager Portal, and Staff Portal.

## Feature Comparison

| Feature | Admin Portal | Manager Portal | Staff Portal | Notes |
|---------|--------------|----------------|--------------|-------|
| **View Dashboard** | ✅ Full system stats | ✅ Team stats only | ⏳ Coming | Admins see all locations; Managers see their team |
| **View All Managers** | ✅ Yes | ❌ No | ❌ No | Only for admins |
| **Add Manager** | ✅ Yes | ❌ No | ❌ No | Admins only |
| **Edit Manager** | ✅ Yes | ❌ No | ❌ No | Admins only |
| **Delete Manager** | ✅ Yes | ❌ No | ❌ No | Admins only |
| **View All Staff** | ✅ Yes (all) | ✅ Own team | ⏳ Coming | Filtered by manager assignment |
| **Add Staff** | ✅ Yes | ✅ To own team | ⏳ Coming | Managers limited to their team |
| **Edit Staff** | ✅ Yes | ✅ Own team only | ⏳ Coming | Own team or personal profile |
| **Delete Staff** | ✅ Yes | ✅ Own team only | ⏳ Coming | Soft delete (deactivate) |
| **Filter by City** | ✅ Yes | ⏳ Auto (assigned city) | N/A | |
| **Filter by Role** | ✅ Yes | ✅ Yes | N/A | |
| **Filter by Status** | ✅ Yes | ✅ Yes | N/A | |
| **Search by Name/Email** | ✅ Yes | ✅ Yes | N/A | |
| **View Qualifications** | ✅ Yes | ✅ Yes | ⏳ Coming | |
| **Add Qualifications** | ✅ Yes | ✅ Yes | ⏳ Coming | |
| **Transfer Staff to Manager** | ✅ Yes | ⏳ Request | N/A | Admins do it directly; managers request |
| **Transfer Staff to City** | ✅ Yes | ❌ No | N/A | Admins only |
| **View Transfer History** | ✅ Yes | ❌ No | N/A | Audit trail |
| **Performance Ratings** | ✅ View/Edit | ✅ Add/View | ⏳ Coming | Track performance over time |
| **Attendance Tracking** | ⏳ Coming | ⏳ Coming | ⏳ Coming | Planned for Phase 2 |
| **Shift Scheduling** | ⏳ Coming | ⏳ Coming | ⏳ Coming | Planned for Phase 2 |
| **Email Notifications** | ⏳ Coming | ⏳ Coming | ⏳ Coming | For transfers and assignments |
| **Bulk Import/Export** | ⏳ Coming | ❌ No | N/A | CSV import for admins |
| **Analytics & Reports** | ⏳ Coming | ⏳ Coming | N/A | Staff utilization, performance, etc. |

## Access Control Matrix

### Admin User
```
CREATE  READ    UPDATE  DELETE
------  ------  ------  ------
Admins      ✅      ✅      ✅      ✅
Managers    ✅      ✅      ✅      ✅
Staff       ✅      ✅      ✅      ✅
All Cities  ✅      ✅      ✅      ✅
```

### Manager User
```
CREATE  READ    UPDATE  DELETE
------  ------  ------  ------
Admins      ❌      ✅      ❌      ❌
Other Mgrs  ❌      ✅      ❌      ❌
Own Staff   ✅      ✅      ✅      ✅
Other Staff ❌      ❌      ❌      ❌
Own City    ⏳      ✅      ⏳      ⏳
```

### Staff User
```
CREATE  READ    UPDATE  DELETE
------  ------  ------  ------
Admins      ❌      ❌      ❌      ❌
Managers    ❌      ✅      ❌      ❌
Self        ❌      ✅      ✅      ❌
Other Staff ❌      ❌      ❌      ❌
```

## Database Tables & Policies

### admins
- **Read**: Only by other admins
- **Write**: Only by admins
- **Public**: No

### location_managers
- **Read**: By admins (all), managers (self), staff (public list)
- **Write**: By admins
- **Public**: Name, city only

### location_staff
- **Read**: By admins (all), managers (their team), staff (self)
- **Write**: By admins (all), managers (their team), staff (self)
- **Public**: No

### staff_transfer_history
- **Read**: By admins only
- **Write**: By admins (system only)
- **Public**: No

### staff_performance
- **Read**: By admins, managers (their team)
- **Write**: By managers (their team), admins
- **Public**: No

## User Journeys

### Admin Workflow: Onboard Manager & Staff

1. **Admin Portal** → Managers tab → "+ Add Manager"
2. Enter: Name, Email, Phone, City, Managed Locations
3. Save
4. **Admin Portal** → Staff tab → "+ Add Staff"
5. Enter: Name, Email, Phone, Role, City, Location, Qualifications
6. Save
7. **Result**: Manager can now see staff in Manager Portal

### Manager Workflow: Manage Team

1. **Manager Portal** → Overview tab
   - See team statistics
2. **Manager Portal** → My Staff tab
   - See all assigned staff
3. Click "+ Add Staff"
   - Add new team member
4. Click "Edit" on staff member
   - Update qualifications, status, location
5. **To Transfer Staff**: 
   - Request to admin (coming soon)

### Staff Workflow: View Profile (Coming Soon)

1. **Staff Portal** → Profile tab
   - See own details
   - See assigned manager
   - See qualifications
2. Click "Edit"
   - Update emergency contact
   - Update qualifications (coming soon)
3. **Request Transfer** (coming soon)

## API Functions

### Admin Functions

```typescript
// Get dashboard summary
const { data } = await supabase.rpc('get_admin_dashboard_summary');
// Returns: { total_managers, total_staff, total_cities, staff_by_role, staff_by_city, managers_by_city }

// Get managers with staff count
const { data } = await supabase.rpc('get_managers_with_staff_count');
// Returns: [{ id, full_name, email, city_slug, managed_locations, staff_count, is_active }]

// Transfer staff to different manager
const { data } = await supabase.rpc('transfer_staff', {
  p_staff_id: 'uuid',
  p_new_manager_id: 'uuid',
  p_reason: 'string'
});
// Returns: { success, staff_id, staff_name, old_manager_id, new_manager_id, reason }

// Transfer staff to different city
const { data } = await supabase.rpc('transfer_staff_to_city', {
  p_staff_id: 'uuid',
  p_new_city_slug: 'string',
  p_new_manager_id: 'uuid (optional)',
  p_reason: 'string'
});
// Returns: { success, staff_id, staff_name, old_city, new_city, reason }

// Get city staff with filters
const { data } = await supabase.rpc('get_city_staff', {
  p_city_slug: 'string',
  p_role: 'staff_role_type (optional)',
  p_status: 'string (optional)'
});
// Returns: [{ id, full_name, email, phone_number, staff_role, city_slug, ... }]
```

## Deployment Strategy

### Phase 1: Admin Portal (Ready Now)
- Deploy to `admin.yourdomain.com`
- All staff management
- System-wide visibility

### Phase 2: Manager Portal (Ready Soon)
- Deploy to `manager.yourdomain.com`
- Manager-only view of team
- Team management

### Phase 3: Staff Portal (Coming)
- Deploy to `staff.yourdomain.com` or main app
- Personal profile view
- Qualifications and availability
- Performance tracking

### Phase 4: Mobile Apps (Phase 3+)
- Flutter native mobile apps
- Cross-platform (iOS/Android)
- Attendance tracking via GPS
- Real-time notifications

## Performance Considerations

### Database Optimization
- Indexes on: `assigned_manager_id`, `city_slug`, `is_active`
- Foreign keys for referential integrity
- Transfer history for audit trail

### Query Performance
- RPC functions use direct SQL for speed
- Filtering done server-side
- Pagination ready for large datasets

### UI Performance
- Modal forms reduce page load
- Lazy loading for large staff lists (coming)
- Optimistic updates (coming)

## Security Measures

### Row Level Security (RLS)
- All tables have RLS policies
- Admins bypass restrictions
- Managers limited to team
- Staff limited to self

### Authentication
- Email-based (Supabase Auth)
- OTP option (Supabase native)
- Session-based tokens

### Data Protection
- No sensitive data in URLs
- Encrypted at rest (Supabase)
- Transfer history logged
- Soft deletes for audit trail

## Roadmap

### ✅ Completed (Phase 1)
- Database schema
- RLS policies
- Admin portal with full CRUD
- Manager portal component
- Documentation

### 🔄 In Progress (Phase 2)
- Staff transfer workflows
- Manager portal deployment
- Performance ratings
- Email notifications

### 📋 Planned (Phase 3+)
- Staff portal
- Attendance tracking
- Shift scheduling
- Mobile apps
- Advanced analytics
- Integration with visit tracking

## Support & Documentation

- **Setup Guide**: `STAFF_MANAGEMENT_QUICK_GUIDE.md`
- **Full Docs**: `STAFF_MANAGEMENT.md`
- **Admin Portal**: `admin/src/App.tsx`
- **Manager Component**: `MANAGER_PORTAL_COMPONENT.tsx`
- **Schema**: `supabase-staff-schema.sql`
