---
name: botwaa_project
description: Documentación técnica completa de BotWA - bot de WhatsApp con IA para vender como SaaS. Incluye arquitectura, stack, flujo de la app, decisiones técnicas y anti-ban strategy. Activar cuando se pregunte sobre el proyecto, se quiera actualizar documentación, o se planeen nuevas features.
---

# BotWA — Documentación del Proyecto

> 📅 Última actualización manual: 2026-08-23
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

## Precios del SaaS y Estructura de Funcionalidades

| Plan | Precio COP/mes | USD aprox | Flujos & Funcionalidades Clave |
|---|---|---|---|
| **Básico** | $120.000 | ~$30 | **1 Flujo a elegir (Vender O Agendar):** Captura de datos básicos (Nombre, Tel, Producto/Servicio), Respuestas RAG 24/7, 1 número WA, 20 docs FAQs. |
| **Profesional** | $250.000 | ~$62 | **Ambos Flujos Activos (Vender Y Agendar):** Catálogo interactivo de Productos/Servicios RAG + Agendador de Citas + Captura de Lead Caliente con alerta instantánea + 100 docs. |
| **Business / Agencia** | $450.000 | ~$112 | **Múltiples líneas & Adaptación por Nicho:** Múltiples números WA, White-label, Prompting y RAG a la medida (Done-For-You), Soporte Prioritario. |

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

| **2026-07-21** | fix: fusionar siempre el QR mas reciente de la memoria RAM con la respuesta de la base de datos (`9b21c4c`) | Auto-deploy |

| **2026-07-26** | chore: agregar fly.toml y Dockerfile para deploy alternativo en Fly.io (`eca733b`) | Auto-deploy |

| **2026-07-28** | chore: agregar archivo .replit para forzar ejecucion de backend en puerto 3001 (`f69bb58`) | Auto-deploy |

| **2026-07-28** | chore: agregar bloque deployment explicito en .replit para produccion (`83574ad`) | Auto-deploy |

| **2026-07-28** | perf: ultra-low RAM/CPU configuration for Baileys on Render Free Tier (`63a2103`) | Auto-deploy |

| **2026-07-28** | build: trigger Vercel frontend rebuild to sync with lightweight Render backend (`2545dc9`) | Auto-deploy |

| **2026-07-28** | fix: cargar rutas express directamente sin fallback 503 (`0c428bd`) | Auto-deploy |

| **2026-07-28** | fix: corregir SyntaxError de variable duplicada getSession en sessions.js (`24083e1`) | Auto-deploy |

| **2026-07-28** | fix: responder objeto de sesion desconectada en lugar de null en status endpoint (`cee8f8f`) | Auto-deploy |

| **2026-07-28** | fix: optimizar verificacion del servidor en frontend para evitar bloqueos CORS/cache (`3e99e69`) | Auto-deploy |

| **2026-07-28** | fix: sanitizar BACKEND URL eliminando slashes duplicados y asegurar HTTPS directo (`741f656`) | Auto-deploy |

| **2026-07-28** | fix: descartar replit.app de NEXT_PUBLIC_BACKEND_URL y forzar Render en frontend (`80cb422`) | Auto-deploy |

| **2026-07-28** | fix: hardcodear URL oficial de Render en frontend para ignorar variables de Replit en Vercel (`0341029`) | Auto-deploy |

| **2026-07-28** | fix: hardcodear URL de Render en todos los componentes del frontend y invalidar cache de Vercel (`f7c4b15`) | Auto-deploy |

| **2026-07-28** | chore: bump layout version 1.0.6 for Vercel edge cache purge (`2de074d`) | Auto-deploy |

| **2026-07-29** | fix: corregir sintaxis de llaves en ServerStatus de page.tsx (`a19256e`) | Auto-deploy |

| **2026-07-29** | fix: asegurar inicializacion de Baileys socket y guardado de memoria RAM (`1690eb9`) | Auto-deploy |

| **2026-07-29** | fix: hardcodear URL de Render en admin, citas, config, conversaciones y knowledge pages (`cc1d61b`) | Auto-deploy |

| **2026-08-13** | fix: resolver problema de generacion de QR, limpieza de credenciales e integracion Baileys (`42cbb50`) | Auto-deploy |

