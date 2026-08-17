# Feature flags — rolling out the Phase 2 screens

The three Phase 2 screens are behind flags so they can go live one at a time
rather than all at once.

| Screen | Flag |
|---|---|
| Patients & rates | `VITE_FEATURE_PATIENTS` |
| Day sheet | `VITE_FEATURE_DAY_SHEET` |
| Monthly bills | `VITE_FEATURE_MONTHLY_BILLS` |

**Everything is off unless switched on.** A screen appears only when someone has
decided it should.

Both the manager and the admin portal read the same flags, so switching one on
reveals it for both roles at once. There is no way to give it to managers only.

> **A flag is not a permission.** It hides a tab; it does not restrict data.
> Row-level security is what stops anyone reaching records they should not, and
> it is unaffected by any of this. Never rely on a hidden tab for safety.

---

## Turning one on for everyone

1. GitHub → **Settings → Secrets and variables → Actions → Variables** →
   *New repository variable*.
2. Name it exactly as above, value `on`.
3. **Re-run the deploy workflow.** The value is compiled into the bundle, so
   changing a variable does nothing until the site is rebuilt — Actions → Deploy
   to GitHub Pages → *Re-run all jobs*.

The build log prints which screens the bundle ships, so you can confirm the
variable was picked up before anyone else sees the change:

```
Patients & rates : on
Day sheet        : off
Monthly bills    : off
```

To switch a screen back off, set the variable to `off` (or delete it) and re-run
the deploy.

---

## Looking at a screen before switching it on

Add `?features=` to the portal URL. This affects **only your own browser**, so
you can check a screen on the live site without exposing it to anyone else.

| URL | Effect |
|---|---|
| `?features=patients` | just that screen |
| `?features=patients,daySheet` | those two |
| `?features=all` | all three |
| `?features=none` | all three off |
| `?features=reset` | forget the override, go back to what the build ships |

The choice is remembered in that browser until you reset it, so it survives
reloads and moving between tabs. Names are forgiving — `daySheet`, `day-sheet`
and `day sheet` all work.

Because it is remembered, **reset when you are done**, otherwise you will keep
seeing a different portal from everyone else and may report a bug nobody else
can reproduce.

---

## Suggested order

1. **Patients & rates** first — nothing else is usable without patients,
   assignments and rates existing.
2. **Day sheet** next, once real rates are set. Recording days against wrong
   rates means correcting money later.
3. **Monthly bills** last, once a month of days has actually been recorded. It
   has nothing to show before that, and issuing a bill is hard to walk back.

---

## Local development

Copy `admin/.env.example` to `admin/.env.local` and set them there. Vite reads
env files from the app root, so the ops portal needs its own copy. Restart the
dev server after changing one.
