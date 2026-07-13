---
name: botwaa_project
description: Documentación técnica completa de BotWA - bot de WhatsApp con IA para vender como SaaS. Incluye arquitectura, stack, flujo de la app, decisiones técnicas y anti-ban strategy. Activar cuando se pregunte sobre el proyecto, se quiera actualizar documentación, o se planeen nuevas features.
---

# BotWA — Documentación del Proyecto

## Qué es
SaaS de bots de WhatsApp con IA para negocios colombianos.
- **Dueño del producto:** Kevin (admin)
- **Clientes:** Negocios que pagan mensualidad para tener un bot que responde 24/7
- **URL live:** bot-whatsaap.vercel.app

---

## Stack técnico actual

### Frontend
| Tecnología | Versión | Por qué |
|---|---|---|
| Next.js | 16 | SSR + routing + deploy en Vercel |
| TypeScript | 5 | Tipos, menos bugs |
| CSS Variables | — | Dark mode, sin Tailwind |
| Socket.io client | — | Tiempo real para QR y mensajes |

### Backend
| Tecnología | Versión | Por qué |
|---|---|---|
| Node.js + Express | 18 | Ligero, async, ideal para bots |
| **Baileys** | **7.0.0-rc13** | Protocolo WhatsApp multi-device directo, ~50MB RAM por sesión |
| Groq SDK | — | IA gratis (llama-3.1-8b-instant) |
| Socket.io | — | WebSockets para dashboard en tiempo real |
| Supabase JS | — | Cliente de base de datos |

### Base de datos
| Tabla | Propósito |
|---|---|
| users | Clientes del SaaS (negocios) |
| businesses | Configuración de cada negocio |
| whatsapp_sessions | Estado de conexión WA por usuario |
| conversations | Chats activos |
| messages | Historial de mensajes |
| knowledge_base | Contenido para alimentar la IA |
| appointments | Citas agendadas por el bot |
| payments | Registro de pagos manuales |

### Infraestructura
| Servicio | Plan | Costo |
|---|---|---|
| Vercel | Free | $0 |
| Render | Free | $0 |
| Supabase | Free | $0 |
| Groq | Free | $0 |
| UptimeRobot | Free | $0 |
| **Total** | | **$0/mes** |

---

## Flujo de la app

### Para Kevin (admin)
```
1. Kevin crea cliente en /admin
2. Cliente recibe usuario + contraseña
3. Cliente entra al dashboard
4. Conecta su WhatsApp (escanea QR)
5. Configura el bot (horarios, personalidad, mensajes)
6. Sube información del negocio a Knowledge Base
7. Bot activo 24/7 respondiendo
8. Kevin recibe alerta cuando hay lead caliente
9. Kevin registra pago manualmente (Nequi/transferencia)
10. Kevin activa/pausa clientes desde /admin
```

### Flujo de un mensaje entrante
```
WhatsApp → Baileys (protocolo directo)
  → messageHandler.js
    1. ¿Es grupo? → ignorar
    2. ¿Blacklist? → ignorar  
    3. ¿Bot off? → notificar dueño
    4. ¿Rate limit (20/hora)? → ignorar
    5. ¿Fuera de horario? → mensaje away
    6. ¿Quiere cita? → flujo appointmentFlow.js
    7. IA Groq (temperatura 0.3, solo usa knowledge base)
    8. ¿Lead caliente? → notificar Kevin por WA
    9. Delay 1-3s (anti-ban)
   10. Responder + guardar en Supabase
   11. Emitir al dashboard (Socket.io)
```

---

## Nuestra arquitectura vs Evolution API

### Evolution API
```
[Tu código] → HTTP → [Evolution API server] → Baileys → WhatsApp
                ↑ servicio Docker separado
                ↑ latencia extra
                ↑ más infraestructura
                ↑ dependes de su API pública
```

### BotWA (nuestro)
```
[Express + Baileys] → WhatsApp
      ↑ todo en uno
      ↑ sin intermediario
      ↑ tú controlas el código completo
      ↑ más rápido
      ↑ misma tecnología base
```

