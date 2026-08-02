---
name: testing-flutter-web
description: How to run and UI-test the Pari Home Healthcare Flutter web app locally (demo/offline mode, no Supabase), including responsive-width testing and Flutter-web interaction gotchas.
---

# Testing the Flutter patient app (web) locally

## Running it

```bash
export PATH=$PATH:/home/ubuntu/flutter/bin   # SDK 3.44.8 / Dart 3.12.2 — pubspec pins this
cd <repo>
flutter run -d web-server --web-port 8080 --web-hostname 0.0.0.0
```

First build takes ~60–90 s; wait until the log prints
`lib/main.dart is being served at http://0.0.0.0:8080`, then open Chrome at
`localhost:8080`.

Prefer **debug** mode (default for `flutter run`) for UI testing: RenderFlex overflow
paints visible yellow/black stripes and logs `RenderFlex overflowed` to the run log,
which is the cheapest way to prove "no overflow" claims. Grep the run log afterwards:

```bash
grep -iE "overflow|EXCEPTION|Error" /tmp/flutterrun.log
```

## Demo / offline mode

Without `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...` the app
runs `SupabaseService.fromEnvironment()` unconfigured and renders bundled demo content
from `lib/data/demo_content.dart` (a mirror of `supabase-schema.sql` seed data). In this
mode order submission does not hit a backend — it shows a snackbar
`Order captured for <item> (backend not configured)`. That snackbar text is a good
assertion target; the backend path (`get_home_content` RPC, `createOrder`) cannot be
tested without real Supabase credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

## Flutter-web interaction gotchas (computer-use)

- The DOM is useless — everything is canvas. Assert only from screenshots; use the
  `zoom` action on regions to read small text.
- **Horizontal ListViews do not scroll with a mouse click-and-drag** on desktop
  Flutter web (drag scrolling is touch-only). Use
  `scroll` with `scroll_direction: right` over the row instead, otherwise you may
  wrongly report a carousel as broken.
- `tel:` and `https://wa.me/...` CTAs open a new Chrome tab plus an OS
  "open external application" dialog. Cancel the dialog and close the tab (click the
  tab's X) before continuing, or subsequent coordinate clicks land on the wrong page.
  The wa.me landing page *does* expose the phone number and prefilled text in its DOM,
  which is a good way to assert per-item message wiring.
- Snackbars disappear after a few seconds — screenshot immediately after the action.

## Responsive testing without devtools

Resize the actual Chrome window with `wmctrl` (keeps the recording clean, no devtools):

```bash
wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz
wmctrl -r :ACTIVE: -e 0,0,0,406,745    # ~390px viewport (mobile)
wmctrl -r :ACTIVE: -e 0,0,0,816,745    # ~800px  (tablet)
wmctrl -r :ACTIVE: -e 0,0,0,1296,745   # ~1280px (desktop)
wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz
```

Add ~16 px to the target viewport width for Chrome chrome. The home screen's breakpoints
live in `lib/main.dart` (`LayoutBuilder`): services 3 cols @ ≥1100, 2 @ ≥700, else 1;
products 4/3/2.

## Devin Secrets Needed

- None for demo/offline mode.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` would be required to test the backend-driven
  path (remote content fetch, real order persistence).
