---
name: botwaa_project
description: Documentación técnica completa de BotWA - bot de WhatsApp con IA para vender como SaaS. Incluye arquitectura, stack, flujo de la app, decisiones técnicas y anti-ban strategy. Activar cuando se pregunte sobre el proyecto, se quiera actualizar documentación, o se planeen nuevas features.
---

# BotWA — Documentación del Proyecto

> 📅 Última actualización manual: 2026-07-20
> 🤖 Las siguientes actualizaciones se generan automáticamente en cada `git push` via GitHub Actions.

## Qué es
SaaS de bots de WhatsApp con IA para negocios latinoamericanos (restaurantes, dentistas, consultorías, etc.).
- **Dueño del producto:** Kevin (admin@bot.com)
- **Clientes:** Negocios que pagan mensualidad para tener un bot que responde 24/7
- **URL live frontend:** https://bot-whatsaap.vercel.app
- **URL live backend:** https://bot-whatsaap-tkjd.onrender.com

---

## Stack técnico actual

### Frontend (Vercel — auto-deploy desde GitHub)
| Tecnología | Versión | Por qué |
|---|---|---|
| Next.js | 14+ | SSR + routing + deploy en Vercel |
| TypeScript | 5 | Tipos, menos bugs |
| CSS Variables | — | Dark mode azul/cyan, sin Tailwind |
| Socket.io client | — | Tiempo real para QR y mensajes |
| Inter (Google Fonts) | — | Tipografía premium |

### Backend (Render — keepalive con UptimeRobot cada 5 min)
| Tecnología | Versión | Por qué |
|---|---|---|
| Node.js + Express | 18 | Ligero, async, ideal para bots |
| **Baileys** | **7.0.0-rc13** | Protocolo WhatsApp multi-device directo, ~50MB RAM |
| Groq SDK | 0.5.0 | IA gratis — llama-3.3-70b-versatile + llama-3.1-8b-instant fallback |
| Socket.io | 4.7.5 | WebSockets para dashboard en tiempo real |
| Supabase JS | 2.45.0 | Cliente de base de datos |
| qrcode | 1.5.4 | Convierte string QR de Baileys a DataURL PNG |
| pino | 10.3.1 | Logger silencioso para Baileys |

### Base de datos (Supabase — Free)
| Tabla | Propósito |
|---|---|
| users | Clientes del SaaS (negocios) |
| businesses | Configuración de cada negocio (nombre, horario, personalidad, ciudad) |
| whatsapp_sessions | Estado de conexión WA por usuario + QR code |
| conversations | Chats activos con metadata |
| messages | Historial de mensajes + tokens Groq usados |
| knowledge_base | Contenido para RAG (texto, FAQ, PDF, imágenes) |
| appointments | Citas agendadas por el bot |
| payments | Registro de pagos manuales |

### Infraestructura
| Servicio | Plan | Costo | Nota |
|---|---|---|---|
| Vercel | Free | $0 | Auto-deploy GitHub, siempre activo |
| Render | Free | $0 | ⚠️ Duerme si no hay tráfico → keepalive con UptimeRobot |
| Supabase | Free | $0 | 500MB DB, 50MB storage |
| Groq | Free | $0 | 30 req/min, llama-3.3-70b |
| UptimeRobot | Free | $0 | Pinga /ping cada 5 min → servidor despierto |
| **Total** | | **$0/mes** | |

---

## Tema visual actual
- **Fondo:** `#080E1F` (navy oscuro)
- **Acento primario:** `#1A6BFF` → `#00CFFF` (azul océano + cyan)
- **Sin morado** — reemplazado completamente en julio 2026
- **Logo:** SVG inline — burbuja de chat + rayo IA en gradiente azul/cyan
- **Favicon:** `/public/favicon.svg` — mismo diseño del logo

---

## RAG con Groq (anti-alucinación)

```
Mensaje del cliente
    ↓
[Multi-Query RAG]
  1. Genera 2-3 sub-consultas alternativas con llama-3.1-8b-instant
  2. Busca en knowledge_base con TODAS las consultas
  3. Score por coincidencia (título = 2pts, contenido = 1pt)
  4. Top 6 chunks más relevantes
    ↓
[System Prompt con contexto real]
  - Solo responde con info del negocio
  - Si no está en knowledge base → "no tengo esa info"
  - Temperatura 0.2 (mínima alucinación)
    ↓
[llama-3.3-70b-versatile] (inteligente)
  → fallback a [llama-3.1-8b-instant] si falla
    ↓
Respuesta precisa en WhatsApp ✅
```