| **2026-08-13** | feat: sincronizar todos los chats y contactos de WhatsApp al conectar Baileys (`b75ac3a`) | Auto-deploy |

| **2026-08-13** | fix: mejorar fallback de SUPABASE_ANON_KEY en db/supabase.js (`4dcca69`) | Auto-deploy |

| **2026-08-13** | fix: vincular session_id UUID para guardar y mostrar todas las conversaciones en el dashboard (`b597ab4`) | Auto-deploy |

| **2026-08-13** | feat: auto-redireccionar a conversaciones tras conectar WhatsApp exitosamente (`0b8180a`) | Auto-deploy |

| **2026-08-13** | fix: resolver mapeo de getSessionUuid para soportar tanto ID de sesion UUID como userId admin y mostrar conversaciones (`c72b426`) | Auto-deploy |

| **2026-08-13** | fix: mejorar resolucion de getSession para evitar error 400 en sync (`6ec39b8`) | Auto-deploy |

| **2026-08-13** | feat: auto-sincronizar chats previos de WhatsApp y auto-actualizar frontend al conectar QR (`5630825`) | Auto-deploy |

| **2026-08-13** | fix: emitir eventos de conexión Baileys inmediatamente sin bloqueos async (`272db5c`) | Auto-deploy |

| **2026-08-13** | feat: capturar eventos append, chats.update y contacts.update de Baileys para descargar historial completo (`99cfd29`) | Auto-deploy |

| **2026-08-13** | fix: forzar reconexión limpia al escanear QR para sincronizar historial completo e id de sesión consistente (`22413f6`) | Auto-deploy |

| **2026-08-13** | feat: agregar boton de re-vinculacion con QR fresco para forzar descarga del historial de WhatsApp (`2ff9626`) | Auto-deploy |

| **2026-08-13** | fix: capturar eventos chats.set, contacts.set y messages.set de Baileys para garantizar descarga de chats (`269b64c`) | Auto-deploy |

| **2026-08-15** | feat: auto-sincronizar chats estilo WhatsApp Web, toggle por chat personal y boton maestro global de bot (`a6e0bee`) | Auto-deploy |

| **2026-08-15** | fix: corregir flujo de desconexion manual y evitar auto-reconexion en bucle al pedir QR (`4a371c7`) | Auto-deploy |

| **2026-08-15** | fix: corregir restriccion sent_by SQL y asegurar sincronizacion de conversaciones en QR (`e218a69`) | Auto-deploy |

| **2026-08-15** | fix: corregir orden de argumentos en emitToUserRooms y permitir consulta de conversaciones por multiples session_ids (`4eb5b6a`) | Auto-deploy |

| **2026-08-15** | fix: usar Browsers.ubuntu('Chrome') para forzar la sincronizacion de historial de WhatsApp Multi-Device (`9918455`) | Auto-deploy |

| **2026-08-15** | fix: resolver RangeError Invalid time value en timestamps Long de Baileys al sincronizar historial (`b1d1807`) | Auto-deploy |

| **2026-08-15** | fix: procesar y sincronizar a DB todos los lotes de mensajes entrantes e historial sin importar el tipo de evento (`621ebb8`) | Auto-deploy |

| **2026-08-15** | fix: proteger endpoints de conversaciones contra 502 Bad Gateway y remover bloqueos (`ccb8227`) | Auto-deploy |

| **2026-08-15** | fix: eliminar bucle infinito de peticiones HTTP en frontend que provocaba ERR_INSUFFICIENT_RESOURCES (`dc753f0`) | Auto-deploy |

| **2026-08-15** | feat: agregar callback getMessage en Baileys v7 para descifrado completo de historial (`007706f`) | Auto-deploy |

| **2026-08-15** | build: forzar redespliegue de Render para sincronizacion WhatsApp (`017209f`) | Auto-deploy |

| **2026-08-15** | build: forzar deploy en Render para sanidad de contactPhone (`cf909e4`) | Auto-deploy |

| **2026-08-15** | fix: consulta de conversaciones amplia con fallback global para asegurar despliegue de chats (`f84f736`) | Auto-deploy |

| **2026-08-15** | build: forzar redespliegue en Render para indizacion limpia (`8d88a64`) | Auto-deploy |

