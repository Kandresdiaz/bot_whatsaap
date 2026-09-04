# WhatsApp Bot SaaS 🤖

Bot de WhatsApp 24/7 con IA que actúa como empleado real de cualquier negocio.

## Stack
- **Backend**: Node.js + Express + Baileys v7 + Socket.io
- **IA**: Groq (Llama 3.3 70B + Llama 3.1 8B fallback)
- **Base de datos**: Supabase (PostgreSQL)
- **Pasarela de pagos**: Mercado Pago (Suscripciones PreApproval con 7 días de prueba gratis)
- **Frontend**: Next.js 14 + TypeScript

## Inicio rápido

### 1. Backend
```bash
cd backend
npm install
# Editar .env con tus keys
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno necesarias

### backend/.env
- `GROQ_API_KEY` → https://console.groq.com (gratis)
- `SUPABASE_URL` → URL del proyecto Supabase
- `SUPABASE_SERVICE_KEY` → Supabase Dashboard > Settings > API > service_role key
- `MP_ACCESS_TOKEN` → Mercado Pago Developers (Producción: `APP_USR-...`, Sandbox: `TEST-...`)
- `ADMIN_WHATSAPP` → Tu número sin + (ej: 573001234567)
- `ADMIN_PASSWORD` → Contraseña del admin

## Estructura
```
backend/     → API + WhatsApp bot engine
frontend/    → Dashboard usuario + Admin panel
```