**BotWA = Evolution API + Dashboard + IA + Citas integrado en un solo proyecto.**

---

## Anti-ban strategy actual

| Medida | Implementada |
|---|---|
| Delay aleatorio 1-3s antes de responder | ✅ |
| Rate limit 20 mensajes/hora por contacto | ✅ |
| Ignorar grupos | ✅ |
| Solo responde cuando el cliente escribe primero | ✅ |
| Nunca envía mensajes masivos | ✅ |
| Temperatura IA 0.3 (respuestas consistentes) | ✅ |
| Browser fingerprint: `['BotWA', 'Chrome', '120.0']` | ✅ |

**Riesgo real:** Bajo-medio. El bot solo responde a mensajes entrantes,
nunca inicia conversaciones. Comportamiento idéntico a un humano respondiendo.

---

## Features actuales del dashboard

### Vista usuario (cliente)
- `/dashboard` — Home con estado del bot
- `/dashboard/connect` — QR para conectar WhatsApp
- `/dashboard/conversations` — Todos los chats + toggle IA por chat
- `/dashboard/appointments` — Citas agendadas por el bot
- `/dashboard/knowledge` — Texto / FAQ / PDF / Imágenes para la IA
- `/dashboard/bot-config` — Horarios, personalidad, mensajes

### Vista admin (Kevin)
- `/admin` — Stats + lista de clientes + estado de bots
- Registrar pagos (Nequi, transferencia, efectivo)
- Activar/pausar clientes
- Ver ingresos totales COP

---

## Precios actuales del SaaS

| Plan | Precio COP/mes | Incluye |
|---|---|---|
| Starter | $75.000 | 1 número, bot básico |
| Pro | $160.000 | 1 número, citas + analytics |
| Business | $320.000 | Multi-usuario, soporte prioritario |

---

## Variables de entorno requeridas

### Backend (Render)
```
SUPABASE_URL=https://rptxtzrwoyuedbjzpqhp.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=*** conseguir en Supabase → Settings → API → service_role
GROQ_API_KEY=*** conseguir en console.groq.com
ADMIN_PASSWORD=admin123
ADMIN_WHATSAPP=57XXXXXXXXXX
PORT=3001
FRONTEND_URL=https://bot-whatsaap.vercel.app
```

### Frontend (Vercel)
```
NEXT_PUBLIC_BACKEND_URL=https://bot-whatsaap-tkjd.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://rptxtzrwoyuedbjzpqhp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_ADMIN_KEY=admin123
```

---

## Actualizaciones importantes realizadas

| Fecha | Cambio | Impacto |
|---|---|---|
| 2026-07-04 | Proyecto iniciado, Supabase configurado | Base |
| 2026-07-04 | Backend + Frontend iniciales | MVP |
| 2026-07-05 | Deploy Render + Vercel | Live |
| 2026-07-06 | Anti-ban delays + rate limit | Seguridad |
| 2026-07-06 | Knowledge base con imágenes | Feature |
| 2026-07-06 | Sistema de citas automáticas | Feature |
| 2026-07-12 | Fix TypeScript errors | Estabilidad |
| **2026-07-13** | **Migración whatsapp-web.js → Baileys v7** | **Performance 10x** |

---

## Próximas mejoras sugeridas

| Feature | Prioridad | Impacto |
|---|---|---|
| Landing page pública con precios | 🔴 Alta | Ventas |
| Crear cliente desde admin (sin SQL) | 🔴 Alta | Operación |
| Cambio de color morado → verde/otro | 🟡 Media | Branding |
| Persistencia de sesiones Baileys en Supabase Storage | 🟡 Media | Estabilidad |
| Analytics por conversación | 🟢 Baja | Valor percibido |
| Webhook para notificaciones | 🟢 Baja | Integraciones |

---

## Cómo actualizar este documento
Cuando se implemente una feature importante, actualizar la tabla
"Actualizaciones importantes" y "Features actuales" arriba.