| **2026-08-15** | fix: consultar de forma exhaustiva los IDs de sesion del usuario en el frontend para desplegar chats inmediatamente (`bea7abd`) | Auto-deploy |

| **2026-08-15** | build: forzar deploy de Render con huella Desktop (`7bd0065`) | Auto-deploy |

| **2026-08-16** | feat: agregar funcion de Abrir Nuevo Chat por numero y optimizar boton de sincronizacion forzada (`0c699d7`) | Auto-deploy |

| **2026-08-16** | build: forzar deploy en Render para sincronizacion de contactos automatica (`ba94dc8`) | Auto-deploy |

| **2026-08-16** | build: forzar deploy de Render para restauracion de QR (`8c18ee0`) | Auto-deploy |

| **2026-08-16** | fix: redireccion automatica acelerada y sondeo a 2s para despliegue instantaneo de chats sin tocar nada (`9653360`) | Auto-deploy |

| **2026-08-16** | fix: corregir fingerprint de browser Baileys a Ubuntu Chrome para evitar error 428 y asegurar generacion limpia de QR (`b250b50`) | Auto-deploy |

| **2026-08-16** | fix: asegurar sincronizacion y despliegue instantaneo de chats al escanear QR y eliminar consultas UUID invalidas (`c16f52c`) | Auto-deploy |

| **2026-08-16** | fix: auto-restaurar credenciales Baileys en disco y mejorar experiencia de sincronizacion de chats (`6d9a5ac`) | Auto-deploy |

| **2026-08-16** | fix: insercion individual indestructible de historial Baileys y retries secuenciales al conectar QR (`5c954a5`) | Auto-deploy |

| **2026-08-16** | feat: tiempo real 100% automatico en lista de conversaciones al conectar QR y recibir mensajes estilo WhatsApp Web (`61e165f`) | Auto-deploy |

| **2026-08-16** | fix: resolver anulacion falsa de estado conectado en sessions status y auto-iniciar Baileys al consultar conversaciones (`af64df9`) | Auto-deploy |

| **2026-08-16** | feat: desactivar bot global por defecto al conectar (desactivado en pruebas) (`e398711`) | Auto-deploy |

| **2026-08-16** | fix: cambiar huella Baileys a macOS Desktop para forzar envio del historial completo de chats de WhatsApp Multi-Device al escanear QR (`9d74507`) | Auto-deploy |

| **2026-08-16** | feat: implementar respaldo y auto-restauracion de credenciales Baileys en Supabase session_data (`a9ce99a`) | Auto-deploy |

| **2026-08-16** | fix: asegurar ejecucion incondicional de loadConversations y sondeo continuo de chats en frontend (`f2b7c51`) | Auto-deploy |

| **2026-08-16** | perf: hacer que /api/sessions/start espere el QR generado y lo retorne directamente en la respuesta HTTP para renderizado instantaneo (`9770497`) | Auto-deploy |

| **2026-08-16** | fix: prevenir restauracion involuntaria de credenciales caducadas de Supabase cuando se solicita nuevo QR y usar fingerprint Ubuntu Chrome (`90a05e0`) | Auto-deploy |

| **2026-08-16** | fix: asegurar persistencia inmediata de nuevas conversaciones en Supabase y envio seguro de mensajes con UUIDs reales (`9b5ac6d`) | Auto-deploy |

| **2026-08-17** | feat: fusionar memoria RAM de Baileys con DB para desplegar chats inmediatamente en vivo en la interfaz (`7383653`) | Auto-deploy |

| **2026-08-17** | fix: decodificar timestamps de Baileys con precision y ordenar chats exactamente como WhatsApp Web con el ultimo mensaje arriba (`c36890b`) | Auto-deploy |

| **2026-08-17** | feat: incluir vista previa del ultimo mensaje y sincronizar fecha real del chat mas reciente estilo WhatsApp Web (`8eeb2dc`) | Auto-deploy |

| **2026-08-17** | fix: eliminar saltos de la lista de conversaciones y garantizar despliegue completo de mensajes al hacer clic (`1d61c2e`) | Auto-deploy |

| **2026-08-17** | fix: corregir envio de mensajes por WhatsApp en todos los chats y agregar notificacion de enviado correctamente (`818b431`) | Auto-deploy |