---

## Flujo de la app

### Para Kevin (admin)
```
1. Kevin crea cliente en /admin
2. Cliente recibe usuario + contraseña
3. Cliente entra al dashboard
4. Wizard onboarding: tipo negocio, nombre, horario, servicios
5. Conecta WhatsApp escaneando QR en /dashboard/connect
6. Sube info del negocio a Knowledge Base (texto/FAQ/PDF/imagen)
7. Bot activo 24/7 respondiendo con RAG
8. Kevin recibe alerta cuando hay lead caliente
9. Kevin registra pago manualmente (Nequi/transferencia)
10. Kevin activa/pausa clientes desde /admin
```

### Flujo de un mensaje entrante
```
WhatsApp → Baileys (protocolo directo, sin API de Meta)
  → messageHandler.js
    1. ¿Es grupo? → ignorar
    2. ¿Blacklist? → ignorar
    3. ¿Bot off? → notificar dueño
    4. ¿Rate limit (20/hora)? → ignorar
    5. ¿Fuera de horario? → mensaje away
    6. ¿Quiere cita? → flujo appointmentFlow.js
    7. RAG multi-query (sub-consultas + búsqueda knowledge base)
    8. IA Groq temperatura 0.2 (anti-alucinación máxima)
    9. ¿Lead caliente? → notificar Kevin por WA
   10. Delay random 800-2800ms (anti-ban humanizado)
   11. Responder + guardar en Supabase
   12. Emitir al dashboard via Socket.io
```

---

## Anti-ban strategy

| Medida | Implementada |
|---|---|
| Delay aleatorio 800-2800ms antes de responder | ✅ |
| Rate limit 20 mensajes/hora por contacto | ✅ |
| Ignorar grupos | ✅ |
| Solo responde a mensajes entrantes (nunca inicia) | ✅ |
| Nunca envía mensajes masivos | ✅ |
| Temperatura IA 0.2 (respuestas consistentes) | ✅ |
| Browser fingerprint: `['BotWA SaaS', 'Chrome', '120.0.0']` | ✅ |
| Versión WA hardcodeada (sin fetch externo) | ✅ |
| Sin whatsapp-web.js (Puppeteer) — solo Baileys directo | ✅ |

---

## Features actuales del dashboard

### Vista usuario (cliente del SaaS)
- `/dashboard` — Home con stats del bot
- `/dashboard/connect` — QR con diagnóstico del servidor + errores visibles
- `/dashboard/conversations` — Chats en tiempo real + toggle IA por conversación
- `/dashboard/appointments` — Citas agendadas por el bot
- `/dashboard/knowledge` — Texto / FAQ / PDF / Imágenes para RAG
- `/dashboard/bot-config` — Horarios, personalidad, mensajes

### Vista admin (Kevin)
- `/admin` — Stats globales + lista de clientes + estado de bots
- Registrar pagos (Nequi, transferencia, efectivo)
- Activar/pausar clientes
- Ver ingresos totales COP
- Botón `🤖 Modo Bot (Demo)` para ver la vista de cliente

---

## Precios del SaaS

| Plan | Precio COP/mes | USD aprox | Incluye |
|---|---|---|---|
| Básico | $29.900 | ~$7 | 1 número, 500 msgs/mes, 5 docs knowledge |
| Profesional | $79.900 | ~$20 | 1 número, ilimitado, 50 docs, dashboard |
| Negocio | $179.900 | ~$45 | 3 números, ilimitado, métricas |
| Agencia | $499.900 | ~$125 | 10 clientes, white label |

---

## Variables de entorno requeridas

### Backend (Render)
```
SUPABASE_URL=https://rptxtzrwoyuedbjzpqhp.supabase.co
SUPABASE_SERVICE_KEY=*** Supabase → Settings → API → service_role
GROQ_API_KEY=*** console.groq.com
ADMIN_PASSWORD=***
ADMIN_WHATSAPP=57XXXXXXXXXX
PORT=10000
RENDER_EXTERNAL_URL=https://bot-whatsaap-tkjd.onrender.com
FRONTEND_URL=https://bot-whatsaap.vercel.app
```

### Frontend (Vercel)
```
NEXT_PUBLIC_BACKEND_URL=https://bot-whatsaap-tkjd.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://rptxtzrwoyuedbjzpqhp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=***
```

