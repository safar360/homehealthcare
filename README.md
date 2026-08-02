# Home Healthcare Platform

This repository now contains:
- a React-based web prototype for the product flow
- a Flutter patient app targeting mobile and mobile web
- a Supabase schema for services and orders
- a polished HTML mockup representing the full patient/manager/staff experience

## Run the web prototype
```bash
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

## Run the Flutter app
```bash
export PATH="/tmp/flutter/bin:$PATH"
flutter pub get
flutter run -d chrome
```

## Supabase setup
1. Create a Supabase project at https://supabase.com.
2. In the Supabase SQL editor, run the contents of supabase-schema.sql so the tables and policies exist.
3. Open Project Settings → API and copy:
   - Project URL
   - anon public key
4. Create a local environment file from the example values:
   ```bash
   cp .env.example .env
   ```
   Then edit .env and replace the placeholder values with your Supabase URL and anon key.
5. For the React/Vite app, the values are read from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
6. For the Flutter app, run it with:
   ```bash
   export PATH="/tmp/flutter/bin:$PATH"
   flutter run -d chrome \
     --dart-define=SUPABASE_URL=your-project-url \
     --dart-define=SUPABASE_ANON_KEY=your-anon-key
   ```
7. If you want to test the backend flow end-to-end, create a few services in the services table and then submit orders from the app.
