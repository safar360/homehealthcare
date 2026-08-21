# Operations runbook

How the two risks of running on Supabase's free plan are handled, and what to do when
something goes wrong.

| Risk on the free plan | Mitigation | Where |
|---|---|---|
| No backups at all | Nightly encrypted `pg_dump`, 90-day retention | [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) |
| Project pauses after 7 days idle | One authenticated request a day | [`.github/workflows/keepalive.yml`](../.github/workflows/keepalive.yml) |

---

## 1. One-time setup

### 1.1 Generate a backup passphrase

This is the only thing standing between a downloaded artifact and your staff data, so it
must be long and random. Do **not** invent one.

```bash
openssl rand -base64 32
```

Store it in a password manager. **If you lose it, every backup is unreadable** — there is
no recovery path. Nobody can reset it for you.

### 1.2 Get the database connection string

Supabase dashboard → **Project Settings → Database → Connection string → Session pooler**.

It looks like:

```
postgresql://postgres.htgydovsseqeshwnxazm:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Replace `[PASSWORD]` with your database password (Settings → Database → Reset password if
you never saved it).

> **Use the Session pooler, not the others.** The direct connection
> (`db.<ref>.supabase.co`) is IPv6-only and GitHub runners have no IPv6, so it fails with
> "network unreachable". The transaction pooler on port **6543** cannot run `pg_dump` at
> all. Only the session pooler on **5432** works. The workflow checks this and fails with
> a clear message rather than producing a broken backup.

### 1.3 Add both secrets

GitHub → Settings → Secrets and variables → Actions → **New repository secret**:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the session pooler string from 1.2, password filled in |
| `BACKUP_PASSPHRASE` | the passphrase from 1.1 |

### 1.4 Run both once, by hand

Actions → *Nightly database backup* → **Run workflow**. Then the same for *Keep Supabase
awake*. Do not wait for the schedule to discover a typo.

### 1.5 Practise a restore

Do this once now, not during an incident — §3.

---

## 2. What runs, and when

| Workflow | Schedule | Does |
|---|---|---|
| Keep Supabase awake | 11:30 IST daily | One `select` against `cities`; fails loudly if the project is not answering |
| Nightly database backup | 02:00 IST daily | Full `pg_dump`, AES-256 encrypted, uploaded as a 90-day artifact |

They are separate files on purpose: an expired database password breaks the backup, and
the keep-alive must survive that or the project quietly pauses on top of the outage.

### The schedules can be switched off without you noticing

**GitHub disables scheduled workflows in a repository with no activity for 60 days.** If
development pauses for two months, both of these stop — and the pause protection stops
with them.

Guard against it: check the Actions tab monthly, or set a calendar reminder. If the repo
goes quiet for a long stretch, push any commit to re-enable schedules.

---

## 3. Restoring

### 3.1 Fetch and decrypt

GitHub → Actions → *Nightly database backup* → pick a run → download the artifact.

```bash
unzip db-backup-<n>.zip
# --pinentry-mode loopback is needed alongside --batch on GnuPG 2.1+, which
# otherwise ignores --passphrase and tries to prompt on a terminal.
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --output dump.pgc --decrypt backup-2026-08-14.pgc.gpg
pg_restore --list dump.pgc | head       # sanity check before touching anything
```

### 3.2 Restore into a scratch project first

**Never restore straight over production.** Create a throwaway Supabase project, restore
into it, confirm the data is what you expect, and only then decide.

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "postgresql://postgres.<scratch-ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  dump.pgc
```

### 3.3 Restoring over production

Only after 3.2. Take a fresh backup first, so you can undo the undo:

```bash
# 1. capture current state, whatever shape it is in
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -Fc -f pre-restore.pgc

# 2. restore
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "$SUPABASE_DB_URL" dump.pgc
```

`--clean --if-exists` drops each object before recreating it, so anything created since
the backup is lost. That is the point of a restore, but be sure it is what you want.

Afterwards: sign in to the ops portal, confirm managers and staff are present, and confirm
the patient app still loads live content.

### 3.4 What a restore does not cover

`pg_dump` captures the `public` schema. It does **not** capture Supabase's `auth.users`
table, so **logins are not restored**. After a full restore, profile rows will reference
auth users that no longer exist.

At current scale that is a handful of accounts to recreate by hand, and the invite flow
(Phase 1.5) will make it a few minutes' work. Worth knowing before you need it, not
during.

---

## 4. Where the residual risk sits

With both workflows running:

| | Exposure |
|---|---|
| Data loss window | **Up to 24 hours** — whatever changed since the last nightly dump |
| Restore time | ~15 minutes, manual |
| Pause risk | Removed, unless GitHub disables the schedule (§2) |
| Support | Community only; no one to escalate to |
| Backup readability | Entirely dependent on that passphrase |

Supabase Pro at $25/month buys a one-click restore, email support, and no self-managed
passphrase. It does **not** buy a smaller loss window — Pro's backups are also daily.

**Upgrade when any of these becomes true:**

1. Real patient records exist — losing a day then costs a customer, not just you
2. More than about two cities are live, or the team depends on it for daily revenue
3. You have had one incident where restore speed actually mattered

---

## 5. Security notes

- **This repository is public**, so build artifacts are downloadable by anyone. The dump is
  encrypted before upload for exactly that reason. The passphrase must never appear in the
  repo, in an issue, or in chat.
- The dumps contain personal data. Under India's DPDP Act they are in scope wherever they
  are stored, including a laptop you decrypted one onto. Delete local copies when finished.
- If the passphrase leaks, rotate it and take a fresh backup. Old artifacts stay readable
  with the old passphrase, so delete them from the Actions UI as well.
- Consider moving backups to a private bucket (Cloudflare R2's free tier is 10 GB) if the
  repository stays public long-term. Artifacts are convenient, not private.
