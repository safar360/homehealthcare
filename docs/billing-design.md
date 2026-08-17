# Attendance, billing and payroll — design

**Date:** 2026-08-14
**Status:** design for review. Not built.

Covers assigning staff to patients, daily check-in/check-out, and the monthly money that
falls out of it — patient bills, advances, and staff pay.

---

## 1. The one decision everything rests on

> *"Since a week can start any time, better we keep number of days served."*

This is the right call and the whole model follows from it.

**Days served is the atomic unit.** Weekly and monthly are *rate types*, not billing
periods. A weekly patient starting on a Wednesday needs no special handling, because
nothing in the system counts weeks — it counts days, and prices them.

The second decision follows from your answer on shifts:

**A day is not one price.** A day carries a *service type* — 12-hour or 24-hour — and each
type has its own rate. A month is therefore priced as:

```
charge  =  Σ  (days served of type T)  ×  (rate for type T)
          T
```

### How monthly rates fold into the same formula

A monthly agreement is priced against a fixed 30-day base:

```
line amount (T)  =  monthly rate (T) × days served (T) ÷ 30     if monthly
                 =  daily rate (T)   × days served (T)          if per-day
```

One formula covers per-day and monthly agreements, mixed service types, partial months,
and a week that started on a Wednesday. Nothing special-cases the calendar.

> **Do not derive and store a daily rate for monthly agreements.** Rounding ₹26,000 ÷ 30 to
> ₹866.67 and multiplying back by 30 gives **₹26,000.10** — every 24-hour monthly customer
> would be overcharged by 10 paise on a full month, and would notice. Round **once, on the
> line**, as above. The full-month case then returns exactly the monthly rate, which is the
> only acceptable behaviour.

---

## 2. Worked example

**Mrs. Sharma** — Bhopal, Arera Colony. Monthly agreement, served by **Ravi Kumar** (Nurse).

| Service type | Patient rate | Staff rate |
|---|---:|---:|
| 12-hour | ₹15,000/month | ₹9,000/month |
| 24-hour | ₹26,000/month | ₹16,000/month |

**August attendance:** 18 days at 12-hour, 6 days at 24-hour. 24 days served.

**Patient bill for August** — each line is `monthly rate × days ÷ 30`, rounded once:

| Line | Days | Monthly rate | Amount |
|---|---:|---:|---:|
| 12-hour care | 18 of 30 | ₹15,000 | ₹9,000.00 |
| 24-hour care | 6 of 30 | ₹26,000 | ₹5,200.00 |
| | | **Total earned** | **₹14,200.00** |
| | | Advance received 1 Aug | −₹7,500.00 |
| | | **Balance due** | **₹6,700.00** |

**Ravi's August pay**

| Line | Days | Monthly rate | Amount |
|---|---:|---:|---:|
| 12-hour | 18 of 30 | ₹9,000 | ₹5,400.00 |
| 24-hour | 6 of 30 | ₹16,000 | ₹3,200.00 |
| | | **Payable** | **₹8,600.00** |

The bill shows "18 of 30 days at ₹15,000/month" rather than a derived daily rate, so a
family can check the arithmetic against what they agreed to.

**Margin on this patient: ₹5,600.00.** It comes out of the same numbers at no extra cost,
and is worth showing to admins — it is the figure that tells you whether a rate is priced
correctly.

> Confirm this arithmetic matches how you bill today. Everything below implements exactly
> this, so a disagreement here is far cheaper to fix now than after the build.

---

## 3. Data model

```
patients ──< care_assignments ──< assignment_rates   (one row per service type)
                   │
                   ├──< attendance          (one row per day served)
                   │
                   └──< monthly_bills ──< patient_payments   (advance + receipts)

location_staff ──< care_assignments
                        │
                        └──< staff_payouts   (per staff, per month)

service_types   admin-managed, like cities and roles
```

### `service_types`
Admin-managed, following the same pattern as cities and staff roles, so a third type
(say a 6-hour visit) needs no code change.

| Field | Notes |
|---|---|
| `slug`, `label` | `12_hour` → "12-hour care" |
| `hours` | 12, 24 — informational, not used in pricing |
| `is_active`, `sort_order` | |

### `care_assignments`
The agreement: this staff member serves this patient, from this date, at these rates.

| Field | Notes |
|---|---|
| `patient_id`, `staff_id`, `manager_id` | manager owns it, drives RLS |
| `billing_mode` | `per_day` or `monthly` — decides whether rates are divided by 30 |
| `start_date`, `end_date` | |
| `status` | `active` / `paused` / `ended` |

A patient may have more than one active assignment — a day nurse and a night nurse are two
assignments, and both bill independently. That falls out of the model rather than needing
special handling.

### `assignment_rates`
One row per service type this assignment can use. This is what your answer required: type,
rate, and then a count of days of that type.

| Field | Notes |
|---|---|
| `assignment_id`, `service_type` | |
| `patient_rate` | what the family pays |
| `staff_rate` | what the staff member earns |

Rates are **per assignment**, so the same nurse can earn more on a critical case than a
routine one.

**Rates must be versioned, not overwritten.** If a rate changes mid-month, past attendance
must keep its old price. Either date-stamp rate rows, or copy the rate onto each attendance
row when it is created. The second is simpler and is what I would build: attendance stores
the rate that applied on that day, so a historic bill can never silently change.

### `attendance`
One row per day served. This table is the source of truth for both billing and payroll.

