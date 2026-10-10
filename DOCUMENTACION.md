# 📚 Documentación Interna: BotWA SaaS 🤖

> Documento **interno** (no se entrega al cliente). Para vender, usar la página de precios: https://bot-whatsaap.vercel.app/pricing

**BotWA** es una plataforma SaaS B2B de atención al cliente con Inteligencia Artificial para WhatsApp, pensada para negocios latinoamericanos (restaurantes, clínicas, consultorios, tiendas online, agencias de servicios, inmobiliarias, etc.).

---

## 🎯 ¿Qué hace BotWA?

El dueño del negocio conecta su número de WhatsApp escaneando un código QR y activa un asistente con IA que responde 24/7:

1. **Atención al cliente 24/7:** responde al instante preguntas frecuentes, horarios, ubicación, medios de pago y políticas.
2. **Responde solo con la información del negocio (RAG):** la IA usa únicamente lo que el negocio cargó (menús, PDFs, FAQs, servicios, precios). Si no tiene el dato, lo dice y deriva a un asesor en lugar de inventar.
3. **Agendamiento de citas:** guía al cliente paso a paso por WhatsApp para reservar turnos y los registra en el panel.
4. **Catálogo y pedidos:** muestra productos, precios y disponibilidad, y registra pedidos.
5. **Avisos al dueño:** notifica por WhatsApp y correo cuando un cliente quiere comprar o agenda una cita.
6. **Panel web:** mensajes, pedidos pendientes, citas, conversaciones en vivo y botón para pausar/activar el bot.

---

## 🏗️ Arquitectura y stack

- **Frontend (Next.js 16 + React 19 + TypeScript)** — desplegado en Vercel (`bot-whatsaap.vercel.app`).
  - `frontend/vercel.json` reenvía `/api`, `/socket.io` y `/ping` al backend (proxy), así el panel en https puede hablar con el backend en http.
  - Socket.io (por polling a través del proxy) para QR en vivo, chat en tiempo real y contadores de pedidos/citas.
- **Backend (Node.js 20 + Express)** — corre en **Wispbyte** (plan gratis, 512 MB RAM).
  - WhatsApp mediante **Baileys v7** (multi-device, sin Puppeteer).
  - Correos con **Nodemailer** y tareas programadas con `node-cron` (renovaciones, avisos).
- **IA (Groq):** elige automáticamente entre los modelos disponibles (`qwen`, `gpt-oss`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, …) con respaldo si uno falla. Temperatura 0.2.
- **Base de datos (Supabase PostgreSQL):** tablas `users`, `businesses`, `whatsapp_sessions`, `conversations`, `messages`, `knowledge_base`, `products_services`, `appointments`, `payments`.
- **Pagos:** Mercado Pago (suscripciones PreApproval).

---

## 💎 Planes y precios

| Plan | Mensajes IA / mes | Incluye | Precio |
| :--- | :---: | :--- | :---: |
| **Vendedor Automático** | **1.500** | 1 línea de WhatsApp, atención 24/7, catálogo con IA, conversaciones en vivo en el panel, hasta 20 documentos/FAQs | **$120.000 COP / mes** |
| **Máquina de Ventas Pro** ⭐ | **5.000** | Todo lo anterior + envío de fotos del catálogo, agendador de citas y pedidos, generador de FAQs con IA, hasta 100 documentos | **$249.000 COP / mes** |
| **Dominio Agencia / VIP** | **20.000** | Varias líneas de WhatsApp, marca blanca, configuración a la medida, conocimiento ilimitado, soporte 1 a 1 | **$490.000 COP / mes** |

- **7 días de prueba gratis ($0 COP hoy):** se registra la tarjeta y el cobro automático ocurre al 7.º día vía Mercado Pago. Mercado Pago puede hacer una retención temporal de verificación (~$4.000 COP) que se reembolsa sola.
- **Tope durante la prueba:** 150 mensajes IA en los 7 días, para proteger la cuota de la API.
- **Enlace de cierre:** en ventas por WhatsApp la IA envía https://bot-whatsaap.vercel.app/pricing

Fuente de verdad: `frontend/src/app/pricing/page.tsx` (precios y características) y `backend/src/routes/billing.js` (`PLAN_LIMITS`). Si se cambia un plan, actualizar ambos y este documento.

---

## ⚡ Alta rápida de un cliente (plantillas por nicho)

En **Admin → Clientes → Registrar cliente** se elige una *plantilla de nicho* (Distribuidora / Mayorista, Tienda, Restaurante, Servicios con cita). La plantilla llena personalidad, objetivo, saludo, mensaje fuera de horario, horario típico e instrucciones de cierre; si hay nombre del negocio, queda marcado como configurado. Faltan solo la descripción, el link de pago y el catálogo (Conocimiento → PDF).

Las plantillas están en `backend/src/services/nicheTemplates.js`. En un negocio ya configurado, la plantilla solo llena los campos vacíos.

## 🛡️ Medidas para reducir el riesgo de bloqueo

1. **Retraso humano aleatorio (800–2800 ms)** antes de responder.
2. **Límite de 20 mensajes por hora por contacto.**
3. **Nunca inicia conversaciones ni envía mensajes masivos:** solo responde mensajes entrantes.
4. **Ignora grupos:** solo atiende chats individuales.

> ⚠️ Baileys **no es la API oficial** de WhatsApp. Estas medidas reducen el riesgo, pero Meta puede bloquear el número igualmente. Avisar al cliente antes de conectar y recomendar un número secundario al inicio.

---

## ⚠️ Riesgos operativos conocidos

| Riesgo | Detalle | Qué hacer |
| :--- | :--- | :--- |
| Bloqueo del número | Baileys no es la API oficial | Avisar al cliente; número secundario al inicio |
| Límites de Groq gratis | Con varios clientes a la vez el bot puede quedarse sin IA en horas pico | Vigilar consumo; pasar a plan de pago al crecer |
| Hosting gratuito | Wispbyte free: 512 MB RAM; hay que entrar al panel cada ~2 semanas o se archiva el servidor | Pasar a un servidor de pago con los primeros ingresos |
| Vercel Hobby | Sus términos prohíben uso comercial | Pasar a Vercel Pro o mover el panel al empezar a cobrar |
| Una sola sesión | Dos backends con la misma sesión de WhatsApp se desconectan entre sí | Nunca correr dos backends a la vez |