| **2026-08-17** | fix: prevenir auto-reconexion e inicio automatico no deseado de sesion al hacer clic en Desconectar (`03b338e`) | Auto-deploy |

| **2026-08-17** | fix: asegurar deteccion instantanea de sesion conectada al enviar mensajes y eliminar banner falso de QR (`97062cb`) | Auto-deploy |

| **2026-08-18** | fix: sanitizar sufijos de dispositivo en JID de WhatsApp y formatear numeros/nombres estilo WhatsApp Web (`f72d35a`) | Auto-deploy |

| **2026-08-18** | fix: envio indestructible de mensajes con auto-reconexion, reintentos y soporte de grupos JID sin bloqueo DB (`9043a34`) | Auto-deploy |

| **2026-08-18** | perf: optimizar tiempo real 0ms via WebSockets y eliminar sobrecarga de red para evitar lentitud (`0bcf81a`) | Auto-deploy |

| **2026-08-18** | fix: procesar incondicionalmente todos los mensajes entrantes de clientes y limpiar JID con cleanPhoneFromJid (`9e7d9cf`) | Auto-deploy |

| **2026-08-18** | fix: persistencia 100% indestructible de claves de sesion Baileys en Supabase para evitar perdida de sesion en Render (`6b24151`) | Auto-deploy |

| **2026-08-18** | fix: corregir eliminacion accidental de credenciales en createSession e ignorar columnas inexistentes en safeUpsert (`3149b67`) | Auto-deploy |

| **2026-08-18** | fix: actualizar burbujas del chat activo instantaneamente sin requerir hacer clic a otra conversacion (`20bfbde`) | Auto-deploy |

| **2026-08-18** | fix: eliminar lag en input con useMemo y usar activeSock directamente en sendMessage con ventana de 10s (`3773346`) | Auto-deploy |

| **2026-08-18** | perf: optimizar tiempo de respuesta al cargar chats y persistir last_message (`52d0499`) | Auto-deploy |

| **2026-08-21** | feat: experiencia WhatsApp Web completa en contactos y solucion a envio de mensajes (`87dc4e5`) | Auto-deploy |

| **2026-08-21** | fix: resolucion de LIDs de WhatsApp, nombres de contacto reales y envio infalible de mensajes (`c5fbf27`) | Auto-deploy |

| **2026-08-21** | fix: huella macOS Desktop para forzar sincronizacion del historial de WhatsApp y corregir formateo de numeros (`f343d02`) | Auto-deploy |

| **2026-08-21** | fix: restaurar huella Ubuntu Chrome y registro multi-alias en RAM para generacion instantanea de QR (`9389aaf`) | Auto-deploy |

| **2026-08-21** | fix: sincronizacion inmediata de estado conectado en RAM para todos los alias de usuario y auto-start en connect page (`b911c8f`) | Auto-deploy |

| **2026-08-21** | fix: cargar incondicionalmente todas las conversaciones de DB y proteger filtro en frontend (`ba6cfd3`) | Auto-deploy |

| **2026-08-21** | fix: requerir clic manual para solicitar nuevo QR al estar desconectado (`678b028`) | Auto-deploy |

| **2026-08-22** | feat: adaptacion responsive completa para celulares y pantallas pequeñas con prevencion de desbordamiento (`cbfccbf`) | Auto-deploy |

| **2026-08-22** | fix: resolucion de LIDs en sync, despliegue continuo de conversaciones y envio de mensajes sin afectar QR (`15feb11`) | Auto-deploy |

| **2026-08-22** | fix: 5 bugs criticos - sessionUuid garantizado antes de messaging-history.set, eliminar business_id y last_message de inserts, consulta correcta de conversaciones por user_id (`3adf7f5`) | Auto-deploy |

| **2026-08-22** | fix: frontend websocket connection stability and room join (`ba042f3`) | Auto-deploy |

| **2026-08-22** | fix: badge de estado real y banner para indicar vincular WhatsApp con QR (`973743a`) | Auto-deploy |

| **2026-08-22** | fix: syncChatsAndMessagesToDb preserva conversaciones historicas unificando todas las sesiones del usuario (`3151e23`) | Auto-deploy |

| **2026-08-22** | feat: diagnostico en vivo /debug-info y aviso claro de estado de vinculación en pantalla de chats (`57d1133`) | Auto-deploy |