| Field | Notes |
|---|---|
| `assignment_id`, `service_date` | unique together — one entry per assignment per day |
| `service_type` | which rate applies |
| `check_in_at`, `check_out_at` | timestamps |
| `day_fraction` | 1.0 normally, 0.5 for a half day |
| `status` | `present` / `absent` / `leave` |
| `patient_rate_applied`, `staff_rate_applied` | frozen at entry — see above |
| `marked_by`, `verified_by` | staff marks, manager can verify or correct |

### `monthly_bills` and `patient_payments`
A bill is generated per patient per calendar month by summing attendance. Advance and any
later receipts are recorded against it, and the balance is the difference.

| `monthly_bills` | |
|---|---|
| `patient_id`, `billing_month` | unique together |
| `days_by_type` | the breakdown, stored for the record |
| `total_earned` | |
| `status` | `draft` / `issued` / `part_paid` / `paid` |

| `patient_payments` | |
|---|---|
| `bill_id`, `amount`, `paid_on`, `method` | |
| `kind` | `advance` or `receipt` |
| `recorded_by` | manager or admin |

**The advance:** at the start of a month the system suggests 50% of the expected charge —
based on the current assignment rates and the days served last month — and the manager
records what was *actually* collected. The suggestion is a convenience, never a
constraint; the recorded figure is what counts.

### `staff_payouts`
Per staff member, per month: days served, amount payable, and what has been paid.

| Field | Notes |
|---|---|
| `staff_id`, `payout_month` | unique together |
| `days_by_type`, `total_payable` | summed across all their assignments |
| `paid_amount`, `paid_on`, `paid_by` | manager or admin records payment |
| `status` | `pending` / `part_paid` / `paid` |

---

## 4. Money handling rules

These are cheap to get right now and expensive to retrofit.

1. **Store money as `numeric(12,2)`**, never floating point. `0.1 + 0.2` is not `0.3` in a
   float, and that discrepancy eventually shows up on an invoice.
2. **Round exactly once, on the line.** `monthly × days ÷ 30` computed in full precision
   and rounded at the end. Rounding earlier (to a daily rate) or later (on the total)
   both produce figures that do not reconcile.
3. **Verify the full-month identity.** 30 days on a monthly agreement must return the
   monthly rate to the paisa. This is the single best regression test for the whole
   pricing path, and it is what catches a bad rounding rule immediately.
4. **Never recompute a historic bill.** Once issued, a bill is a record. Corrections are a
   new adjustment line, not an edit — otherwise last month's total changes after the family
   has already paid it.
5. **Attendance is append-and-correct, not delete.** A corrected day keeps its history and
   records who changed it. Attendance drives both what a family owes and what a staff
   member earns, so it is the most disputable data in the system.

---

## 5. Who can do what

Enforced by the same row-level security already protecting staff records.

| | Staff | Manager | Admin |
|---|---|---|---|
| Check in / out for own visit | ✅ | | |
| See own attendance and days served | ✅ | | |
| See own monthly pay | ✅ | | |
| Create assignments and set rates | | ✅ own patients | ✅ all |
| Correct attendance | | ✅ own team | ✅ all |
| Record patient payment / advance | | ✅ own patients | ✅ all |
| Record staff payout | | ✅ own team | ✅ all |
| See margin per patient | | ✅ own patients | ✅ all |
| See totals across cities | | | ✅ |

**A staff member must not see their patient's rate** — only their own. That falls out of
column-level control, which the schema already does for profiles.

---

## 6. What the check-in has to survive

Field staff use cheap phones on poor networks in patients' homes, so:

- **The check-in screen must work on a small screen** and be a large, obvious button.
- **Handle a missing check-out.** Staff forget. A day with a check-in but no check-out
  should flag for manager correction rather than silently counting or not counting.
- **Same-day duplicates** are prevented by the unique constraint on
  (assignment, date) — a double tap cannot bill twice.
- **Backdated entry** must exist for the manager, because phones fail. Every backdated row
  records who entered it.
- **GPS is optional at first.** Location capture is worth adding, but making it mandatory
  when a phone has poor signal blocks a legitimate check-in. Record it when available.

---

## 7. Revised phases

The earlier estimate had "visits and scheduling" as one 20-day phase. Handling money splits
it in two and adds effort — billing needs correctness, audit and dispute handling that a
schedule alone does not.

| Phase | Scope | Effort |
|---|---|---|
| **0** | Pilot readiness — onboarding, hosting, OTP, handover | 7 d |
| **1** | Patients, care assignments, per-type rates | 12 d |
| **2** | Scheduling and attendance — check-in/out, days served | 15 d |
| **3** | Billing, advances, payments and staff payroll | 16 d |
| **4** | Customer app and notifications | 16 d |
| | **Total remaining** | **66 d** |

Phases 1–3 are the sequence you described, and each is independently useful: Phase 1 tells
you who serves whom at what price, Phase 2 tells you who actually turned up, Phase 3 turns
that into money.

---

## 8. Open questions

1. **Absence and leave.** If a staff member does not turn up, is the patient charged? Is
   a replacement sent, and does that day bill under the original assignment or a new one?
2. **Overtime.** Is a 24-hour day ever billed beyond its rate, or is the rate final?
3. **Bill delivery.** Printed, PDF over WhatsApp, or read from the portal? PDF generation
   is a day of work and is not currently in the estimate.
4. **GST.** Are these invoices GST-bearing? If so, tax handling and a compliant invoice
   number series must be designed in, not added later.
5. **Payment methods.** Cash, UPI, bank transfer — recorded as a note, or reconciled?
6. **Rate changes mid-engagement.** Effective from a date, or from the next month?

Question 4 is the one to answer first — GST changes the invoice structure, and retrofitting
it means reissuing history.
