const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { supabase } = require('../db/supabase');

// Planes con metodología de Oferta Irresistible de Alex Hormozi ($100M Offers)
const HORMOZI_PLANS = {
  starter: {
    id: 'starter',
    name: 'Vendedor Automático',
    priceCOP: 120000,
    priceUSD: 30,
    period: 'mes',
    tag: 'Ideal para iniciar',
    description: 'Responde, cotiza y atiende a tus clientes 24/7 sin perder ventas.',
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo interactivo con IA RAG',
      'Respuestas automáticas en 2 segundos',
      'Hasta 1.500 mensajes IA / mes',
      'Gestión de conversaciones en tiempo real',
      'Base de conocimiento (hasta 20 documentos)',
    ],
    bonuses: [
      { name: 'Plantilla de Catálogo y FAQ para tu nicho', value: '$45 USD' },
      { name: 'Soporte técnico por WhatsApp', value: '$30 USD' },
    ],
    totalValue: '$190 USD',
  },
  pro: {
    id: 'pro',
    name: 'Máquina de Ventas Pro',
    priceCOP: 249000,
    priceUSD: 62,
    period: 'mes',
    tag: '⭐ Más Popular',
    isPopular: true,
    description: 'La suite completa de ventas por catálogo, fotos multimedia y agendamiento.',
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo con envío automático de Fotos Multimedia',
      'Agendador interactivo de Citas y Pedidos',
      'Panel centralizado de Citas y Pedidos en Dashboard',
      'Hasta 5.000 mensajes IA / mes',
      'Generador de FAQs con IA a demanda',
      'Base de conocimiento ampliada (hasta 100 docs)',
    ],
    bonuses: [
      { name: 'Plantillas de catálogo listas para tu nicho', value: '$45 USD' },
      { name: 'Guía Anti-Baneo y Cierre Persuasivo', value: '$97 USD' },
      { name: 'Configuración asistida de fotos y productos', value: '$60 USD' },
    ],
    totalValue: '$450 USD',
  },
  business: {
    id: 'business',
    name: 'Dominio Agencia / VIP',
    priceCOP: 490000,
    priceUSD: 120,
    period: 'mes',
    tag: 'Escala Total',
    description: 'Automatización total para franquicias, clínicas o agencias con múltiples líneas.',
    features: [
      'Múltiples líneas de WhatsApp',
      'Marca Blanca (White-Label personalizado)',
      'Prompting y RAG a la medida (Done-For-You)',
      'Hasta 20.000 mensajes IA / mes',
      'Base de conocimiento y catálogo ilimitados',
      'Soporte prioritario 1 a 1 directo por WhatsApp',
    ],
    bonuses: [
      { name: 'Todo lo incluido en el Plan Pro', value: '$450 USD' },
      { name: 'Sesión 1 a 1 de optimización de embudo', value: '$200 USD' },
      { name: 'Onboarding VIP asistido', value: '$100 USD' },
    ],
    totalValue: '$950 USD',
  }
};

// Inicializar cliente de Mercado Pago
const getMPClient = () => {
  const token = (process.env.MP_ACCESS_TOKEN || '').trim();
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
};

// ── GET: Obtener lista de planes ──────────────────────────────────────────────
router.get('/plans', (req, res) => {
  res.json({ success: true, plans: HORMOZI_PLANS });
});

