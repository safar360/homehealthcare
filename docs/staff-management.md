# Staff management

Replaces the five overlapping `STAFF_MANAGEMENT*.md` files. Where they disagreed with the code, the
code won.

## Role model

`profiles.role` is the single source of truth for authorisation. There is no separate `admins`
table — an earlier schema had one, and its RLS policy queried `admins` from within a policy *on*
`admins`, which Postgres rejects as infinite recursion (42P17).

| Table | Purpose |
|---|---|
| `profiles` | Identity and role. `id` is the `auth.users` id, created by an on-signup trigger. |
| `location_managers` | Operational record for a manager. `user_id` links to their profile. |
| `location_staff` | Operational record for a field staff member. |
| `staff_transfer_history` | Audit trail, written by the transfer RPCs. |
| `staff_performance` | Ratings and review notes. |

A profile with `role = 'manager'` and no `location_managers` row can sign in but has no team; the
portal says so explicitly. The same applies to staff.

### Staff roles and availability

`staff_role` is an enum: `nurse`, `assistant`, `therapist`, `care_coordinator`, `supervisor`.

`availability_status` is a checked text column: `available`, `on_leave`, `inactive`, `training`.

## Access control

Enforced by RLS, not by the UI. The portal's role routing is convenience only.

| | Admin | Manager | Staff |
|---|---|---|---|
| Read all managers | ✅ | ✅ | ✅ |
| Create / edit managers | ✅ | own row only | ❌ |
| Read staff | all | own team | own record |
| Create / edit staff | all | own team only | own record |
| Transfer staff | ✅ | ❌ (ask an admin) | ❌ |
| Read transfer history | ✅ | ✅ | ❌ |
| Read orders | ✅ | ✅ | ✅ |

A manager's writes are constrained by `assigned_manager_id = current_manager_id()`, so they cannot
move someone onto — or off — their own team by editing the row. Transfers go through the RPCs so
they land in the audit trail.

## RPCs

All are `security definer` and therefore bypass RLS, so each checks the caller's role itself and
raises `42501` otherwise. An earlier version had no checks at all, which let any holder of the anon
key read the whole roster and execute transfers.

| Function | Who | Returns |
|---|---|---|
| `get_admin_dashboard_summary()` | admin | Counts by role, city and order status |
| `get_managers_with_staff_count()` | staff, manager, admin | Managers with active team sizes |
| `get_city_staff(city, role, status)` | manager, admin | Staff in a city; a manager sees only their own team |
| `transfer_staff(staff, manager, reason)` | admin | Moves a staff member to another manager |
| `transfer_staff_to_city(staff, city, manager, reason)` | admin | Moves a staff member to another city |

`transfer_staff_to_city` validates that the incoming manager actually works in the destination city.
The earlier version defaulted the manager to the existing one, which left staff reporting across a
city boundary after a move.

## Workflows

### Onboard a manager

1. Create the auth user in the Supabase dashboard (**Authentication → Users → Add user**).
2. Promote the profile:
   ```sql
   update public.profiles set role = 'manager' where email = 'manager@example.com';
   ```
3. In the ops portal as an admin: **Managers → Add manager**, set name, city and managed locations.
4. Link the record to the account so the manager portal can find it:
   ```sql
   update public.location_managers m
   set user_id = p.id
   from public.profiles p
   where p.email = m.email and m.email = 'manager@example.com';
   ```

Step 4 is the one that is easy to miss — without it the manager signs in and sees "No manager
record".

### Add staff

A manager does this from **My team → Add staff**; the record is pinned to their city and team
automatically. An admin can do it from **Staff → Add staff** and choose the reporting manager.

To let that staff member sign in, create their auth user, set `role = 'staff'`, and link
`location_staff.user_id` the same way as above.

### Transfer

Admin only, from **Staff → Transfer**. Choose "another manager" to stay in the city, or "another
city" to move — the latter clears the manager selection, because the old manager does not cover the
new city. The reason is recorded in `staff_transfer_history` and shown on the **Transfers** tab.

## Troubleshooting

**"Only an admin can …" (error 42501)** — the signed-in profile is not `role = 'admin'`. Check with
`select role from public.profiles where email = '…'`.

**Empty dashboard, no error** — you are signed in as a role with narrower access than you expect.
The RPCs raise rather than return empty, so a silent empty result usually means the tables really
are empty.

**Manager sees "No manager record"** — `location_managers.user_id` is not set for that account. See
step 4 above.

**Staff missing from a manager's team** — `assigned_manager_id` is null or points at a different
manager. Admins can see every staff member, including unassigned ones, on the Staff tab.
