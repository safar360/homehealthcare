import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const demoCarePlan = [
  { title: 'Morning medication', time: '08:00', status: 'Scheduled' },
  { title: 'Vital signs check', time: '10:30', status: 'Upcoming' },
  { title: 'Physical therapy', time: '14:00', status: 'Upcoming' },
];

function App() {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('Connecting to Supabase...');

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('profiles').select('id').limit(1);
        if (error) {
          setMessage('Supabase connected. Configure your table and RLS policy to enable live patient data.');
        } else {
          setConnected(true);
          setMessage('Supabase is reachable.');
        }
      } catch {
        setMessage('Supabase is not configured yet. Add your project URL and anon key.');
      }
    };

    void checkConnection();
  }, []);

  return (
    <div className="app-shell">
      <header className="hero-card">
        <p className="eyebrow">Phase 1 • Patient App</p>
        <h1>Home Healthcare Patient Portal</h1>
        <p>
          A lightweight web-first experience for patients to view care plans, check appointments,
          and get ready for your first live rollout.
        </p>
        <div className="status-pill">{connected ? 'Live' : 'Setup'} • {message}</div>
      </header>

      <main className="content-grid">
        <section className="card">
          <h2>Today’s care plan</h2>
          <ul>
            {demoCarePlan.map((item) => (
              <li key={item.title}>
                <strong>{item.time}</strong> — {item.title} <span>• {item.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Next actions</h2>
          <ol>
            <li>Create a Supabase project and copy the URL and anon key.</li>
            <li>Create a profiles table and enable Row Level Security.</li>
            <li>Connect your first patient onboarding flow and appointment view.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}

export default App;