// ── POST: Crear suscripción con 7 días de prueba gratis ($0 COP hoy) ─────────
router.post('/create-trial-subscription', async (req, res) => {
  try {
    const { userId, plan = 'pro', email, returnUrl } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ success: false, error: 'userId y email son obligatorios' });
    }

    const selectedPlan = HORMOZI_PLANS[plan] || HORMOZI_PLANS.pro;
    const mpClient = getMPClient();

    const frontendUrl = process.env.FRONTEND_URL || 'https://bot-whatsaap.vercel.app';
    const backUrl = returnUrl || `${frontendUrl}/dashboard?payment=trial_started&plan=${selectedPlan.id}`;

    // Si no hay token de MP configurado todavía en Render (Modo Demo/Simulado)
    if (!mpClient) {
      console.warn('[BILLING] MP_ACCESS_TOKEN no configurado. Activando trial directo en DB (Modo Sandbox/Dev).');
      
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      await supabase.from('users').update({
        plan: selectedPlan.id,
        subscription_status: 'trialing',
        status: 'active',
        trial_ends_at: trialEndsAt.toISOString(),
      }).eq('id', userId);

      return res.json({
        success: true,
        is_mock: true,
        init_point: backUrl,
        message: 'Modo Sandbox: Se activaron 7 días gratis en tu cuenta.'
      });
    }

    const preapproval = new PreApproval(mpClient);
    const token = (process.env.MP_ACCESS_TOKEN || '').trim();
    const isTestMode = token.startsWith('TEST-');

    // Email a usar para el pagador
    let payerEmail = email;
    if (isTestMode && (email.includes('admin') || email.includes('kevin') || email.includes('diaz') || !email.includes('@'))) {
      payerEmail = `test_payer_${String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}@gmail.com`;
    }

    const buildBody = (pEmail) => ({
      reason: `BotWA - Plan ${selectedPlan.name} (7 Días Gratis)`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: selectedPlan.priceCOP,
        currency_id: 'COP',
        free_trial: {
          frequency: 7,
          frequency_type: 'days' // 👈 7 DÍAS GRATIS - $0 COP HOY
        }
      },
      payer_email: pEmail,
      back_url: backUrl,
      external_reference: userId
    });

    let response;
    try {
      response = await preapproval.create({ body: buildBody(payerEmail) });
    } catch (createErr) {
      console.warn('[BILLING] Error en primer intento de PreApproval:', createErr.message);
      // Reintentar con email de prueba genérico @gmail.com
      const fallbackTestEmail = `cliente_test_${Date.now().toString().slice(-6)}@gmail.com`;
      response = await preapproval.create({ body: buildBody(fallbackTestEmail) });
    }

    // Guardar referencia preliminar en la base de datos
    await supabase.from('users').update({
      mp_preapproval_id: response.id,
      plan: selectedPlan.id,
      billing_plan: selectedPlan.id
    }).eq('id', userId);

    console.log(`[BILLING] Preapproval creado: ${response.id} para ${email} (Plan: ${selectedPlan.name})`);

    return res.json({
      success: true,
      init_point: response.init_point,
      preapproval_id: response.id
    });
  } catch (error) {
    console.error('[BILLING] Error creando suscripción en Mercado Pago:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error al conectar con la pasarela de pagos'
    });
  }
});