| **2026-08-22** | fix: reemplazar maybeSingle por limit(1) en /create para garantizar respuesta 200 en endpoint de conversaciones (`9181f52`) | Auto-deploy |

| **2026-08-23** | feat: boton directo de nuevo chat instantaneo y fallback indestructible (`f3168ba`) | Auto-deploy |

| **2026-08-23** | fix: exportar resolvePhoneAndJid en sessionManager para desbloquear la fusion de los 3294 chats de RAM (`2a02c6b`) | Auto-deploy |

| **2026-08-23** | fix: restoreSessions recupera credenciales desde Supabase tras reinicios de servidor efimero Render (`0ddd79d`) | Auto-deploy |

| **2026-08-23** | fix: saneamiento de sufijos de dispositivo :12 y LIDs en mensajes para abrir chats e historial completo al 100% (`c2ae84a`) | Auto-deploy |

| **2026-08-23** | fix: cargar los 500 mensajes mas recientes hasta el dia de hoy ordenados por timestamp descendente (`43d2997`) | Auto-deploy |

| **2026-08-23** | fix: limpieza instantanea de mensajes al cambiar de chat y sincronizacion estricta por ref de conversacion activa (`009ef86`) | Auto-deploy |

| **2026-08-23** | fix: resolucion directa por contact_phone para garantizar guardado de mensajes recientes en Supabase (`2e63e8a`) | Auto-deploy |

| **2026-08-23** | fix: corregir ordenamiento cronologico de mensajes de a.timestamp - b.timestamp para colocar los mensajes mas recientes abajo del todo (`ccc3ef7`) | Auto-deploy |
| **2026-08-23** | feat: Onboarding Wizard flotante minimalista de 4 pasos antes de conectar QR (Vender vs Agendar Citas) + Botón de Generación de FAQs con IA a demanda en Knowledge Base | Feature |

| **2026-08-23** | docs: actualizar documentacion tecnica del proyecto BotWA con arquitectura de resiliencia SaaS (`20e10f4`) | Auto-deploy |

| **2026-08-23** | feat: implementar modulo de cola asincrona hibrida Redis + memoria (messageQueue.js) para colapso y alto trafico (`0f9049f`) | Auto-deploy |

| **2026-08-23** | feat: Onboarding Wizard minimalista flotante de 4 pasos antes de conectar WA y boton de Generador de FAQs con IA a demanda (`c2098be`) | Auto-deploy |

| **2026-08-25** | feat: flujo de onboarding intuitivo 1-2-3 tras escanear QR con acceso directo al Wizard de preguntas del negocio (`93e2f79`) | Auto-deploy |

| **2026-08-25** | feat: modulo completo de Catalogo de Productos y Servicios con RAG anti-alucinacion e interfaz interactiva CRUD (`9ee5b14`) | Auto-deploy |

| **2026-08-25** | feat: actualizar logo y favicon de la pestana con la Opcion 1 (Chat Bubble con Rayo IA) (`9297db0`) | Auto-deploy |

| **2026-08-25** | fix: corregir formato de favicon.ico en RGBA para compatibilidad total de compilacion (`36aa788`) | Auto-deploy |

| **2026-08-25** | style: optimizaciones de adaptabilidad ultra-responsive para celulares de cualquier tamaño (`61ee0ce`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`7d8379e`) | Auto-deploy |

| **2026-08-26** | fix: resolver error 404 en ruta /admin/clients del panel admin (`224d17a`) | Auto-deploy |

| **2026-08-26** | feat: estructurar panel admin con rutas independientes para Dashboard, Clientes y Pagos (`a47eca7`) | Auto-deploy |

| **2026-08-26** | fix: PKCE exchangeCodeForSession en callback de Google Auth (`9415935`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`f75c189`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`05254ac`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`8e2fc9c`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`afe248b`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`07cae30`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`dca0e4e`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`ce21772`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`d79ae27`) | Auto-deploy |

| **2026-08-26** | Merge branch 'main' of https://github.com/Kandresdiaz/bot_whatsaap (`ff4e4ed`) | Auto-deploy |

| **2026-08-26** | fix: complete mobile responsive layout fixes, mobile topbar menu and button word wrapping (`983cd4e`) | Auto-deploy |

