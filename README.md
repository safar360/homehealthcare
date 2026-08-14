# Pari Home Healthcare

A home healthcare platform for patients, field staff, location managers and admins, built on a
single Supabase project so it runs on the free tier with no fixed infrastructure cost.

- [STATUS.md](STATUS.md) — what actually works today and what does not
- [architecture.md](architecture.md) — solution design and cost model
- [supabase-setup.md](supabase-setup.md) — step-by-step backend setup
- [docs/staff-management.md](docs/staff-management.md) — staff hierarchy, roles and transfers
- [prd.md](prd.md), [requirements.md](requirements.md) — product scope

## The two apps

| App | Directory | Port | Who it is for |
|---|---|---|---|
| Patient app | [src/](src/) | 3000 | Families browsing services and placing orders. Anonymous. |
| Operations portal | [admin/](admin/) | 4000 | Admins, managers and staff. Requires sign-in. |

Both are React + TypeScript + Vite talking directly to Supabase. There is no application server:
PostgREST is the API and row level security is the authorisation layer.

## Setup

### 1. Backend

Create a free Supabase project, open the SQL editor, and run
[supabase-schema.sql](supabase-schema.sql). It is a single authoritative file covering tables, RLS
policies, RPCs and seed content, and it is safe to re-run. See [supabase-setup.md](supabase-setup.md)
for the full walkthrough, including how to create the first admin.

### 2. Credentials

```bash
cp .env.example .env.local              # patient app
cp admin/.env.example admin/.env.local  # ops portal
```

Fill both in from **Project Settings → API**. `VITE_SUPABASE_URL` is the bare project URL — do not
append `/rest/v1`, supabase-js adds it itself.

### 3. Run

```bash
npm install && npm run dev          # patient app  -> http://localhost:3000
cd admin && npm install && npm run dev   # ops portal -> http://localhost:4000
```

The patient app renders bundled demo content when the credentials are missing, so its UI can be
reviewed without a backend. The ops portal cannot — it needs a real project to sign in against.

## Checks

```bash
npm run build          # tsc -b && vite build
cd admin && npm run build
```

## Roles

`profiles.role` decides everything. The ops portal routes on it, and the database enforces the same
boundary through RLS.

| Role | Sees |
|---|---|
| `patient` | The patient app only; refused by the ops portal |
| `staff` | Own staff record and availability |
| `manager` | Own team: add, edit and remove staff within their city |
| `admin` | Everything: dashboard, all managers, all staff, transfers |

New sign-ups get `patient`. Promoting an account is a deliberate SQL step — see
[supabase-setup.md](supabase-setup.md).
