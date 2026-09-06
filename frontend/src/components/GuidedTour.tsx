'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export interface TourStep {
  target: string; // selector CSS, ej: '[data-tour="nav-inicio"]'
  title: string;
  shortTitle: string;
  description: string;
  badge?: string;
  icon?: string;
  position?: 'right' | 'bottom' | 'top' | 'left';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-inicio"]',
    icon: '🏠',
    shortTitle: 'Inicio',
    badge: 'Paso 1 de 9',
    title: 'Panel de Inicio y Métricas',
    description: 'Tu centro de comando. Aquí ves en tiempo real las ventas cerradas por el bot, pedidos concretados, tiempo ahorrado y el consumo de mensajes de IA.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-connect"]',
    icon: '📱',
    shortTitle: 'Conectar',
    badge: 'Paso 2 de 9',
    title: 'Conectar WhatsApp (QR)',
    description: 'Aquí escaneas el código QR desde tu celular para vincular tu WhatsApp. Tu bot se preconfigura primero para que quede listo desde el primer segundo.',
    position: 'right',
  },
  {
    target: '[data-tour="bot-toggle"]',
    icon: '🎛️',
    shortTitle: 'Bot ON/OFF',
    badge: 'Paso 3 de 9',
    title: 'Interruptor Maestro Bot ON/OFF',
    description: 'Tu control total. Por seguridad, el bot arranca apagado (OFF) al vincular WhatsApp para que revises todo con calma. Cuando quieras que responda 24/7, solo actívalo aquí.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-conversations"]',
    icon: '💬',
    shortTitle: 'Chats',
    badge: 'Paso 4 de 9',
    title: 'Conversaciones en Vivo',
    description: 'Bandeja completa estilo WhatsApp Web. Puedes supervisar en vivo lo que responde la IA a cada contacto o pausar la IA por chat para atender manualmente cuando gustes.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-products"]',
    icon: '📦',
    shortTitle: 'Productos',
    badge: 'Paso 5 de 9',
    title: 'Catálogo de Productos',
    description: 'Sube tus productos con fotos, precios y descripciones. El bot enviará fotos multimedia de tus productos automáticamente en WhatsApp a los clientes interesados.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-orders"]',
    icon: '🛍️',
    shortTitle: 'Pedidos',
    badge: 'Paso 6 de 9',
    title: 'Pedidos y Ventas Concretadas',
    description: 'Registro de todas las compras y pedidos recopilados automáticamente por el bot en WhatsApp con datos del comprador y monto total.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-appointments"]',
    icon: '📅',
    shortTitle: 'Calendario',
    badge: 'Paso 7 de 9',
    title: 'Calendario y Citas Agendadas',
    description: 'Visualiza en tiempo real las citas, turnos y reuniones que la IA agenda automáticamente con tus clientes directamente en el calendario.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-knowledge"]',
    icon: '🧠',
    shortTitle: 'Knowledge',
    badge: 'Paso 8 de 9',
    title: 'Base de Conocimiento (FAQs y PDFs)',
    description: 'Entrena a la IA con información de tu empresa, preguntas frecuentes y documentos PDF para que resuelva cualquier duda de tus clientes.',
    position: 'right',
  },
  {
    target: '[data-tour="nav-bot-config"]',
    icon: '⚙️',
    shortTitle: 'Configuración',
    badge: 'Paso 9 de 9',
    title: 'Configuración del Bot',
    description: 'Ajusta el objetivo de tu asistente (vender productos vs agendar citas), su tono de voz (persuasivo, amigable o profesional), horarios y canal de cobro.',
    position: 'right',
  },
];

interface GuidedTourProps {
  userId: string;
  isOpen: boolean;
  initialStep?: number;
  onClose: () => void;
  onCompleteTour: () => void;
}

