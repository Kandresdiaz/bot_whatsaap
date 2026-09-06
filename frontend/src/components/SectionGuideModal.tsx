'use client';
import { useState, useEffect } from 'react';

export interface HowToStep {
  step: number;
  title: string;
  desc: string;
}

export interface SectionGuide {
  id: string;
  path: string;
  icon: string;
  badge: string;
  title: string;
  summary: string;
  tourStepIndex?: number;
  howToConfigure: HowToStep[];
  keyPoints: {
    icon: string;
    title: string;
    desc: string;
  }[];
  quickTip?: string;
}

export const SECTION_GUIDES: Record<string, SectionGuide> = {
  inicio: {
    id: 'inicio',
    path: '/dashboard',
    icon: '🏠',
    badge: 'Centro de Control',
    title: 'Panel de Inicio y Métricas en Vivo',
    summary: 'Tu tablero principal para supervisar en tiempo real el rendimiento del bot, las ventas concretadas y el consumo de recursos.',
    tourStepIndex: 0,
    howToConfigure: [
      {
        step: 1,
        title: 'Revisa tus métricas en vivo',
        desc: 'Monitorea las ventas cerradas, horas de trabajo ahorradas y el consumo de mensajes de IA del mes en curso.',
      },
      {
        step: 2,
        title: 'Controla el bot con el switch maestro',
        desc: 'Usa el interruptor superior "Bot ON/OFF" para encender o pausar las respuestas automáticas de WhatsApp.',
      },
      {
        step: 3,
        title: 'Navega a los módulos de tu negocio',
        desc: 'Usa el menú lateral para cargar productos, agendar citas en el calendario, subir FAQs o conectar WhatsApp.',
      },
    ],
    keyPoints: [
      {
        icon: '📊',
        title: 'Ventas y Conversión',
        desc: 'Visualiza cuántos pedidos y ventas ha cerrado la inteligencia artificial automáticamente sin intervención humana.',
      },
      {
        icon: '⚡',
        title: 'Tiempo Ahorrado',
        desc: 'Cálculo de horas de atención al cliente ahorradas para que puedas enfocarte en hacer crecer tu negocio.',
      },
      {
        icon: '💬',
        title: 'Consumo de Mensajes IA',
        desc: 'Barra de cuota mensual en vivo para saber cuántas respuestas ha generado el bot y cuándo necesitas ampliar tu plan.',
      },
      {
        icon: '🎛️',
        title: 'Interruptor Maestro Bot ON/OFF',
        desc: 'Controla si el bot responde automáticamente en WhatsApp o si está temporalmente pausado para responder manualmente.',
      },
    ],
    quickTip: '💡 Puedes pausar o activar el bot en cualquier momento usando el switch superior.',
  },
  connect: {
    id: 'connect',
    path: '/dashboard/connect',
    icon: '📱',
    badge: 'Conexión WhatsApp',
    title: 'Conectar WhatsApp con Código QR',
    summary: 'Vincula tu número de WhatsApp para que la IA atienda a tus clientes 24/7 sin necesidad de mantener una computadora encendida.',
    tourStepIndex: 1,
    howToConfigure: [
      {
        step: 1,
        title: 'Guarda los datos de tu empresa',
        desc: 'Completa el nombre de tu negocio, qué vendes y cómo cobrar para que el bot sepa cómo presentarse y vender.',
      },
      {
        step: 2,
        title: 'Escanea el código QR en pantalla',
        desc: 'Abre WhatsApp en tu teléfono → Ajustes → Dispositivos vinculados → Vincular un dispositivo y apunta la cámara al QR.',
      },
      {
        step: 3,
        title: 'Enciende el bot cuando estés listo',
        desc: 'Por seguridad arranca apagado (OFF). Cuando quieras que atienda a tus clientes, actívalo con el switch superior.',
      },
    ],
    keyPoints: [
      {
        icon: '⚙️',
        title: 'Pre-configuración Obligatoria',
        desc: 'El bot se configura primero con los datos de tu empresa antes de escanear el QR para que quede listo desde el primer segundo.',
      },
      {
        icon: '📷',
        title: 'Escaneo Estilo WhatsApp Web',
        desc: 'Abre WhatsApp en tu celular → Ajustes → Dispositivos vinculados → Vincular dispositivo y apunta la cámara al código QR.',
      },
      {
        icon: '⏸️',
        title: 'Arranque en OFF por Seguridad',
        desc: 'Por seguridad anti-baneo y tranquilidad, el bot arranca apagado. Podrás encenderlo cuando quieras con el botón superior.',
      },
      {
        icon: '🔄',
        title: 'Reconexión Automática',
        desc: 'Si se reinicia el servidor o pierdes internet, el sistema intenta restaurar la sesión automáticamente sin perder tu configuración.',
      },
    ],
    quickTip: '💡 Tu configuración comercial queda guardada de forma permanente aunque desconectes WhatsApp.',
  },
  conversations: {
    id: 'conversations',
    path: '/dashboard/conversations',
    icon: '💬',
    badge: 'Chats en Vivo',
    title: 'Conversaciones y Supervisión Humana',
    summary: 'Bandeja estilo WhatsApp Web para monitorear lo que el bot responde a cada contacto y tomar el control cuando lo desees.',
    tourStepIndex: 3,
    howToConfigure: [
      {
        step: 1,
        title: 'Supervisa los chats en tiempo real',
        desc: 'Haz clic en cualquier conversación de la lista izquierda para leer los mensajes del cliente y la IA al instante.',
      },
      {
        step: 2,
        title: 'Pausa la IA si quieres responder tú',
        desc: 'Haz clic en el botón "Pausar IA" de la conversación para responder manualmente sin interferencia del bot.',
      },
      {
        step: 3,
        title: 'Reanuda la IA cuando termines',
        desc: 'Haz clic en "Reanudar IA" para que el bot vuelva a encargarse de responder las futuras preguntas de ese cliente.',
      },
    ],
    keyPoints: [
      {
        icon: '👁️',
        title: 'Supervisión en Tiempo Real',
        desc: 'Lee las conversaciones completas entre los clientes y la IA al instante tal como ocurren en WhatsApp.',
      },
      {
        icon: '🛑',
        title: 'Pausar IA por Chat',
        desc: '¿Quieres atender a un cliente especial personalmente? Pausa la IA solo para ese chat con un clic y responde como humano.',
      },
      {
        icon: '▶️',
        title: 'Reanudar IA',
        desc: 'Cuando termines de hablar con el cliente, reactiva el bot para que siga atendiendo automáticamente sus futuras consultas.',
      },
      {
        icon: '🏷️',
        title: 'Filtros y Búsqueda',
        desc: 'Busca por nombre, teléfono o estado de conversación para encontrar rápidamente pedidos o preguntas clave.',
      },
    ],
    quickTip: '💡 Pausar la IA en un chat no afecta a los demás clientes; el bot sigue atendiendo a todos los demás en paralelo.',
  },
  products: {
    id: 'products',
    path: '/dashboard/products',
    icon: '📦',
    badge: 'Catálogo Comercial',
    title: 'Catálogo de Productos y Fotos Multimedia',
    summary: 'Gestiona los productos y servicios que tu bot promocionará y venderá a los prospectos que escriban por WhatsApp.',
    tourStepIndex: 4,
    howToConfigure: [
      {
        step: 1,
        title: 'Crea tu producto o servicio',
        desc: 'Haz clic en "+ Nuevo Producto", asigna el nombre comercial y el precio exacto en pesos.',
      },
      {
        step: 2,
        title: 'Sube la foto del producto',
        desc: 'Sube una imagen atractiva. El bot la enviará directamente al chat de WhatsApp cuando un cliente pregunte por él.',
      },
      {
        step: 3,
        title: 'Añade detalles y beneficios',
        desc: 'Escribe características, tallas, medidas o beneficios para que el bot responda dudas y objeciones de inmediato.',
      },
    ],
    keyPoints: [
      {
        icon: '🖼️',
        title: 'Envío de Fotos por WhatsApp',
        desc: 'Si subes una foto a tu producto, el bot enviará la imagen directamente al chat de WhatsApp del cliente interesado.',
      },
      {
        icon: '💰',
        title: 'Precios Claros',
        desc: 'Configura precios exactos en pesos para que el bot responda con precisión cuando pregunten "¿Cuánto cuesta?".',
      },
      {
        icon: '📝',
        title: 'Descripción y Beneficios',
        desc: 'Añade detalles, tallas, colores o ingredientes para que la IA responda preguntas técnicas y objeciones.',
      },
      {
        icon: '⚡',
        title: 'Venta Sugerida (Upselling)',
        desc: 'El bot sugiere productos complementarios basados en lo que el cliente esté consultando.',
      },
    ],
    quickTip: '💡 Los productos que crees aquí son 100% tuyos y ningún otro cliente de la plataforma los verá.',
  },
  orders: {
    id: 'orders',
    path: '/dashboard/orders',
    icon: '🛍️',
    badge: 'Ventas y Pedidos',
    title: 'Registro de Pedidos y Ventas Concretadas',
    summary: 'Consulta todos los pedidos generados por el bot en WhatsApp con datos del cliente y monto total.',
    tourStepIndex: 5,
    howToConfigure: [
      {
        step: 1,
        title: 'Revisa las órdenes recibidas',
        desc: 'Cada vez que el bot cierra una venta en WhatsApp, la orden aparece registrada aquí con fecha y hora.',
      },
      {
        step: 2,
        title: 'Consulta los datos del comprador',
        desc: 'Verifica el nombre, teléfono de contacto y dirección de entrega que el bot solicitó al cliente.',
      },
      {
        step: 3,
        title: 'Actualiza el estado de despacho',
        desc: 'Cambia el estado entre Pendiente, Confirmado, Enviado o Entregado para llevar el control de tus despachos.',
      },
    ],
    keyPoints: [
      {
        icon: '📋',
        title: 'Datos del Comprador',
        desc: 'Nombre, teléfono y dirección recopilados por el bot durante la conversación.',
      },
      {
        icon: '💵',
        title: 'Monto y Productos',
        desc: 'Detalle de qué artículos pidió el cliente y el valor a cobrar.',
      },
      {
        icon: '✅',
        title: 'Estados de Pedido',
        desc: 'Marca pedidos como pendientes, confirmados, enviados o entregados.',
      },
    ],
    quickTip: '💡 Puedes exportar tu historial para preparar tus despachos del día.',
  },
  appointments: {
    id: 'appointments',
    path: '/dashboard/appointments',
    icon: '📅',
    badge: 'Agenda Comercial',
    title: 'Calendario y Citas Agendadas',
    summary: 'Visualiza las citas o reuniones agendadas automáticamente por el bot para servicios, consultorios o barberías.',
    tourStepIndex: 6,
    howToConfigure: [
      {
        step: 1,
        title: 'Activa "Agendar Citas" como objetivo',
        desc: 'Ve a la sección "Configurar Bot" y selecciona "Agendar Citas" como objetivo comercial principal de tu asistente.',
      },
      {
        step: 2,
        title: 'Gestiona tu calendario en vivo',
        desc: 'Consulta en vista de calendario interactivo o tabla las reservas que la IA ha coordinado con tus clientes en WhatsApp.',
      },
      {
        step: 3,
        title: 'Añade o edita citas manuales',
        desc: 'Usa el botón "+ Nueva Cita" para agendar citas directas o haz clic en cualquier turno para ver o editar sus datos.',
      },
    ],
    keyPoints: [
      {
        icon: '⏱️',
        title: 'Duración de Cita',
        desc: 'Define bloques de tiempo (ej: 30 o 60 minutos) para evitar cruces de agenda.',
      },
      {
        icon: '👤',
        title: 'Datos del Asistente',
        desc: 'Nombre y teléfono del cliente registrado directamente en el calendario.',
      },
      {
        icon: '🔔',
        title: 'Confirmación en WhatsApp',
        desc: 'El bot envía la confirmación de fecha y hora inmediatamente al cliente.',
      },
    ],
    quickTip: '💡 Si tu modelo es por turnos, asegúrate de activar "Agendar Citas" como objetivo comercial en Configurar Bot.',
  },
  knowledge: {
    id: 'knowledge',
    path: '/dashboard/knowledge',
    icon: '🧠',
    badge: 'Base de Conocimiento',
    title: 'Knowledge Base (FAQs, Políticas y PDFs)',
    summary: 'El cerebro de tu bot. Entrena a la IA con información específica de tu negocio para que responda cualquier duda.',
    tourStepIndex: 7,
    howToConfigure: [
      {
        step: 1,
        title: 'Agrega preguntas frecuentes (FAQs)',
        desc: 'Haz clic en "+ Nueva Pregunta" y escribe preguntas típicas: ubicación, métodos de pago, garantías y horarios.',
      },
      {
        step: 2,
        title: 'Sube documentos o cartas en PDF',
        desc: 'Carga archivos PDF con tu carta, tarifario o políticas; la inteligencia artificial extraerá y memorizará su contenido.',
      },
      {
        step: 3,
        title: 'El bot responde al instante',
        desc: 'Cualquier conocimiento que agregues aquí estará disponible de inmediato en WhatsApp sin necesidad de reiniciar el bot.',
      },
    ],
    keyPoints: [
      {
        icon: '❓',
        title: 'Preguntas Frecuentes (FAQs)',
        desc: 'Enseña respuestas exactas a: "¿Hacen envíos a domicilio?", "¿Dónde están ubicados?", "¿Qué garantía ofrecen?".',
      },
      {
        icon: '📄',
        title: 'Subir PDFs y Menús',
        desc: 'Puedes cargar documentos en PDF (tarifarios, menús, catálogos extensos) y la IA extraerá el conocimiento automáticamente.',
      },
      {
        icon: '🖼️',
        title: 'Imágenes Informativas',
        desc: 'Sube fotos de tu local, tablas de medidas o certificados para que el bot las envíe cuando el cliente las solicite.',
      },
    ],
    quickTip: '💡 Mientras más preguntas frecuentes agregues, más inteligente y certero será tu bot al responder.',
  },
  'bot-config': {
    id: 'bot-config',
    path: '/dashboard/bot-config',
    icon: '⚙️',
    badge: 'Ajustes del Asistente',
    title: 'Configuración del Bot, Tono y Cierre',
    summary: 'Define cómo debe actuar tu asistente comercial, qué personalidad tendrá y cómo concretará el pago o reserva.',
    tourStepIndex: 8,
    howToConfigure: [
      {
        step: 1,
        title: 'Selecciona tu objetivo comercial',
        desc: 'Elige si la meta principal del bot es Vender Productos/Servicios o Agendar Citas en tu calendario.',
      },
      {
        step: 2,
        title: 'Elige el tono de voz',
        desc: 'Selecciona la personalidad: Vendedor Persuasivo, Cálido y Amigable, Profesional o Casual según tu público.',
      },
      {
        step: 3,
        title: 'Configura tus datos de cierre o pago',
        desc: 'Ingresa tu enlace de pago (Nequi, Daviplata, Wompi, etc.) o la instrucción exacta que el bot dará para cobrar.',
      },
    ],
    keyPoints: [
      {
        icon: '🎯',
        title: 'Objetivo Principal',
        desc: 'Elige si la meta del bot es Vender Productos directamente o Agendar Citas en tu calendario.',
      },
      {
        icon: '🎭',
        title: 'Tono de Voz y Personalidad',
        desc: 'Configura su estilo: Vendedor Persuasivo, Cálido y Amigable, Profesional y Corporativo, o Fresco y Casual.',
      },
      {
        icon: '💳',
        title: 'Canal de Cierre / Datos de Pago',
        desc: 'Coloca tu enlace de Nequi, Wompi, WhatsApp comercial o la instrucción exacta que el bot dará para cobrar.',
      },
      {
        icon: '⏰',
        title: 'Horarios de Atención',
        desc: 'Define las horas de oficina para que fuera de horario el bot envíe un mensaje amable avisando que responderán pronto.',
      },
    ],
    quickTip: '💡 Puedes probar y cambiar la personalidad de tu bot tantas veces como desees sin costo adicional.',
  },
};

