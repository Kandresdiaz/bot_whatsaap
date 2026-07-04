# WhatsApp Bot SaaS 🤖

Bot de WhatsApp 24/7 con IA que actúa como empleado real de cualquier negocio.

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js + Socket.io
- **IA**: Groq (Llama 3.1 - GRATIS)
- **Base de datos**: Supabase (PostgreSQL - GRATIS)
- **Frontend**: Next.js 14

## Inicio rápido

### 1. Backend
```bash
cd backend
npm install
# Editar .env con tus keys de Groq
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
- `SUPABASE_SERVICE_KEY` → Supabase Dashboard > Settings > API > service_role key
- `ADMIN_WHATSAPP` → Tu número sin + (ej: 573001234567)
- `ADMIN_PASSWORD` → Contraseña del admin

## Estructura
```
backend/     → API + WhatsApp bot engine
frontend/    → Dashboard usuario + Admin panel
```
