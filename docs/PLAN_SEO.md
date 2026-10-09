# Plan de SEO y captación con $0 — BotWA

Restricción: todo gratis, dominio `bot-whatsaap.vercel.app`. Mercado: Colombia (precios en COP, Nequi, Mercado Pago).

## 1. Los 2 nichos y por qué

En vez de pelear por "bot de WhatsApp" (palabra genérica, dominada por Meta, Twilio, ManyChat, etc.), atacamos dos nichos donde BotWA ya tiene la función clave y el dolor es claro:

| Nicho | Función que vende | Dolor | Página |
|---|---|---|---|
| **Restaurantes / comidas rápidas con domicilio** | Pedidos + menú con fotos + notas de voz | Hora pico, chats sin responder, comisiones de apps | `/bot-whatsapp-restaurantes` |
| **Clínicas odontológicas, estéticas y consultorios** | Agenda de citas + precios de tratamientos | Recepción saturada, pacientes que escriben de noche | `/bot-whatsapp-clinicas` |

Por qué estos dos:
- Ambos viven en WhatsApp en Colombia y repiten las mismas preguntas todo el día.
- Usan las dos funciones diferenciales (pedidos y citas), así que el plan Pro tiene sentido para ellos.
- Clínicas: ticket alto, pagan sin problema $249.000/mes si les llega 1 paciente extra.
- Restaurantes: volumen alto de negocios y fáciles de encontrar (Google Maps, Instagram).
- Son negocios locales: es posible vender puerta a puerta y por grupos de Facebook, no solo por Google.

Tercer nicho para después (no ahora): tiendas por catálogo / ropa (importación de catálogo PDF).

## 2. Lo que ya quedó hecho en el código (rama `feat/seo-nichos`)

- `robots.txt` y `sitemap.xml` automáticos (`src/app/robots.ts`, `src/app/sitemap.ts`). Bloquea `/dashboard`, `/admin`, `/auth`, `/api`.
- `metadataBase`, plantilla de títulos `%s | BotWA`, canonical en cada página, `og:locale es_CO`.
- Imagen para compartir (`/opengraph-image`) generada con el diseño de la marca: se ve al pegar el link en WhatsApp/Facebook.
- Datos estructurados (schema.org): Organization + SoftwareApplication con precios + FAQPage en la home; FAQPage + Breadcrumb en nichos; Article en guías.
- 2 páginas de nicho con su propio chat de ejemplo, dolores, funciones, FAQ y CTA.
- `/guias` con 4 guías (2 por nicho) que enlazan a la página de nicho.
- Home enlaza a los nichos ("Ver más →" en restaurantes y clínicas) y a guías; footer común con enlaces internos.
- `/login` con `noindex`; `/pricing` con título y descripción propios (antes heredaba los de la home).
- Verificación de Google Search Console por variable `NEXT_PUBLIC_GSC_VERIFICATION`.
- Si algún día hay dominio propio: definir `NEXT_PUBLIC_SITE_URL` en Vercel y todo (canonical, sitemap) cambia solo.

## 3. Tareas manuales (semana 1)

1. **Google Search Console** (gratis): Agregar propiedad → "Prefijo de URL" → `https://bot-whatsaap.vercel.app` → método *Etiqueta HTML*. Copiar solo el valor de `content="..."` a la variable `NEXT_PUBLIC_GSC_VERIFICATION` en Vercel y volver a desplegar. Luego enviar `sitemap.xml` y pedir indexación de las 2 páginas de nicho.
2. **Bing Webmaster Tools**: importar desde Search Console (1 clic). Bing alimenta también a ChatGPT/Copilot.
3. **Perfil de empresa de Google**: como "empresa de servicios sin dirección visible", categoría *Desarrollador de software*, con el link al sitio.
4. Bio de Instagram, TikTok y Facebook con el link a la página de nicho (no a la home).

## 4. Palabras clave objetivo

Restaurantes: `bot de whatsapp para restaurantes`, `pedidos por whatsapp automáticos`, `chatbot para domicilios`, `cómo recibir pedidos por whatsapp`, `menú por whatsapp`.

Clínicas: `agendar citas por whatsapp`, `bot de whatsapp para consultorio odontológico`, `chatbot para clínica estética`, `mensajes de whatsapp para clínica dental`.

Regla: 1 página = 1 intención. Antes de escribir una guía nueva, buscar la palabra en Google (modo incógnito, ubicación Colombia) y mirar qué tipo de página sale arriba.