interface Props {
  isOpen: boolean;
  sectionKey: string;
  isFirstVisit?: boolean;
  onClose: (viewedKey?: string) => void;
  onLaunchSpotlight?: (stepIndex: number) => void;
}

export default function SectionGuideModal({ isOpen, sectionKey, isFirstVisit = false, onClose, onLaunchSpotlight }: Props) {
  const [activeKey, setActiveKey] = useState<string>(sectionKey || 'inicio');
  const [activeTab, setActiveTab] = useState<'config' | 'features'>('config');

  useEffect(() => {
    if (sectionKey && SECTION_GUIDES[sectionKey]) {
      setActiveKey(sectionKey);
    }
  }, [sectionKey]);

  if (!isOpen) return null;

  const currentGuide = SECTION_GUIDES[activeKey] || SECTION_GUIDES['inicio'];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 10, 24, 0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 99998,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #0B132B 0%, #0F1D40 100%)',
        border: '1px solid rgba(0, 207, 255, 0.4)',
        borderRadius: 18,
        maxWidth: 580,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75), 0 0 35px rgba(26, 107, 255, 0.25)',
        color: '#FFFFFF',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '92vh',
        animation: 'fadeIn 0.2s ease-out',
      }}>
        {/* Cabecera con selector de pestañas de todas las secciones */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(5, 10, 24, 0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🧭</span>
              <strong style={{ fontSize: 14, color: '#00CFFF', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Tutorial de la Sección
              </strong>
            </div>
            <button
              onClick={() => onClose(activeKey)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94A3B8',
                borderRadius: 8,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 14,
              }}
              title="Cerrar u omitir"
            >
              ✕
            </button>
          </div>

          {/* Aviso especial de Primera Visita */}
          {isFirstVisit && (
            <div style={{
              background: 'rgba(0, 207, 255, 0.12)',
              border: '1px solid rgba(0, 207, 255, 0.3)',
              borderRadius: 8,
              padding: '7px 12px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#00CFFF',
            }}>
              <span>✨ <strong>Primera visita a este apartado:</strong> Este tutorial solo se abre automáticamente la primera vez.</span>
              <span style={{ opacity: 0.8, fontSize: 11, background: 'rgba(0,207,255,0.2)', padding: '2px 6px', borderRadius: 4 }}>No se repetirá</span>
            </div>
          )}

          {/* Botones de navegación directa entre secciones */}
          <div style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 4,
            scrollbarWidth: 'none',
          }}>
            {Object.values(SECTION_GUIDES).map(g => (
              <button
                key={g.id}
                onClick={() => {
                  setActiveKey(g.id);
                  setActiveTab('config');
                }}
                style={{
                  background: activeKey === g.id ? 'rgba(0, 207, 255, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                  border: activeKey === g.id ? '1px solid #00CFFF' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: activeKey === g.id ? '#00CFFF' : '#94A3B8',
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{g.icon}</span>
                <span>{g.badge}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contenido de la sección seleccionada */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, boxShadow: '0 6px 18px rgba(0, 207, 255, 0.35)',
            }}>
              {currentGuide.icon}
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#00CFFF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {currentGuide.badge}
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                {currentGuide.title}
              </h2>
            </div>
          </div>

          <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            {currentGuide.summary}
          </p>

          {/* Selector de Pestañas: Cómo configurarlo vs Qué hace este apartado */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setActiveTab('config')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: activeTab === 'config' ? '1px solid #00CFFF' : '1px solid rgba(255, 255, 255, 0.1)',
                background: activeTab === 'config' ? 'rgba(0, 207, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: activeTab === 'config' ? '#00CFFF' : '#94A3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <span>⚙️</span> ¿Cómo configurarlo?
            </button>
            <button
              onClick={() => setActiveTab('features')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: activeTab === 'features' ? '1px solid #00CFFF' : '1px solid rgba(255, 255, 255, 0.1)',
                background: activeTab === 'features' ? 'rgba(0, 207, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: activeTab === 'features' ? '#00CFFF' : '#94A3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <span>💡</span> ¿Qué hace este apartado?
            </button>
          </div>

          {/* Pestaña: Pasos de Configuración */}
          {activeTab === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {currentGuide.howToConfigure.map((item) => (
                <div
                  key={item.step}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(0, 207, 255, 0.18)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
                    color: '#050A18',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: '#F8FAFC', display: 'block', marginBottom: 3 }}>
                      {item.title}
                    </strong>
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.45 }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pestaña: Puntos Clave y Funciones */}
          {activeTab === 'features' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {currentGuide.keyPoints.map((pt, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 18, marginTop: 1 }}>{pt.icon}</span>
                  <div>
                    <strong style={{ fontSize: 13, color: '#F8FAFC', display: 'block', marginBottom: 2 }}>
                      {pt.title}
                    </strong>
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.45 }}>
                      {pt.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentGuide.quickTip && (
            <div style={{
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: '#FDE047',
              lineHeight: 1.45,
            }}>
              {currentGuide.quickTip}
            </div>
          )}
        </div>

        {/* Footer con botones de acción */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(5, 10, 24, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => onClose(activeKey)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#94A3B8',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            ✕ Omitir tutorial
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {currentGuide.tourStepIndex !== undefined && onLaunchSpotlight && (
              <button
                onClick={() => {
                  onClose(activeKey);
                  onLaunchSpotlight(currentGuide.tourStepIndex!);
                }}
                style={{
                  background: 'rgba(0, 207, 255, 0.12)',
                  border: '1px solid rgba(0, 207, 255, 0.35)',
                  color: '#00CFFF',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                title="Resaltar con foco visual en la pantalla real"
              >
                <span>🔦</span> Resaltar en pantalla
              </button>
            )}

            <button
              onClick={() => onClose(activeKey)}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700 }}
            >
              ✓ Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