export default function GuidedTour({ userId, isOpen, initialStep, onClose, onCompleteTour }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState<number>(initialStep !== undefined ? initialStep : -1);
  const [highlightRect, setHighlightRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 100, left: 100 });
  const isUpdating = useRef(false);

  // Actualizar posición del foco y del popover cuando cambia el paso
  const updatePositions = useCallback(() => {
    if (currentStep < 0 || currentStep >= TOUR_STEPS.length) {
      setHighlightRect(null);
      return;
    }

    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.target);

    if (el) {
      const rect = el.getBoundingClientRect();
      const padding = 6;
      setHighlightRect({
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      // Calcular posición del popover
      const popoverWidth = Math.min(360, window.innerWidth - 32);
      const popoverHeight = 220;
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        // En móviles, fijar abajo o arriba para no tapar
        setPopoverPos({
          left: Math.max(16, (window.innerWidth - popoverWidth) / 2),
          top: Math.min(window.innerHeight - popoverHeight - 20, Math.max(20, rect.bottom + 12)),
        });
      } else {
        // En desktop: colocar a la derecha del elemento del sidebar
        let targetLeft = rect.right + 16;
        let targetTop = rect.top;

        if (targetLeft + popoverWidth > window.innerWidth) {
          targetLeft = Math.max(16, rect.left - popoverWidth - 16);
        }
        if (targetTop + popoverHeight > window.innerHeight) {
          targetTop = Math.max(16, window.innerHeight - popoverHeight - 20);
        }

        setPopoverPos({ left: targetLeft, top: targetTop });
      }

      // Asegurar que el elemento esté a la vista
      if (!isUpdating.current) {
        isUpdating.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => { isUpdating.current = false; }, 300);
      }
    } else {
      // Si el elemento no se encuentra, centrar el popover
      setHighlightRect(null);
      setPopoverPos({
        left: Math.max(16, (window.innerWidth - 360) / 2),
        top: Math.max(80, window.innerHeight / 2 - 120),
      });
    }
  }, [currentStep]);

  useEffect(() => {
    if (isOpen) {
      if (initialStep !== undefined) {
        setCurrentStep(initialStep);
      }
      updatePositions();
      window.addEventListener('resize', updatePositions);
      window.addEventListener('scroll', updatePositions, true);
      return () => {
        window.removeEventListener('resize', updatePositions);
        window.removeEventListener('scroll', updatePositions, true);
      };
    }
  }, [isOpen, initialStep, currentStep, updatePositions]);

  if (!isOpen) return null;

  const markTourDone = () => {
    if (userId) {
      localStorage.setItem(`botwa_tour_completed_${userId}`, 'true');
    }
    localStorage.setItem('botwa_tour_seen', 'true');
  };

  const handleStartTour = () => {
    markTourDone();
    setCurrentStep(0);
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFinish = () => {
    markTourDone();
    setCurrentStep(-1);
    onClose();
    onCompleteTour();
  };

  const handleSkip = () => {
    markTourDone();
    setCurrentStep(-1);
    onClose();
    onCompleteTour();
  };

  // 1. MODAL / TARJETA DE INVITACIÓN AL RECORRIDO (Tomar u Omitir)
  if (currentStep === -1) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 24, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}>
        <div style={{
          background: '#0B132B',
          border: '1px solid rgba(0, 207, 255, 0.4)',
          borderRadius: 18,
          maxWidth: 480,
          width: '100%',
          padding: '28px 24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(26, 107, 255, 0.25)',
          color: '#FFFFFF',
          textAlign: 'center',
          animation: 'fadeIn 0.25s ease-out',
        }}>
          <div style={{
            width: 60, height: 60, margin: '0 auto 16px auto',
            borderRadius: 16, background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, boxShadow: '0 8px 24px rgba(0, 207, 255, 0.35)'
          }}>
            🧭
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px 0', color: '#FFFFFF' }}>
            ¡Bienvenido a tu Panel de BotWA!
          </h2>

          <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            ¿Te gustaría hacer un recorrido rápido en pantalla para conocer cada sección, cómo funciona tu bot y cómo sacarle el máximo provecho?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleStartTour}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              🚀 Tomar el recorrido guiado
            </button>

            <button
              onClick={handleSkip}
              className="btn btn-ghost"
              style={{
                width: '100%',
                padding: '10px 18px',
                fontSize: 13,
                color: '#94A3B8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Omitir recorrido e ir directo a configurar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. RECORRIDO GUIADO PASO A PASO EN VIVO
  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99998, pointerEvents: 'none' }}>
      {/* Fondo oscuro con recorte / Spotlight sobre el elemento */}
      <svg
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'auto',
        }}
        onClick={handleNext}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left}
                y={highlightRect.top}
                width={highlightRect.width}
                height={highlightRect.height}
                rx="10"
                ry="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(5, 10, 24, 0.72)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Halo de luz / borde azul brillante alrededor del elemento resaltado */}
      {highlightRect && (
        <div
          style={{
            position: 'fixed',
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            borderRadius: 10,
            border: '2px solid #00CFFF',
            boxShadow: '0 0 25px rgba(0, 207, 255, 0.5), inset 0 0 15px rgba(0, 207, 255, 0.2)',
            pointerEvents: 'none',
            transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
            zIndex: 99999,
          }}
        />
      )}

      {/* Tarjeta Flotante Contextual explicativa con botones Siguiente / Anterior */}
      <div
        style={{
          position: 'fixed',
          top: popoverPos.top,
          left: popoverPos.left,
          width: Math.min(360, window.innerWidth - 32),
          background: 'linear-gradient(145deg, #0B132B 0%, #0F1D40 100%)',
          border: '1px solid rgba(0, 207, 255, 0.45)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75), 0 0 20px rgba(26, 107, 255, 0.3)',
          borderRadius: 14,
          padding: '18px 20px',
          color: '#FFFFFF',
          pointerEvents: 'auto',
          zIndex: 100000,
          transition: 'top 0.3s ease, left 0.3s ease',
        }}
      >
        {/* Cabecera del paso */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{step.icon}</span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#00CFFF',
              background: 'rgba(0, 207, 255, 0.12)',
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px solid rgba(0, 207, 255, 0.3)',
            }}>
              {step.badge}
            </span>
          </div>

          <button
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Saltar recorrido"
          >
            Saltar ✕
          </button>
        </div>

        {/* Selector rápido directo de secciones */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              style={{
                background: currentStep === idx ? 'rgba(0, 207, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: currentStep === idx ? '1px solid #00CFFF' : '1px solid rgba(255, 255, 255, 0.08)',
                color: currentStep === idx ? '#00CFFF' : '#94A3B8',
                padding: '3px 7px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                transition: 'all 0.15s ease',
              }}
              title={s.title}
            >
              <span>{s.icon}</span>
              <span>{s.shortTitle}</span>
            </button>
          ))}
        </div>

        {/* Título y descripción */}
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0', color: '#F8FAFC' }}>
          {step.title}
        </h3>
        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          {step.description}
        </p>

        {/* Barra de progreso visual */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= currentStep ? '#00CFFF' : 'rgba(255, 255, 255, 0.1)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Botones de acción: Anterior / Siguiente */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {currentStep > 0 ? (
            <button
              onClick={handlePrev}
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '7px 12px', color: '#94A3B8' }}
            >
              ← Anterior
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            className="btn btn-primary"
            style={{
              fontSize: 12,
              padding: '8px 16px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isLast ? '¡Finalizar Recorrido! 🚀' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}