## 5. Calendario de contenido (12 semanas, 1 guía/semana, alternando nichos)

Cada guía se agrega en `frontend/src/lib/guides.ts` (sitemap y enlaces se actualizan solos).

| Semana | Nicho | Guía |
|---|---|---|
| 1 | Restaurante | Cómo armar un menú para WhatsApp que venda (foto vs PDF) |
| 2 | Clínica | Cómo reducir las citas que no asisten (inasistencia) |
| 3 | Restaurante | Mensajes de WhatsApp para restaurantes: plantillas listas |
| 4 | Clínica | WhatsApp Business vs bot con IA para consultorios |
| 5 | Restaurante | Cómo cobrar domicilios por Nequi sin enredos |
| 6 | Clínica | Qué datos del paciente pedir por WhatsApp (y cuáles no) |
| 7 | Restaurante | Cómo atender pedidos por audio en WhatsApp |
| 8 | Clínica | Cómo responder "¿cuánto vale?" sin espantar al paciente |
| 9 | Restaurante | WhatsApp Business vs bot con IA para restaurantes |
| 10 | Clínica | Cómo llenar la agenda de los días flojos por WhatsApp |
| 11 | Restaurante | Cuánto cuesta un bot de WhatsApp para restaurante en Colombia |
| 12 | Clínica | Cuánto cuesta un bot de WhatsApp para consultorio en Colombia |

Las de "cuánto cuesta" y "X vs Y" atraen gente lista para comprar: priorizarlas si hay poco tiempo.

## 6. Tráfico gratis fuera de Google (lo que trae clientes más rápido)

El SEO tarda 2–4 meses en arrancar en un subdominio nuevo. Mientras tanto:

- **Videos cortos (TikTok / Reels / Shorts)**: grabar la pantalla del celular con el bot respondiendo un pedido real o agendando una cita. Formato: "Le escribí a las 11 p. m. a esta pizzería y mira lo que pasó". 3 por semana, link en bio a la página de nicho.
- **Grupos de Facebook** de restaurantes, emprendedores, odontólogos y estética en Colombia: aportar las guías como ayuda (no spam), y responder preguntas de "cómo organizo los pedidos".
- **Prospección directa**: buscar en Google Maps "comidas rápidas" / "odontología" en tu ciudad, escribirles por WhatsApp con un mensaje corto y el link de la página de su nicho. Es la vía más rápida a los primeros 10 clientes.
- **Demo en vivo**: el bot de ventas (`wa.me/573057405422`) ya es la mejor demo; ponerlo en cada video y publicación.
- **Directorios de software gratis**: SaaSHub, AlternativeTo, Product Hunt (lanzamiento), directorios latinos de startups. Dan enlaces que suben la autoridad del dominio.
- **Casos de éxito**: con el primer restaurante y la primera clínica que lo usen, pedir permiso y hacer una guía-caso ("Cómo [negocio] pasó de X a Y pedidos"). Es el contenido que mejor convierte.

## 7. Cómo medir (gratis)

- **Search Console**: impresiones y clics por página; ver qué búsquedas reales llegan y escribir guías para ellas.
- **Atribución propia** (ya existe): cada registro guarda `landing_path` y `referrer` de la primera visita. Revisar en admin cuántos registros vienen de `/bot-whatsapp-*` y `/guias/*`.
- Usar UTM solo en enlaces **externos** (bio de redes, grupos): `?utm_source=tiktok&utm_medium=social&utm_campaign=restaurantes`. Nunca en enlaces internos.

Metas razonables a 90 días: las 2 páginas de nicho indexadas y en top 20 para su palabra principal, 16 guías publicadas, 10 clientes pagando entre los dos nichos (casi todos por prospección directa y videos).

## 8. Riesgos a tener en cuenta

- **Plan Hobby de Vercel**: sus términos son para uso no comercial. Si BotWA cobra, lo correcto es pasar a Pro o mover el frontend a otro hosting gratuito que permita uso comercial (por ejemplo Cloudflare Pages o Netlify). Revisarlo antes de que crezca.
- **Subdominio `.vercel.app`**: funciona para SEO, pero si luego compras dominio hay que hacer redirección 301 desde Vercel y cambiar la propiedad en Search Console. Mientras antes se compre (~$12 USD/año), menos se pierde.
- No prometer en el contenido funciones que no existen (por ejemplo recordatorios automáticos de citas): si se agregan, actualizar la página de clínicas, que es la palabra clave más fuerte.
