/**
 * Feature flags for the Phase 2 screens, so they can be switched on one at a
 * time rather than all at once.
 *
 * Frontend only — nothing here changes what the database allows. A flag hides
 * a tab; it is not a permission. Row-level security is what stops anyone
 * reaching data they should not, and it is unaffected by any of this.
 *
 * Two ways to set a flag, in order of precedence:
 *
 *   1. Per browser, for a look before rolling out to everyone:
 *        ?features=patients,daySheet     turn exactly these on
 *        ?features=all                   everything on
 *        ?features=none                  everything off
 *        ?features=reset                 forget the override, use the build
 *      The choice is remembered in this browser until reset, so it survives
 *      moving between tabs and reloads.
 *
 *   2. For everyone, at build time — repository variables read by the deploy
 *      workflow:
 *        VITE_FEATURE_PATIENTS=on
 *        VITE_FEATURE_DAY_SHEET=on
 *        VITE_FEATURE_MONTHLY_BILLS=on
 *      Changing a variable needs the deploy workflow re-run to take effect,
 *      because these are baked into the bundle.
 *
 * Everything defaults to OFF, so a screen appears only when someone has
 * decided it should.
 */

export type FeatureKey = 'patients' | 'daySheet' | 'monthlyBills';

export const FEATURES: { key: FeatureKey; label: string; env: string }[] = [
  { key: 'patients', label: 'Patients & rates', env: 'VITE_FEATURE_PATIENTS' },
  { key: 'daySheet', label: 'Day sheet', env: 'VITE_FEATURE_DAY_SHEET' },
  { key: 'monthlyBills', label: 'Monthly bills', env: 'VITE_FEATURE_MONTHLY_BILLS' },
];

const STORAGE_KEY = 'pari.features';

/** "on", "1", "true", "yes" — anything else, including unset, is off. */
function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ['on', '1', 'true', 'yes'].includes(value.trim().toLowerCase());
}

const fromBuild: Record<FeatureKey, boolean> = {
  patients: truthy(import.meta.env.VITE_FEATURE_PATIENTS),
  daySheet: truthy(import.meta.env.VITE_FEATURE_DAY_SHEET),
  monthlyBills: truthy(import.meta.env.VITE_FEATURE_MONTHLY_BILLS),
};

/** Accepts the key, the label, or a loose spelling like "day-sheet". */
function normalise(token: string): FeatureKey | null {
  const t = token.trim().toLowerCase().replace(/[\s_-]/g, '');
  const match = FEATURES.find(
    (f) => f.key.toLowerCase() === t || f.label.toLowerCase().replace(/[\s_&-]/g, '') === t
  );
  return match?.key ?? null;
}

function readOverride(): Partial<Record<FeatureKey, boolean>> | null {
  if (typeof window === 'undefined') return null;

  const param = new URLSearchParams(window.location.search).get('features');

  if (param !== null) {
    const value = param.trim().toLowerCase();

    if (value === 'reset') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // private browsing; the URL param still applies for this page load
      }
      return null;
    }

    const next: Partial<Record<FeatureKey, boolean>> =
      value === 'all'
        ? { patients: true, daySheet: true, monthlyBills: true }
        : { patients: false, daySheet: false, monthlyBills: false };

    if (value !== 'all' && value !== 'none') {
      for (const token of param.split(',')) {
        const key = normalise(token);
        if (key) next[key] = true;
      }
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // not fatal — the override just will not outlive this page load
    }
    return next;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Partial<Record<FeatureKey, boolean>>) : null;
  } catch {
    return null;
  }
}

const override = readOverride();

export const featureFlags: Record<FeatureKey, boolean> = {
  patients: override?.patients ?? fromBuild.patients,
  daySheet: override?.daySheet ?? fromBuild.daySheet,
  monthlyBills: override?.monthlyBills ?? fromBuild.monthlyBills,
};

export function isEnabled(key: FeatureKey): boolean {
  return featureFlags[key];
}

/** True when this browser is running an override rather than the shipped set. */
export const hasOverride = override !== null;
