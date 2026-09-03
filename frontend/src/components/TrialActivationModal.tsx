'use client';
import React from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  isOpen: boolean;
  onClose?: () => void;
}

export default function TrialActivationModal({ isOpen, onClose }: Props) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleGoToPricing = () => {
    router.push('/pricing');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(4, 9, 24, 0.88)',
      backdropFilter: 'blur(10px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #0B132B 0%, #080E1F 100%)',
        border: '2px solid #00CFFF',
        borderRadius: 24,
        padding: '36px 28px',
        maxWidth: 540,
        width: '100%',
        boxShadow: '0 25px 60px rgba(0, 207, 255, 0.25)',
        position: 'relative',
        animation: 'fadeIn 0.25s ease-out',
        textAlign: 'center'
      }}>
        {/* Botón cerrar si se desea inspeccionar */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        )}

        {/* Badge Superior */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(0, 207, 255, 0.12)',
          border: '1px solid rgba(0, 207, 255, 0.35)',
          borderRadius: 20,
          padding: '5px 14px',
          fontSize: 12,
          fontWeight: 800,
          color: '#00CFFF',
          marginBottom: 18,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <span>🎁 PASO PREVIO OBLIGATORIO</span>
        </div>

        {/* Icono animado */}
        <div style={{
          fontSize: 48,
          marginBottom: 14,
          lineHeight: 1
        }}>
          🚀
        </div>

        {/* Título Principal */}
        <h2 style={{
          fontSize: 24,
          fontWeight: 900,
          color: '#ffffff',
          marginBottom: 10,
          lineHeight: 1.25
        }}>
          ¡Activa tus 7 Días Gratis para <span style={{
            background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>Conectar tu WhatsApp</span>!
        </h2>

        {/* Descripción */}
        <p style={{
          fontSize: 14,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: 24,
          maxWidth: 460,
          margin: '0 auto 24px auto'
        }}>
          Para generar tu código QR y poner a tu vendedor con Inteligencia Artificial a responder 24/7, registra tu método de pago de forma 100% segura.
        </p>

        {/* Caja de Beneficios Clave (Alex Hormozi) */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '16px 20px',
          textAlign: 'left',
          marginBottom: 26,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 15 }}>✓</span>
            <span><strong>$0 COP Cobrados Hoy:</strong> Tu prueba es 100% gratuita durante 7 días completos.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 15 }}>✓</span>
            <span><strong>Acepta todas las tarjetas:</strong> Crédito, Débito Bancolombia o <strong>Tarjeta Nequi Visa</strong>.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 15 }}>✓</span>
            <span><strong>300 Mensajes IA Incluidos:</strong> Atiende clientes y cierra pedidos y citas sin gastar un solo peso.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 15 }}>✓</span>
            <span><strong>Cero Riesgo:</strong> Cancela con 1 clic en cualquier momento antes del día 7 sin cobro alguno.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
            <span>🎁</span>
            <span>¡Incluye Catálogo con fotos, agendamiento y RAG anti-alucinación!</span>
          </div>

          {/* Nota de validación de seguridad de $1 USD */}
          <div style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 8,
            fontSize: 11,
            color: '#94a3b8',
            lineHeight: 1.4
          }}>
            ℹ️ <strong>Validación de Seguridad Bancaria:</strong> Mercado Pago podría realizar un cobro temporal de verificación de seguridad (~$1 USD o ~$4.000 COP) que se <strong>anula y reembolsa automáticamente de inmediato</strong>. Tu prueba es 100% gratuita ($0 COP).
          </div>
        </div>

        {/* Botón de Acción Principal */}
        <button
          onClick={handleGoToPricing}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '15px 24px',
            fontSize: 15,
            fontWeight: 800,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
            boxShadow: '0 10px 30px rgba(0, 207, 255, 0.3)',
            cursor: 'pointer',
            border: 'none',
            color: '#080E1F',
            letterSpacing: '0.3px',
            marginBottom: 12
          }}
        >
          🚀 Activar 7 Días Gratis ($0 Hoy) y Obtener QR →
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          🔒 Procesamiento seguro y encriptado por <strong>Mercado Pago Colombia</strong>
        </p>
      </div>
    </div>
  );
}
