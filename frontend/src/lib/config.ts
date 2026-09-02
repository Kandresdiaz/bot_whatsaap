export const getBackendUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (envUrl && !envUrl.includes('replit.app')) {
    return envUrl.replace(/\/$/, '');
  }
  return 'https://bot-whatsaap-tkjd.onrender.com';
};

export const BACKEND_URL = getBackendUrl();