### GitHub Secrets (para GitHub Actions)
```
RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-xxxxx?key=xxxxx
```

---

## CI/CD — GitHub Actions

### Workflow: `deploy-and-docs.yml`
Se ejecuta en cada `git push` a `main`:
1. **Job 1 — Deploy Render:** Llama al Deploy Hook de Render → redespliegue automático
2. **Job 2 — Update Docs:** Actualiza esta tabla de actualizaciones con el commit info

### Cómo activar el auto-deploy de Render:
1. Render Dashboard → tu servicio → Settings → **Deploy Hooks** → Create Hook
2. Copiar la URL del hook
3. GitHub repo → Settings → Secrets → `RENDER_DEPLOY_HOOK` = URL copiada
4. ✅ Desde ese momento, cada push redesploy automático

---

## Actualizaciones importantes

| Fecha | Cambio | Impacto |
|---|---|---|
| 2026-07-04 | Proyecto iniciado, Supabase configurado | Base |
| 2026-07-04 | Backend + Frontend iniciales MVP | MVP |
| 2026-07-05 | Deploy Render + Vercel | Live |
| 2026-07-06 | Anti-ban delays + rate limit | Seguridad |
| 2026-07-06 | Knowledge base con imágenes y PDF | Feature |
| 2026-07-06 | Sistema de citas automáticas | Feature |
| 2026-07-12 | Fix TypeScript errors | Estabilidad |
| **2026-07-13** | **Migración whatsapp-web.js → Baileys v7** | **Performance 10x** |
| 2026-07-19 | RAG multi-query con sub-consultas Groq | IA más precisa |
| 2026-07-19 | Tema azul/cyan — eliminado morado | Branding |
| 2026-07-19 | Logo SVG + favicon en pestaña | Branding |
| 2026-07-19 | Connect page con diagnóstico de servidor | UX |
| 2026-07-19 | index.js indestructible — sin crashes | Estabilidad |
| 2026-07-19 | Self-ping keepalive cada 10 min | Uptime |
| 2026-07-20 | GitHub Actions auto-deploy + auto-docs | CI/CD |
| 2026-07-20 | UptimeRobot activo cada 5 min | Uptime 24/7 |

---

| **2026-07-20** | ci: GitHub Actions auto-deploy Render + auto-docs SKILL.md en cada push (`c5391a7`) | Auto-deploy |

| **2026-07-20** | build: forzar redespliegue de Vercel (frontend) (`846b8ba`) | Auto-deploy |

| **2026-07-21** | fix: asegurar guardado explicito de estado 'connecting' al iniciar sesion Baileys (`f0f94d7`) | Auto-deploy |

| **2026-07-21** | feat: autogenerar QR inmediatamente al entrar a /dashboard/connect estilo WhatsApp Web (`ec6fb5e`) | Auto-deploy |

| **2026-07-21** | fix: agregar fallback en memoria para /api/sessions/status/:userId para evitar respuestas nulas (`083b707`) | Auto-deploy |

| **2026-07-21** | fix: retorno ultrarrápido de QR en memoria RAM si Supabase tarda en persistir (`e9d3f0f`) | Auto-deploy |

| **2026-07-21** | fix: asegurar registro instantaneo de la sesion en el mapa en memoria sessions (`c8349d7`) | Auto-deploy |

| **2026-07-21** | fix: manejar estado 'connecting' explícitamente en polling para evitar reseteos visuales (`7bdf93e`) | Auto-deploy |

## Próximas mejoras sugeridas

| Feature | Prioridad | Impacto |
|---|---|---|
| Wizard onboarding (5 preguntas al registrarse) | 🔴 Alta | Activación de clientes |
| Landing page pública con precios y demo | 🔴 Alta | Ventas |
| Configurar RENDER_DEPLOY_HOOK en GitHub Secrets | 🔴 Alta | CI/CD automático |
| Crear cliente desde admin UI (sin SQL) | 🔴 Alta | Operación |
| Persistencia sesiones Baileys en volumen/storage | 🟡 Media | Estabilidad |
| Analytics por conversación | 🟢 Baja | Valor percibido |

---

## Cómo actualizar este documento
**Automático:** Cada `git push` a `main` ejecuta el GitHub Action que agrega el commit a la tabla de actualizaciones.
**Manual:** Editar este archivo directamente para cambios estructurales grandes.
**Skill trigger:** Este archivo se activa cuando se habla del proyecto, se planean features o se quiere contexto técnico.
