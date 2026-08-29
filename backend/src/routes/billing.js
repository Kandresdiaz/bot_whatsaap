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

    const body = {
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
      payer_email: email,
      back_url: backUrl,
      external_reference: userId,
      status: 'authorized'
    };

    const response = await preapproval.create({ body });

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

// ── GET: Consultar estado de suscripción de un usuario ─────────────────────────
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, plan, status, subscription_status, trial_ends_at, paid_until, card_brand, card_last4, mp_preapproval_id')
      .eq('id', userId)
      .maybeSingle();

    if (!user || error) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
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

    const planInfo = HORMOZI_PLANS[user.plan] || HORMOZI_PLANS.starter;

    return res.json({
      success: true,
      subscription: {
        status: user.subscription_status || 'none',
        is_trial_active: isTrialActive,
        days_left_in_trial: daysLeftInTrial,
        trial_ends_at: user.trial_ends_at,
        paid_until: user.paid_until,
        plan: user.plan || 'starter',
        plan_name: planInfo.name,
        price_cop: planInfo.priceCOP,
        card_brand: user.card_brand,
        card_last4: user.card_last4,
        mp_preapproval_id: user.mp_preapproval_id,
        user_status: user.status
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

module.exports = router;
