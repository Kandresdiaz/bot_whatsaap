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
- `GEMINI_API_KEY` → https://aistudio.google.com/apikey (**gratis**, sin tarjeta en la mayoría de regiones). Lee los catálogos en PDF que son puras imágenes. Tiene límite por minuto y por día: el motor espacia las llamadas (`VISION_RPM`, por defecto 8) y, si se acaba la cuota del día, se detiene y guarda lo leído; al volver a subir el mismo PDF continúa donde quedó sin gastar IA en lo ya hecho. Opcional: `GEMINI_VISION_MODEL` (por defecto `gemini-2.5-flash`). Si existe, tiene prioridad sobre OpenRouter para leer catálogos.
- `OPENROUTER_API_KEY` → https://openrouter.ai/keys (visión: el bot interpreta las fotos que envían los clientes y lee los catálogos en PDF que son puras imágenes; sin esta clave las fotos se derivan a un asesor y esos catálogos no se pueden importar)
- `OPENROUTER_VISION_MODEL` → opcional, por defecto `google/gemini-2.5-flash`
- `SUPABASE_URL` → URL del proyecto Supabase
- `SUPABASE_SERVICE_KEY` → Supabase Dashboard > Settings > API > service_role key
- `MP_ACCESS_TOKEN` → Mercado Pago Developers (Producción: `APP_USR-...`, Sandbox: `TEST-...`)
- `ADMIN_WHATSAPP` → Tu número sin + (ej: 573001234567)
- `ADMIN_PASSWORD` → Contraseña del admin

## Importar un catálogo en PDF
En el panel, **Conocimiento → PDF**. Hay dos caminos y se usan los dos a la vez:
- **PDF con texto** (menús, listas de precios): se reparte en productos, FAQs e información del negocio.
- **PDF de puras imágenes** (catálogos de diseño, donde el nombre, el precio y la ficha técnica están dentro de la imagen): se saca la foto de cada página, el modelo de visión la lee y crea el producto **con su foto**, que queda publicada en el bucket `catalogo` de Supabase Storage para que el bot se la envíe al cliente. Tarda unos minutos y el avance se ve en la misma pantalla.

Lo que el negocio ya tenía configurado nunca se pisa: los nombres repetidos se descartan. Tope: 15 MB y 80 páginas por archivo.

## Estructura
```
backend/     → API + WhatsApp bot engine
frontend/    → Dashboard usuario + Admin panel
```
