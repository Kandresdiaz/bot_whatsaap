'use client';
import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Plan {
  id: string;
  name: string;
  priceCOP: number;
  priceUSD: number;
  period: string;
  tag: string;
  isPopular?: boolean;
  description: string;
  features: string[];
  bonuses: { name: string; value: string }[];
  totalValue: string;
}

const PLANS: Record<string, Plan> = {
  starter: {
    id: 'starter',
    name: 'Vendedor Automático',
    priceCOP: 120000,
    priceUSD: 30,
    period: 'mes',
    tag: '🚀 Básico',
    description: 'Responde, cotiza y atiende a tus clientes 24/7 sin perder ventas ni contratar personal.',
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo interactivo con IA RAG anti-alucinación',
      'Respuestas automáticas en menos de 2 segundos',
      'Hasta 1.500 mensajes IA / mes incluidos',
      'Gestión de conversaciones en vivo en el Dashboard',
      'Base de conocimiento (hasta 20 documentos/FAQs)',
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
    tag: '⭐ MÁS POPULAR',
    isPopular: true,
    description: 'La suite completa de ventas por catálogo, fotos multimedia, citas y pedidos.',
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo con envío automático de Fotos Multimedia',
      'Agendador interactivo de Citas y Pedidos',
      'Panel centralizado de Citas y Pedidos en Dashboard',
      'Hasta 5.000 mensajes IA / mes incluidos',
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
    tag: '👑 ESCALA TOTAL',
    description: 'Automatización total para franquicias, clínicas o empresas con múltiples líneas de WhatsApp.',
    features: [
      'Múltiples líneas de WhatsApp',
      'Marca Blanca (White-Label con tu logo)',
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

function PricingContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  const formatCOP = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
  };

  const handleStartTrial = async (planId: string) => {
    setErrorMessage('');
    if (!user) {
      router.push(`/login?redirect=/pricing?plan=${planId}`);
      return;
    }

    setLoadingCheckout(planId);

    try {
      const res = await fetch(`${BACKEND}/api/billing/create-trial-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          plan: planId,
          returnUrl: `${window.location.origin}/dashboard?payment=trial_started&plan=${planId}`
        }),
      });

      const data = await res.json();

      if (data.success && data.init_point) {
        // Redirigir a Mercado Pago Checkout
        window.location.href = data.init_point;
      } else {
        setErrorMessage(data.error || 'No se pudo iniciar el checkout. Intenta de nuevo.');
        setLoadingCheckout(null);
      }
    } catch (err: any) {
      setErrorMessage(`Error de conexión: ${err.message || err}`);
      setLoadingCheckout(null);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(26,107,255,0.15) 0%, #080E1F 70%)',
      color: '#f8fafc',
      padding: '40px 16px 80px 16px',
      fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        
        {/* Top Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              fontSize: 24, background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
              borderRadius: 12, padding: '6px 10px', lineHeight: 1
            }}>🤖</div>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>BotWA</span>
          </Link>

          {user ? (
            <Link href="/dashboard" className="btn" style={{ background: 'rgba(255,255,255,0.08)', color: '#00CFFF', fontSize: 13, border: '1px solid rgba(0,207,255,0.3)' }}>
              Ir al Dashboard →
            </Link>
          ) : (
            <Link href="/login" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
              Iniciar Sesión
            </Link>
          )}
        </div>

        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(0, 207, 255, 0.12)', border: '1px solid rgba(0, 207, 255, 0.35)',
            borderRadius: 30, padding: '6px 18px', fontSize: 13, fontWeight: 700, color: '#00CFFF',
            marginBottom: 16
          }}>
            <span>⚡ OFERTA IRRESISTIBLE — 7 DÍAS DE PRUEBA GRATIS ($0 COP HOY)</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 900, lineHeight: 1.15,
            marginBottom: 16, maxWidth: 840, margin: '0 auto 16px auto'
          }}>
            Tu Empleado de WhatsApp 24/7 que <span style={{
              background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>Duplica tus Ventas</span> y Nunca Duerme
          </h1>

          <p style={{
            fontSize: 16, color: 'var(--text-muted)', maxWidth: 680, margin: '0 auto', lineHeight: 1.5
          }}>
            Atiende a tus clientes en 2 segundos, cotiza desde tu catálogo con fotos y agenda pedidos en automático. 
            <strong> Ingresa tu tarjeta hoy y úsalo 7 días gratis. Si no te encanta, cancelas con 1 clic y no pagas $1.</strong>
          </p>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 12, padding: '14px 20px', maxWidth: 600, margin: '0 auto 30px auto',
            color: '#f87171', textAlign: 'center', fontSize: 14
          }}>
            {errorMessage}
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
          alignItems: 'stretch',
          marginBottom: 60
        }}>
          {Object.values(PLANS).map((plan) => {
            const isSelected = plan.isPopular;
            const isLoading = loadingCheckout === plan.id;

            return (
              <div
                key={plan.id}
                style={{
                  background: isSelected
                    ? 'linear-gradient(180deg, rgba(26, 107, 255, 0.15) 0%, #0B132B 100%)'
                    : '#0B132B',
                  border: isSelected ? '2px solid #00CFFF' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 20,
                  padding: '32px 26px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  boxShadow: isSelected ? '0 20px 50px rgba(0, 207, 255, 0.15)' : 'none',
                  transform: isSelected ? 'scale(1.02)' : 'none',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Badge Popular */}
                {isSelected && (
                  <div style={{
                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
                    color: '#080E1F', fontWeight: 800, fontSize: 11, letterSpacing: '0.5px',
                    padding: '4px 14px', borderRadius: 20, textTransform: 'uppercase'
                  }}>
                    ⭐ OPCIÓN MÁS RECOMENDADA
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#00CFFF' : '#94a3b8' }}>
                      {plan.tag}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>
                      Valorado en {plan.totalValue}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: '#fff' }}>
                    {plan.name}
                  </h3>

                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, minHeight: 40, lineHeight: 1.4 }}>
                    {plan.description}
                  </p>

                  {/* Pricing Box */}
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.25)', borderRadius: 14, padding: 16, marginBottom: 24,
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>
                        {formatCOP(plan.priceCOP)}
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {plan.period}</span>
                    </div>

                    <div style={{
                      marginTop: 8, display: 'inline-block', background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8, padding: '3px 10px',
                      color: '#4ade80', fontSize: 12, fontWeight: 700
                    }}>
                      🎁 7 DÍAS GRATIS ($0 COP HOY)
                    </div>
                  </div>

                  {/* Features List */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12, letterSpacing: '0.5px' }}>
                      ¿Qué incluye tu plan?
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {plan.features.map((feat, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
                          <span style={{ color: '#00CFFF', fontWeight: 800 }}>✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Hormozi Value Stack (Bonos) */}
                  <div style={{
                    background: 'rgba(26, 107, 255, 0.08)',
                    border: '1px dashed rgba(0, 207, 255, 0.4)',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 24
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#00CFFF', textTransform: 'uppercase', marginBottom: 8 }}>
                      🎁 BONOS GRATIS INCLUIDOS HOY:
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {plan.bonuses.map((b, bi) => (
                        <li key={bi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#cbd5e1' }}>• {b.name}</span>
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>GRATIS</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action CTA Button */}
                <button
                  onClick={() => handleStartTrial(plan.id)}
                  disabled={isLoading}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    fontSize: 14,
                    fontWeight: 800,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: isSelected
                      ? 'linear-gradient(135deg, #1A6BFF, #00CFFF)'
                      : 'rgba(26, 107, 255, 0.3)',
                    border: isSelected ? 'none' : '1px solid rgba(26, 107, 255, 0.6)',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isLoading ? (
                    <><span className="spinner" style={{ width: 18, height: 18 }} /> Conectando con Mercado Pago...</>
                  ) : (
                    <>Comenzar 7 Días Gratis ($0 Hoy) →</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Guarantee Banner (Alex Hormozi Risk Reversal) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
          border: '1px solid rgba(0, 207, 255, 0.3)',
          borderRadius: 20,
          padding: '36px 30px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          marginBottom: 60
        }}>
          <div style={{ fontSize: 56 }}>🛡️</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Garantía Incondicional de Cero Riesgo por 7 Días
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Ingresa tu tarjeta (Crédito, Débito o Tarjeta Nequi Visa) para activar tu cuenta de inmediato con <strong>$0 COP cobrados hoy</strong>. 
              Prueba tu bot durante 7 días completos atendiendo a tus clientes reales. Si por cualquier motivo decides que no es para ti, cancelas con 1 solo clic en tu panel antes de finalizar los 7 días y no se te descontará ni un solo peso.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', marginBottom: 30, color: '#fff' }}>
            Preguntas Frecuentes sobre la Prueba y Pagos
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              {
                q: '¿Se me cobrará algo hoy al ingresar mi tarjeta?',
                a: 'No. El cargo de hoy es de exactamente $0 COP. Mercado Pago únicamente valida que el medio de pago sea real y activo. El primer cobro solo ocurrirá automáticamente al finalizar tu 7mo día de prueba si decides continuar.'
              },
              {
                q: '¿Puedo pagar con Nequi o Bancolombia?',
                a: '¡Sí! Puedes usar tu Tarjeta Débito Nequi Visa virtual (la que viene dentro de tu app Nequi con 16 dígitos y código de seguridad CVV), así como cualquier tarjeta Débito Mastercard/Visa de Bancolombia, Daviplata o cualquier banco colombiano.'
              },
              {
                q: '¿Cómo cancelo si no deseo continuar después de los 7 días?',
                a: 'Puedes cancelar tu suscripción con un solo clic directamente desde la sección de Facturación en tu Dashboard en cualquier momento antes de que finalicen los 7 días.'
              },
              {
                q: '¿Qué pasa si mis clientes me escriben en la noche o festivos?',
                a: 'El bot responde 24/7 los 365 días del año. Tu catálogo, información y agendamiento estarán siempre activos sin importar la hora ni el día.'
              }
            ].map((faq, idx) => (
              <div key={idx} className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#00CFFF', marginBottom: 8 }}>
                  {faq.q}
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer Legal & Recomendación de Seguridad Anti-Baneo */}
        <div style={{
          marginTop: 60,
          background: 'rgba(8, 14, 31, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '24px 28px',
          fontSize: 12,
          color: '#94a3b8',
          lineHeight: 1.6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            <span>⚠️</span>
            <span>Recomendación de Seguridad y Buenas Prácticas:</span>
          </div>
          <p style={{ margin: '0 0 12px 0' }}>
            Para proteger tus contactos personales y mantener un historial comercial limpio, <strong>recomendamos utilizar una línea, SIM o eSIM exclusiva para tu negocio</strong> en lugar de tu número personal principal. BotWA cuenta con protecciones anti-bloqueo avanzadas (delays humanizados de 800-2800ms, límites de tasa y respuesta exclusiva a mensajes entrantes sin envío de spam masivo), pero el uso responsable de la línea es fundamental.
          </p>
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 12, fontSize: 11, color: '#64748b' }}>
            <strong>Descargo de Responsabilidad Oficial:</strong> BotWA es una solución de software independiente desarrollada para optimizar la atención al cliente de negocios. No estamos afiliados, asociados, autorizados, respaldados ni conectados de ninguna manera oficial con Meta Platforms, Inc. ni WhatsApp LLC. WhatsApp es una marca comercial registrada propiedad de Meta Platforms, Inc.
          </div>
        </div>

      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080E1F' }}>
        <div className="spinner" style={{ width: 44, height: 44 }} />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