// ── POST: Webhook de Mercado Pago (IPN / Webhooks) ───────────────────────────
router.post('/mp-webhook', async (req, res) => {
  // Responder inmediatamente a Mercado Pago con 200 OK para evitar reintentos
  res.status(200).send('OK');

  try {
    const topic = req.query.topic || req.query.type || req.body?.type;
    const resourceId = req.query.id || req.query['data.id'] || req.body?.data?.id;

    console.log(`[BILLING WEBHOOK] Evento recibido: topic=${topic}, id=${resourceId}`);

    const mpClient = getMPClient();
    if (!mpClient || !resourceId) return;

    // 1. Manejo de Suscripción (PreApproval)
    if (topic === 'subscription_preapproval' || topic === 'preapproval') {
      const preapproval = new PreApproval(mpClient);
      const subData = await preapproval.get({ id: resourceId });

      if (subData) {
        const userId = subData.external_reference;
        const status = subData.status; // 'authorized', 'paused', 'cancelled', 'pending'
        const payerEmail = subData.payer_email;

        console.log(`[BILLING WEBHOOK] Subscripción ${resourceId}: status=${status}, user=${userId}, email=${payerEmail}`);

        if (status === 'authorized') {
          // Tarjeta registrada con éxito -> Activar 7 días gratis
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 7);

          const updatePayload = {
            mp_preapproval_id: resourceId,
            mp_payer_id: subData.payer_id ? String(subData.payer_id) : null,
            subscription_status: 'trialing',
            status: 'active',
            trial_ends_at: trialEndsAt.toISOString(),
          };

          if (userId) {
            await supabase.from('users').update(updatePayload).eq('id', userId);
          } else if (payerEmail) {
            await supabase.from('users').update(updatePayload).eq('email', payerEmail);
          }
        } else if (status === 'cancelled') {
          // Suscripción cancelada por el usuario
          const updatePayload = { subscription_status: 'canceled', status: 'paused' };
          if (userId) await supabase.from('users').update(updatePayload).eq('id', userId);
          else if (payerEmail) await supabase.from('users').update(updatePayload).eq('email', payerEmail);
        } else if (status === 'paused') {
          // Suscripción pausada
          const updatePayload = { subscription_status: 'paused', status: 'paused' };
          if (userId) await supabase.from('users').update(updatePayload).eq('id', userId);
          else if (payerEmail) await supabase.from('users').update(updatePayload).eq('email', payerEmail);
        }
      }
    }

    // 2. Manejo de Cobros / Facturas (Payment)
    if (topic === 'payment') {
      const { Payment } = require('mercadopago');
      const paymentApi = new Payment(mpClient);
      const payment = await paymentApi.get({ id: resourceId });

      if (payment) {
        const status = payment.status; // 'approved', 'rejected', etc.
        const payerEmail = payment.payer?.email;
        const externalRef = payment.external_reference;

        console.log(`[BILLING WEBHOOK] Pago ${resourceId}: status=${status}, email=${payerEmail}`);

        if (status === 'approved') {
          // Cobro de renovación o cobro tras el día 7 exitoso -> +30 días activos
          const paidUntil = new Date();
          paidUntil.setDate(paidUntil.getDate() + 30);

          const cardLast4 = payment.card?.last_four_digits || null;
          const cardBrand = payment.payment_method_id || null;

          const updatePayload = {
            subscription_status: 'active',
            status: 'active',
            paid_until: paidUntil.toISOString(),
            card_last4: cardLast4,
            card_brand: cardBrand,
          };

          if (externalRef) {
            await supabase.from('users').update(updatePayload).eq('id', externalRef);
          } else if (payerEmail) {
            await supabase.from('users').update(updatePayload).eq('email', payerEmail);
          }
        } else if (status === 'rejected') {
          // Cobro rechazado -> marcar past_due
          const updatePayload = { subscription_status: 'past_due' };
          if (externalRef) {
            await supabase.from('users').update(updatePayload).eq('id', externalRef);
          } else if (payerEmail) {
            await supabase.from('users').update(updatePayload).eq('email', payerEmail);
          }
        }
      }
    }
  } catch (err) {
    console.error('[BILLING WEBHOOK] Error procesando notificación:', err.message);
  }
});