| **2026-08-26** | fix(ui): polish button labels and single-line button styling for mobile (`e2d990c`) | Auto-deploy |

| **2026-08-26** | fix(ui): ensure full text visibility on mobile buttons with full width layout (`db9e0f5`) | Auto-deploy |

| **2026-08-26** | fix(ui): re-order header and action containers into vertical stacks for mobile (`a49592a`) | Auto-deploy |

| **2026-08-26** | fix(ui): enforce full width stacked layout for buttons and chat header actions on mobile (`b2cacf1`) | Auto-deploy |

| **2026-08-26** | fix: estrictamiento del aislamiento multi-tenant por business.id (`b5a4891`) | Auto-deploy |

| **2026-08-26** | feat: persistencia de configuracion del bot y panel de seleccion al desconectar WhatsApp (`4e9bf67`) | Auto-deploy |

| **2026-08-26** | fix: mejorar resiliencia de Groq AI con fallback de negocio y endpoint test-groq (`e96a0cb`) | Auto-deploy |

| **2026-08-26** | fix: eliminar mensajes de error técnico y forzar siempre respuestas de asistente humano con catálogo y 5 modelos Groq de respaldo (`f9b6188`) | Auto-deploy |

| **2026-08-26** | feat: alertas internas silenciosas para admin (notifySystemAlert) manteniendo atencion humana impecable al cliente final (`6573f0b`) | Auto-deploy |

| **2026-08-26** | debug: add detailed Groq API test diagnostic endpoint (`0d2b0e9`) | Auto-deploy |

| **2026-08-26** | fix: desinfectar API Key de Groq y formatear catalogo real en respuestas de asistente (`59d4a87`) | Auto-deploy |

| **2026-08-26** | fix: resolver 'admin' y cualquier id en resolveBusinessId para desplegar productos en la vista de Productos y Servicios (`74e4358`) | Auto-deploy |

| **2026-08-26** | fix(ui): mostrar configuracion activa mantenida y eliminar preguntas innecesarias al conectar (`03fee52`) | Auto-deploy |

| **2026-08-26** | fix: eliminar sintaxis PostgREST .or invalida en products.js para asegurar desplegado de productos 200 OK (`66ba453`) | Auto-deploy |

| **2026-08-26** | chore: sync local files and test-groq updates (`343d116`) | Auto-deploy |

| **2026-08-26** | fix: update Groq active model IDs list to include llama-3.1-70b-versatile and mixtral (`23b8ca3`) | Auto-deploy |

| **2026-08-26** | feat: registrar planes 120k/250k/450k en Supabase, vista dashboard y captura de leads RAG (`74f943b`) | Auto-deploy |

| **2026-08-26** | fix: corregir useEffect y fallback de carga de productos en frontend para despliegue instantaneo en Vercel (`3967dcd`) | Auto-deploy |

| **2026-08-26** | feat: auto-sembrar productos y base de conocimiento por defecto en Supabase para cualquier usuario/negocio (`0e13df7`) | Auto-deploy |

| **2026-08-26** | feat: vincular usuario Google de Kevin como Super Admin relacional con productos y negocio en Supabase (`7740298`) | Auto-deploy |

| **2026-08-26** | fix: resolver business_id relacional con fallback a catalogos por defecto en productos y KB (`22ab26c`) | Auto-deploy |

| **2026-08-26** | debug: simplificar consulta Supabase de productos y retornar count/totalInDb para diagnostico (`1d62792`) | Auto-deploy |

| **2026-08-26** | fix: asegurar fallback total e infalible para productos y base de conocimiento en backend (`4e0d844`) | Auto-deploy |

| **2026-08-26** | fix: sanitizar credenciales de Supabase en backend y asegurar salvaguarda total de datos en frontend (`82391d6`) | Auto-deploy |

| **2026-08-26** | fix(config): fallback business fetch and sync categories and persuasivo personality (`044e0bf`) | Auto-deploy |

| **2026-08-26** | fix(business): validate UUIDs before querying Supabase to prevent 22P02 Postgres errors (`a49af7d`) | Auto-deploy |

| **2026-08-27** | chore: cleanup test files (`e80c95d`) | Auto-deploy |

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
