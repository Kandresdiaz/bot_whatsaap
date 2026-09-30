// Origen de cada visitante: se guarda en la PRIMERA visita (first-touch) y se envía
// al backend cuando la persona se registra con Google.

const STORAGE_KEY = 'botwa_attribution';

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing_path?: string;
  first_visit_at?: string;
};

// Referrers que no dicen nada del origen real: nuestro propio dominio y el ida y vuelta del login con Google.
const IGNORED_REFERRER_HOSTS = ['accounts.google.com', 'supabase.co'];

export function captureAttribution() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const params = new URLSearchParams(window.location.search);
    const data: Attribution = {
      first_visit_at: new Date().toISOString(),
      landing_path: window.location.pathname,
    };
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
      const value = params.get(key);
      if (value) data[key] = value.slice(0, 100);
    }

    if (document.referrer) {
      const ref = new URL(document.referrer);
      const ignored = ref.host === window.location.host || IGNORED_REFERRER_HOSTS.some(h => ref.host.endsWith(h));
      if (!ignored) data.referrer = document.referrer.slice(0, 300);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