// ── GET: Consultar estado de suscripción y consumo de mensajes de un usuario ──
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    let user = null;
    if (isUuid(userId)) {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, plan, status, is_admin, subscription_status, trial_ends_at, paid_until, card_brand, card_last4, mp_preapproval_id')
        .eq('id', userId)
        .maybeSingle();
      user = data;
    }

    if (!user) {
      // Intentar buscar por email o si es admin
      if (userId.includes('@')) {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, plan, status, is_admin, subscription_status, trial_ends_at, paid_until, card_brand, card_last4, mp_preapproval_id')
          .eq('email', userId)
          .maybeSingle();
        user = data;
      } else if (userId === 'admin') {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, plan, status, is_admin, subscription_status, trial_ends_at, paid_until, card_brand, card_last4, mp_preapproval_id')
          .eq('is_admin', true)
          .order('created_at', { ascending: false })
          .limit(1);
        user = data && data[0];
      }
    }

    // Fallback por defecto si no existe en DB aún
    if (!user) {
      user = {
        id: userId,
        name: 'Usuario BotWA',
        email: 'usuario@bot.com',
        plan: 'pro',
        status: 'active',
        subscription_status: 'trialing',
      };
    }

    const now = new Date();
    let daysLeftInTrial = 0;
    let isTrialActive = false;

    if (user.trial_ends_at) {
      const trialEnd = new Date(user.trial_ends_at);
      if (trialEnd > now) {
        daysLeftInTrial = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        isTrialActive = true;
      }
    }

    const isPaidActive = Boolean(
      user.is_admin ||
      (user.subscription_status === 'active' || user.status === 'active') && (!user.paid_until || new Date(user.paid_until) > now)
    );

    // ── Límites por plan y estado de suscripción ────────────────────────────
    const PLAN_LIMITS = {
      free: 100,         // Plan inicial de prueba sin tarjeta
      trial: 300,        // 7 Días de prueba gratis con tarjeta ($0 COP hoy)
      starter: 1500,     // Plan Vendedor Automático ($120.000 COP)
      pro: 5000,         // Plan Máquina de Ventas Pro ($249.000 COP)
      business: 20000,   // Plan Dominio Agencia / VIP ($490.000 COP)
    };

    const userPlanKey = (user.plan || 'starter').toLowerCase();
    const planInfo = HORMOZI_PLANS[userPlanKey] || HORMOZI_PLANS.starter;

    // Determinar límite efectivo
    let messageLimit = PLAN_LIMITS[userPlanKey] || 1500;
    if (user.is_admin) {
      messageLimit = 999999;
    } else if (isTrialActive) {
      messageLimit = PLAN_LIMITS.trial; // 300 mensajes en prueba de 7 días
    } else if (user.subscription_status === 'none' || user.status === 'trial' || userPlanKey === 'free') {
      messageLimit = PLAN_LIMITS.free; // 100 mensajes gratis demo
    }

    // ── Calcular consumo de mensajes del mes actual y métricas de valor ──────
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    let messagesUsedThisMonth = 0;
    let totalBotMessagesAllTime = 0;
    let tokensUsedThisMonth = 0;
    let ordersCount = 0;
    let ordersRevenue = 0;
    let appointmentsCount = 0;
    let hotLeadsCount = 0;
    let totalClientsServed = 0;

    try {
      // 1. Obtener session_ids del usuario
      const sessionIdsSet = new Set();
      if (isUuid(user.id)) sessionIdsSet.add(user.id);

      const { data: userSessions } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', user.id);

      if (Array.isArray(userSessions)) {
        userSessions.forEach(s => { if (s?.id && isUuid(s.id)) sessionIdsSet.add(s.id); });
      }

      const sessionList = Array.from(sessionIdsSet);

      // 2. Obtener IDs de conversaciones asociadas
      let convIds = [];
      if (sessionList.length > 0) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, is_lead')
          .in('session_id', sessionList);
        if (Array.isArray(convs)) {
          convIds = convs.map(c => c.id).filter(Boolean);
          hotLeadsCount = convs.filter(c => c.is_lead).length;
          totalClientsServed = convs.length;
        }
      }

      // Si no encontró por session_id específico y es admin, obtener conversaciones generales
      if (convIds.length === 0 && user.is_admin) {
        const { data: allConvs } = await supabase
          .from('conversations')
          .select('id, is_lead')
          .limit(200);
        if (Array.isArray(allConvs)) {
          convIds = allConvs.map(c => c.id).filter(Boolean);
          hotLeadsCount = allConvs.filter(c => c.is_lead).length;
          totalClientsServed = allConvs.length;
        }
      }

      // 3. Contar mensajes generados por el bot este mes e históricos
      if (convIds.length > 0) {
        // Mensajes del mes actual
        const { data: msgsData } = await supabase
          .from('messages')
          .select('id, groq_tokens_used')
          .in('conversation_id', convIds)
          .eq('sent_by', 'bot')
          .gte('timestamp', startOfMonth);

        if (Array.isArray(msgsData)) {
          messagesUsedThisMonth = msgsData.length;
          tokensUsedThisMonth = msgsData.reduce((acc, m) => acc + (Number(m.groq_tokens_used) || 0), 0);
        }

        // Total histórico de mensajes respondidos por el bot
        const { count: totalBotCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .eq('sent_by', 'bot');

        totalBotMessagesAllTime = totalBotCount || messagesUsedThisMonth;
      }

      // 4. Obtener negocios del usuario para métricas de pedidos y citas
      const { data: userBuses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id);
      const busIds = Array.isArray(userBuses) ? userBuses.map(b => b.id).filter(Boolean) : [];

      // 5. Consultar pedidos cerrados y facturación generada
      let ordersQuery = supabase.from('orders').select('id, total_amount, status');
      if (busIds.length > 0) {
        ordersQuery = ordersQuery.in('business_id', busIds);
      } else if (convIds.length > 0) {
        ordersQuery = ordersQuery.in('conversation_id', convIds);
      } else if (user.is_admin) {
        ordersQuery = ordersQuery.limit(200);
      }

      const { data: ordersData } = await ordersQuery;
      if (Array.isArray(ordersData)) {
        ordersCount = ordersData.length;
        ordersRevenue = ordersData.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
      }

      // 6. Consultar citas agendadas por el bot
      let apptsQuery = supabase.from('appointments').select('id, status');
      if (busIds.length > 0) {
        apptsQuery = apptsQuery.in('business_id', busIds);
      } else if (convIds.length > 0) {
        apptsQuery = apptsQuery.in('conversation_id', convIds);
      } else if (user.is_admin) {
        apptsQuery = apptsQuery.limit(200);
      }

      const { data: apptsData } = await apptsQuery;
      if (Array.isArray(apptsData)) {
        appointmentsCount = apptsData.length;
      }

    } catch (msgErr) {
      console.warn('[BILLING] Error calculando métricas de mensajes:', msgErr.message);
    }

    const percentageUsed = Math.min(100, Math.round((messagesUsedThisMonth / messageLimit) * 100));
    const isApproachingLimit = percentageUsed >= 80;
    const hasReachedLimit = messagesUsedThisMonth >= messageLimit;

    // Cálculo de ROI y Ahorro Estimado:
    // Cada conversación atendida ahorra ~4 minutos de atención manual de un empleado
    const timeSavedHours = Math.max(0.1, Math.round((totalClientsServed * 4 + messagesUsedThisMonth * 0.5) / 60 * 10) / 10);
    // Sueldo mínimo en Colombia con prestaciones ~1.600.000 COP/mes (aprox 10.000 COP/hora)
    const moneySavedCOP = Math.round(timeSavedHours * 10000);

    const effectiveStatus = (isPaidActive || user.status === 'active')
      ? 'active'
      : (isTrialActive ? 'trialing' : (user.subscription_status || 'none'));

    return res.json({
      success: true,
      subscription: {
        status: effectiveStatus,
        is_trial_active: isTrialActive,
        is_paid_active: isPaidActive,
        has_access: Boolean(user.is_admin || isTrialActive || isPaidActive || user.status === 'active'),
        days_left_in_trial: daysLeftInTrial,
        trial_ends_at: user.trial_ends_at,
        paid_until: user.paid_until,
        plan: userPlanKey,
        plan_name: isTrialActive ? `Prueba 7 Días Gratis (${planInfo.name})` : planInfo.name,
        price_cop: planInfo.priceCOP,
        card_brand: user.card_brand,
        card_last4: user.card_last4,
        mp_preapproval_id: user.mp_preapproval_id,
        user_status: user.status,
        is_admin: Boolean(user.is_admin)
      },
      usage: {
        messages_used_this_month: messagesUsedThisMonth,
        message_limit: messageLimit,
        messages_remaining: Math.max(0, messageLimit - messagesUsedThisMonth),
        percentage_used: percentageUsed,
        tokens_used_this_month: tokensUsedThisMonth,
        is_approaching_limit: isApproachingLimit,
        has_reached_limit: hasReachedLimit,
        start_of_month: startOfMonth,
        docs_limit: userPlanKey === 'starter' ? 20 : userPlanKey === 'pro' ? 100 : 'Ilimitados',
        features_summary: isTrialActive
          ? 'Prueba 7 Días: 300 msgs incluidos'
          : userPlanKey === 'starter'
          ? 'Catálogo RAG 24/7 (1.500 msgs/mes)'
          : userPlanKey === 'pro'
          ? 'Catálogo + Fotos + Citas (5.000 msgs/mes)'
          : 'Multi-Línea VIP (20.000 msgs/mes)'
      },
      metrics: {
        total_bot_messages: totalBotMessagesAllTime || messagesUsedThisMonth,
        closed_orders_count: ordersCount,
        closed_orders_revenue: ordersRevenue,
        appointments_count: appointmentsCount,
        hot_leads_count: hotLeadsCount,
        total_clients_served: totalClientsServed,
        time_saved_hours: timeSavedHours,
        money_saved_cop: moneySavedCOP,
        avg_response_speed: '1.8 seg',
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST: Cancelar suscripción ───────────────────────────────────────────────
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId es obligatorio' });

    const { data: user } = await supabase
      .from('users')
      .select('mp_preapproval_id')
      .eq('id', userId)
      .maybeSingle();

    const mpClient = getMPClient();
    if (mpClient && user?.mp_preapproval_id) {
      try {
        const preapproval = new PreApproval(mpClient);
        await preapproval.update({
          id: user.mp_preapproval_id,
          body: { status: 'cancelled' }
        });
      } catch (mpErr) {
        console.warn('[BILLING] Error cancelando en MP (procediendo en DB):', mpErr.message);
      }
    }

    await supabase.from('users').update({
      subscription_status: 'canceled',
      status: 'paused'
    }).eq('id', userId);

    return res.json({ success: true, message: 'Suscripción cancelada correctamente' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper para validar cuota de mensajes antes de llamar a Groq ─────────────
const checkUserMessageQuota = async (userId) => {
  if (!userId) return { canSend: true, reason: 'no_user_id' };

  try {
    const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    let user = null;
    if (isUuid(userId)) {
      const { data } = await supabase
        .from('users')
        .select('id, plan, status, is_admin, subscription_status, trial_ends_at, paid_until')
        .eq('id', userId)
        .maybeSingle();
      user = data;
    }

    if (!user && (userId === 'admin' || userId === '00000000-0000-0000-0000-000000000001')) {
      return { canSend: true, isAdmin: true, messageLimit: 999999, messagesUsed: 0 };
    }

    if (!user) {
      user = { id: userId, plan: 'free', status: 'active', subscription_status: 'none' };
    }

    if (user.is_admin) {
      return { canSend: true, isAdmin: true, messageLimit: 999999, messagesUsed: 0 };
    }

    // Verificar si la cuenta está pausada o cancelada
    if (user.status === 'paused' || user.subscription_status === 'canceled') {
      return { canSend: false, reason: 'account_paused', messageLimit: 0, messagesUsed: 0 };
    }

    const now = new Date();
    const isTrialActive = user.subscription_status === 'trialing' && user.trial_ends_at && new Date(user.trial_ends_at) > now;
    const isPaidActive = (user.subscription_status === 'active' || user.status === 'active') && (!user.paid_until || new Date(user.paid_until) > now);

    const PLAN_LIMITS = {
      free: 100,         // Plan gratis / demo
      trial: 300,        // 7 Días de prueba gratis con tarjeta ($0 COP hoy)
      starter: 1500,     // Plan Vendedor Automático ($120.000 COP)
      pro: 5000,         // Plan Máquina de Ventas Pro ($249.000 COP)
      business: 20000,   // Plan Dominio Agencia / VIP ($490.000 COP)
    };

    const userPlanKey = (user.plan || 'starter').toLowerCase();
    let messageLimit = PLAN_LIMITS[userPlanKey] || 1500;

    if (isTrialActive) {
      messageLimit = PLAN_LIMITS.trial; // 300 msgs en prueba
    } else if (!isPaidActive || user.subscription_status === 'none' || userPlanKey === 'free') {
      messageLimit = PLAN_LIMITS.free; // 100 msgs en demo
    }

    // Calcular consumo mensual del bot
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sessionIdsSet = new Set();
    if (isUuid(user.id)) sessionIdsSet.add(user.id);

    const { data: userSessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', user.id);

    if (Array.isArray(userSessions)) {
      userSessions.forEach(s => { if (s?.id && isUuid(s.id)) sessionIdsSet.add(s.id); });
    }

    const sessionList = Array.from(sessionIdsSet);
    let convIds = [];
    if (sessionList.length > 0) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .in('session_id', sessionList);
      if (Array.isArray(convs)) {
        convIds = convs.map(c => c.id).filter(Boolean);
      }
    }

    let messagesUsed = 0;
    if (convIds.length > 0) {
      const { data: msgsData } = await supabase
        .from('messages')
        .select('id')
        .in('conversation_id', convIds)
        .eq('sent_by', 'bot')
        .gte('timestamp', startOfMonth);

      if (Array.isArray(msgsData)) {
        messagesUsed = msgsData.length;
      }
    }

    const hasReachedLimit = messagesUsed >= messageLimit;

    return {
      canSend: !hasReachedLimit,
      messagesUsed,
      messageLimit,
      hasReachedLimit,
      plan: userPlanKey,
      isTrial: isTrialActive,
      isPaid: isPaidActive,
      isAdmin: false,
      reason: hasReachedLimit ? 'quota_exceeded' : 'ok'
    };
  } catch (err) {
    console.warn('[BILLING] Error verificando cuota de usuario:', err.message);
    return { canSend: true, reason: 'error_fallback' };
  }
};

router.checkUserMessageQuota = checkUserMessageQuota;

module.exports = router;
