'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

/**
 * Video explicativo de 1:20 que muestra, paso a paso, cómo se configura el bot.
 * No es un archivo de video: son escenas animadas con CSS, así que pesa unos KB,
 * no se descarga nada y no gasta ancho de banda del servidor.
 *
 * Se usa de dos formas:
 *   <SetupVideoButton />  → botón que abre el video en una ventana (panel)
 *   <SetupVideoCard />    → portada con play que abre lo mismo (landing)
 */

type Scene = { key: string; dur: number };

// Duración de cada escena en segundos (el orden es el mismo del JSX de abajo)
const SCENES: Scene[] = [
  { key: 'Intro', dur: 6 },
  { key: 'Entra', dur: 10 },
  { key: 'Negocio', dur: 14 },
  { key: 'Catálogo', dur: 12 },
  { key: 'El QR', dur: 15 },
  { key: 'Pruébalo', dur: 12 },
  { key: 'Panel', dur: 11 },
  { key: 'Fin', dur: 7 },
];

export const SETUP_STEPS: { title: string; desc: string }[] = [
  {
    title: 'Entra con Google',
    desc: 'En la página de inicio de sesión toca «Continuar con Google». No hay que inventar contraseñas.',
  },
  {
    title: 'Configuración inicial (4 pantallas)',
    desc: 'Nombre, ciudad y qué ofreces · si el bot debe vender o agendar · tu link de pago o Nequi y los precios clave · el tono con el que habla.',
  },
  {
    title: 'Knowledge Base',
    desc: 'Sube tu menú o catálogo en PDF y acepta las «FAQs recomendadas» de tu tipo de negocio. De ahí salen los productos y las respuestas.',
  },
  {
    title: 'Conectar WhatsApp',
    desc: 'Toca «Conectar WhatsApp», espera el QR y escanéalo desde el celular: Ajustes → Dispositivos vinculados → Vincular un dispositivo.',
  },
  {
    title: 'Probar mi bot',
    desc: 'Escríbele como si fueras tu cliente. Si le falta un dato, vuelve al paso 3 y agrégalo.',
  },
  {
    title: 'El día a día',
    desc: 'Conversaciones, Pedidos y Citas te llegan al panel. Puedes pausar el bot o responder tú un chat cuando quieras.',
  },
];

const TOTAL_LABEL = '1:20';

// ── Reproductor ────────────────────────────────────────────────────────────────
export function SetupVideoPlayer() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const accRef = useRef(0);
  const segRef = useRef<HTMLDivElement>(null);

  // QR decorativo: 21x21 con los tres cuadros de las esquinas
  const qrCells = useMemo(() => {
    const N = 21;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const zones = [
      [0, 0],
      [0, N - 7],
      [N - 7, 0],
    ];
    const cells: { on: boolean; delay: number }[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let on: boolean | null = null;
        for (const [zr, zc] of zones) {
          if (r >= zr && r < zr + 7 && c >= zc && c < zc + 7) {
            const dr = r - zr;
            const dc = c - zc;
            const edge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            on = edge || core;
            break;
          }
        }
        cells.push({ on: on === null ? rnd() > 0.52 : on, delay: (r + c) * 14 + 200 });
      }
    }
    return cells;
  }, []);

  const paint = useCallback((i: number, acc: number) => {
    const bars = segRef.current?.children;
    if (!bars) return;
    for (let k = 0; k < bars.length; k++) {
      const f = k < i ? 1 : k > i ? 0 : Math.min(1, acc / (SCENES[i].dur * 1000));
      (bars[k] as HTMLElement).style.setProperty('--f', String(f));
    }
  }, []);

  const goTo = useCallback(
    (i: number) => {
      accRef.current = 0;
      setIdx(i);
      setPlaying(true);
      paint(i, 0);
    },
    [paint],
  );

  // Reloj del video: avanza la escena y pinta la barra sin re-renderizar cada frame
  useEffect(() => {
    paint(idx, accRef.current);
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 120);
      last = now;
      accRef.current += dt;
      const dur = SCENES[idx].dur * 1000;
      if (accRef.current >= dur) {
        if (idx < SCENES.length - 1) {
          accRef.current = 0;
          setIdx(idx + 1);
          return;
        }
        accRef.current = dur;
        paint(idx, dur);
        setPlaying(false);
        return;
      }
      paint(idx, accRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, paint]);

  const finished = !playing && idx === SCENES.length - 1;
  const toggle = () => {
    if (finished) {
      goTo(0);
      return;
    }
    setPlaying(p => !p);
  };

  return (
    <div className="sv">
      <style>{SETUP_VIDEO_CSS}</style>

      <div className={`sv-stage${playing ? '' : ' sv-paused'}`}>
        {/* 0 · INTRO */}
        <section className="sv-scene" hidden={idx !== 0}>
          <div className="sv-logo">
            <i>🤖</i> BotWA
          </div>
          <div className="sv-center">
            <h2>
              Tu WhatsApp,
              <br />
              contestando solo
            </h2>
            <p className="sv-big">6 pasos · sin saber nada de tecnología</p>
            <div className="sv-six">
              <span className="sv-chip">1 · Entra</span>
              <span className="sv-chip">2 · Tu negocio</span>
              <span className="sv-chip">3 · Tu catálogo</span>
              <span className="sv-chip">4 · El QR</span>
              <span className="sv-chip">5 · Pruébalo</span>
              <span className="sv-chip">6 · Míralo</span>
            </div>
          </div>
        </section>

        {/* 1 · ENTRAR */}
        <section className="sv-scene" hidden={idx !== 1}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 1</span>
            <h2>Entra con tu Google</h2>
          </div>
          <div className="sv-mock">
            <div className="sv-card" style={{ flex: 1, position: 'relative' }}>
              <div className="sv-bar">
                <span className="sv-dot" />
                <span className="sv-dot" />
                <span className="sv-dot" />
                <span style={{ marginLeft: '.4em' }}>tu-panel.com/login</span>
              </div>
              <div className="sv-stack">
                <div className="sv-logo" style={{ fontSize: '1.3em' }}>
                  <i>🤖</i> BotWA
                </div>
                <span className="sv-lbl">INICIAR SESIÓN</span>
                <div className="sv-google">
                  <span style={{ fontSize: '1.1em', fontWeight: 800 }}>G</span> Continuar con Google
                  <span className="sv-ripple" />
                </div>
                <div className="sv-ok sv-d46">✓ Ya estás dentro</div>
              </div>
              <svg className="sv-cursor sv-d10" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 2l7 18 2.2-6.6L20 11z" fill="#fff" stroke="#0A1020" strokeWidth="1.4" />
              </svg>
            </div>
          </div>
          <p className="sv-cap">
            Abre la página, toca <b>«Continuar con Google»</b> y listo: no hay que inventar contraseñas.
          </p>
        </section>

        {/* 2 · TU NEGOCIO */}
        <section className="sv-scene" hidden={idx !== 2}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 2</span>
            <h2>Cuéntale cómo es tu negocio</h2>
          </div>
          <div className="sv-mock">
            <div className="sv-card" style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sv-lbl">CONFIGURACIÓN INICIAL · PASO 1 DE 4</span>
                <span className="sv-lbl">✕</span>
              </div>
              <div className="sv-prog sv-prog4">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="sv-cols">
                <div className="sv-fields">
                  <span className="sv-lbl">NOMBRE DEL NEGOCIO *</span>
                  <div className="sv-bar sv-input">
                    <span className="sv-typed sv-d04">Pizzería Don Luca</span>
                    <span className="sv-caret" />
                  </div>
                  <span className="sv-lbl">¿QUÉ OFRECE TU NEGOCIO?</span>
                  <div className="sv-bar sv-input">
                    <span className="sv-typed sv-d21">Pizzas artesanales y combos</span>
                  </div>
                </div>
                <div className="sv-side">
                  <div className="sv-row sv-hl sv-d54">🎯 Vender</div>
                  <div className="sv-row sv-d70">💳 Nequi 300 123 4567</div>
                  <div className="sv-row sv-hl sv-d86">😊 Tono amigable</div>
                </div>
              </div>
            </div>
          </div>
          <p className="sv-cap">
            Son <b>4 pantallitas</b>: cómo se llama, qué vende, cómo le pagan y con qué tono habla.
          </p>
        </section>

        {/* 3 · CATÁLOGO */}
        <section className="sv-scene" hidden={idx !== 3}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 3</span>
            <h2>Súbele lo que ya sabes</h2>
          </div>
          <div className="sv-mock">
            <div className="sv-card" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5em' }}>
                <span style={{ fontWeight: 700 }}>🧠 Knowledge Base</span>
                <span className="sv-chip" style={{ marginLeft: 'auto' }}>
                  Texto
                </span>
                <span className="sv-chip">FAQ</span>
                <span className="sv-chip sv-chip-on">PDF</span>
              </div>
              <div className="sv-drop">
                <div className="sv-d03" style={{ fontSize: '1.6em' }}>
                  📄
                </div>
                <div className="sv-d05" style={{ fontSize: '.88em' }}>
                  menu-don-luca.pdf
                </div>
                <div className="sv-prog sv-prog1" style={{ width: '11em' }}>
                  <i />
                </div>
                <div className="sv-chips sv-d55" style={{ justifyContent: 'center' }}>
                  <span className="sv-chip">24 productos</span>
                  <span className="sv-chip">9 preguntas frecuentes</span>
                  <span className="sv-chip">fotos del catálogo</span>
                </div>
                <div className="sv-ok sv-d70">✓ El bot ya se lo aprendió</div>
              </div>
            </div>
          </div>
          <p className="sv-cap">
            Sube tu <b>menú o catálogo en PDF</b>. Él solo saca los productos, los precios y las respuestas.
          </p>
        </section>

        {/* 4 · QR */}
        <section className="sv-scene" hidden={idx !== 4}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 4</span>
            <h2>Conecta tu WhatsApp</h2>
          </div>
          <div className="sv-mock">
            <div className="sv-card sv-qrcard">
              <span className="sv-lbl">ESCANEA CON WHATSAPP</span>
              <div className="sv-qrbox">
                <div className="sv-qr">
                  {qrCells.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        background: c.on ? '#0A1020' : 'transparent',
                        animationDelay: `${c.delay}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className="sv-scan" />
              </div>
              <div className="sv-ok sv-d95">✓ ¡WhatsApp vinculado con éxito!</div>
            </div>
            <div className="sv-phone">
              <div className="sv-notch">
                <i />
              </div>
              <div className="sv-wahdr">WhatsApp</div>
              <div className="sv-row sv-d06">
                ⚙️ Ajustes <span className="sv-ar">›</span>
              </div>
              <div className="sv-row sv-hl sv-d22">
                🔗 Dispositivos vinculados <span className="sv-ar">›</span>
              </div>
              <div className="sv-row sv-d40">➕ Vincular un dispositivo</div>
              <div className="sv-row sv-d56">📷 Apunta a la pantalla</div>
            </div>
          </div>
          <p className="sv-cap">
            En tu celular: <b>Ajustes → Dispositivos vinculados → Vincular un dispositivo</b> y apunta al código.
          </p>
        </section>

        {/* 5 · PROBAR */}
        <section className="sv-scene" hidden={idx !== 5}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 5</span>
            <h2>Pruébalo tú mismo</h2>
          </div>
          <div className="sv-mock">
            <div className="sv-chat">
              <div className="sv-msg sv-in sv-m1">Hola, ¿tienen pizza familiar? 🍕</div>
              <div className="sv-typing">
                <i />
                <i />
                <i />
              </div>
              <div className="sv-msg sv-out sv-m2">
                ¡Hola! Sí 😊 La Familiar está en $45.000 y el envío es gratis desde $60.000.
              </div>
              <div className="sv-msg sv-in sv-m3">La quiero, ¿cómo pago?</div>
              <div className="sv-msg sv-out sv-m4">
                Te la aparto ✅ Pagas a Nequi 300 123 4567 y me envías el comprobante.
              </div>
            </div>
          </div>
          <p className="sv-cap">
            Entra a <b>«Probar mi bot»</b> y escríbele como si fueras tu cliente. Si responde bien, ya está.
          </p>
        </section>

        {/* 6 · PANEL */}
        <section className="sv-scene" hidden={idx !== 6}>
          <div className="sv-hdr">
            <span className="sv-badge">PASO 6</span>
            <h2>Míralo todo desde el panel</h2>
          </div>
          <div className="sv-mock" style={{ flexDirection: 'column', gap: '.8em' }}>
            <div className="sv-grid">
              <div className="sv-kpi">
                <b>12</b>
                <span>💬 Conversaciones</span>
              </div>
              <div className="sv-kpi">
                <b>3</b>
                <span>🛍️ Pedidos nuevos</span>
              </div>
              <div className="sv-kpi">
                <b>2</b>
                <span>📅 Citas de hoy</span>
              </div>
            </div>
            <div className="sv-chips sv-d06">
              <span className="sv-chip">⏸️ Pausar el bot cuando quieras</span>
              <span className="sv-chip">✍️ Responder tú mismo un chat</span>
              <span className="sv-chip">🔔 Aviso al WhatsApp del dueño</span>
            </div>
          </div>
          <p className="sv-cap">
            Los chats, los pedidos y las citas te llegan al panel. Y puedes <b>pausarlo</b> cuando quieras.
          </p>
        </section>

        {/* 7 · CIERRE */}
        <section className="sv-scene" hidden={idx !== 7}>
          <div className="sv-center">
            <div className="sv-logo" style={{ fontSize: '1.1em' }}>
              <i>🤖</i> BotWA
            </div>
            <h2>
              Listo.
              <br />
              Atiende 24/7 sin ti.
            </h2>
            <div className="sv-six">
              <span className="sv-chip">Entra</span>
              <span className="sv-chip">Tu negocio</span>
              <span className="sv-chip">Tu catálogo</span>
              <span className="sv-chip">El QR</span>
              <span className="sv-chip">Pruébalo</span>
              <span className="sv-chip">Míralo</span>
            </div>
            <p className="sv-big" style={{ fontSize: '.85em' }}>
              Deja el celular con internet y el bot hace el resto.
            </p>
          </div>
        </section>
      </div>

      {/* Controles */}
      <div className="sv-ctrls">
        <button type="button" className="sv-ib" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="sv-ib" onClick={() => goTo(0)} aria-label="Volver al inicio">
          ↺
        </button>
        <div className="sv-seg" ref={segRef}>
          {SCENES.map((s, i) => (
            <button key={s.key} type="button" onClick={() => goTo(i)} aria-label={`Ir a ${s.key}`} />
          ))}
        </div>
        <span className="sv-pill">
          {SCENES[idx].key} · {TOTAL_LABEL}
        </span>
      </div>
    </div>
  );
}

// ── Ventana con el video ───────────────────────────────────────────────────────
export function SetupVideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Video: cómo configurar tu bot"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 24, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, #0B132B 0%, #0F1D40 100%)',
          border: '1px solid rgba(0, 207, 255, 0.4)',
          borderRadius: 18,
          width: '100%',
          maxWidth: 900,
          maxHeight: '94vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.75), 0 0 35px rgba(26,107,255,0.25)',
          color: '#FFFFFF',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <strong style={{ fontSize: 14, color: '#00CFFF', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Cómo configurar tu bot · {TOTAL_LABEL}
          </strong>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94A3B8',
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        <SetupVideoPlayer />

        <details style={{ fontSize: 13, color: '#94A3B8' }}>
          <summary style={{ cursor: 'pointer', color: '#00CFFF', fontWeight: 600 }}>
            Ver los 6 pasos por escrito
          </summary>
          <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
            {SETUP_STEPS.map(s => (
              <li key={s.title}>
                <strong style={{ color: '#E8F0FF' }}>{s.title}.</strong> {s.desc}
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 10 }}>
            Dos cosas para que no se caiga: el celular del número conectado debe quedar con internet, y al principio
            conviene usar un número secundario, porque WhatsApp puede bloquear números que contestan automático.
          </p>
        </details>
      </div>
    </div>
  );
}

// ── Disparadores ───────────────────────────────────────────────────────────────
export default function SetupVideoButton({
  label = `🎬 Ver video: configúralo en 6 pasos (${TOTAL_LABEL})`,
  className = 'btn btn-ghost',
  style,
}: {
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <SetupVideoModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** Portada con botón de play, para la landing. */
export function SetupVideoCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <style>{SETUP_VIDEO_CSS}</style>
      <button type="button" className="sv-poster" onClick={() => setOpen(true)}>
        <span className="sv-poster-play">▶</span>
        <span className="sv-poster-copy">
          <strong>Ver el video: configúralo en 6 pasos</strong>
          <span>
            {TOTAL_LABEL} · entra, cuéntale de tu negocio, sube tu catálogo, escanea el QR y pruébalo
          </span>
        </span>
        <span className="sv-poster-steps">
          <i>Entra</i>
          <i>Tu negocio</i>
          <i>Tu catálogo</i>
          <i>El QR</i>
          <i>Pruébalo</i>
          <i>Míralo</i>
        </span>
      </button>
      {open && <SetupVideoModal onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Estilos del video ─────────────────────────────────────────────────────────
// Todo dentro del escenario se mide en cqw, así el "video" escala completo
// (como un video real) sin importar el ancho de la pantalla.
export const SETUP_VIDEO_CSS = `
.sv{display:flex;flex-direction:column;gap:10px;width:100%}
.sv-stage{position:relative;aspect-ratio:16/9;width:min(100%,calc(66vh * 16 / 9));margin:0 auto;
  container-type:inline-size;
  background:#09101F;color:#EAF0FB;border-radius:14px;overflow:hidden;
  border:1px solid rgba(26,107,255,.25);box-shadow:0 18px 50px -24px rgba(0,0,0,.8);
  font-family:'Inter',system-ui,sans-serif}
.sv-stage::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120cqw 60cqw at 15% -10%,rgba(26,107,255,.30),transparent 60%),
             radial-gradient(70cqw 50cqw at 100% 110%,rgba(0,207,255,.16),transparent 65%)}
.sv-scene{position:absolute;inset:0;padding:4.8cqw 5.6cqw 12cqw;font-size:2.55cqw;overflow:hidden;
  display:flex;flex-direction:column;gap:.9em}
.sv-scene[hidden]{display:none}
.sv-stage.sv-paused .sv-scene *{animation-play-state:paused!important}

.sv-hdr{display:flex;align-items:center;gap:.6em;animation:sv-up .5s both}
.sv-badge{font-weight:800;font-size:.72em;letter-spacing:.1em;
  background:linear-gradient(90deg,#1A6BFF,#00CFFF);color:#fff;padding:.3em .8em;border-radius:99px}
.sv-scene h2{font-size:1.75em;font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.15;
  animation:sv-up .5s .08s both}
.sv-cap{position:absolute;left:0;right:0;bottom:0;margin:0;padding:1.1em 5.6cqw 1.3em;font-size:1.02em;
  background:linear-gradient(transparent,rgba(5,9,18,.92) 45%);color:#DCE6F7;text-align:center;
  animation:sv-up .6s .3s both}
.sv-cap b{color:#fff}

.sv-mock{flex:1;min-height:0;min-width:0;display:flex;gap:1.1em;align-items:stretch}
.sv-card{background:#121C33;border:1px solid rgba(255,255,255,.13);border-radius:.7em;padding:1em 1.1em;
  display:flex;flex-direction:column;gap:.7em;min-width:0}
.sv-stack{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.9em}
.sv-cols{display:flex;gap:1em;flex:1;min-height:0}
.sv-fields{flex:1;display:flex;flex-direction:column;gap:.55em;min-width:0}
.sv-side{flex:0 0 7.6em;display:flex;flex-direction:column;gap:.5em;justify-content:center}
.sv-bar{height:1.9em;border-radius:.45em;background:#1A2540;display:flex;align-items:center;
  padding:0 .7em;gap:.5em;font-size:.82em;color:#9AA8C2;border:1px solid rgba(255,255,255,.13)}
.sv-input{color:#EAF0FB}
.sv-dot{width:.5em;height:.5em;border-radius:99px;background:#38445E;flex:0 0 auto}
.sv-lbl{font-size:.72em;color:#9AA8C2;font-weight:700;letter-spacing:.04em}
.sv-typed{display:inline-block;white-space:nowrap;animation:sv-type 1.1s steps(22) both}
.sv-caret{display:inline-block;width:.09em;height:1.05em;background:#00CFFF;vertical-align:-.15em;
  animation:sv-blink .7s steps(1,end) 6,sv-out .2s 4.2s forwards}
.sv-google{display:flex;align-items:center;justify-content:center;gap:.5em;background:#fff;color:#1F2937;
  font-weight:700;border-radius:.5em;padding:.6em 1em;font-size:.85em;position:relative;
  white-space:nowrap}
.sv-ripple{position:absolute;left:50%;top:50%;width:3.4em;height:3.4em;border-radius:99px;
  border:.12em solid #00CFFF;opacity:0;transform:translate(-50%,-50%) scale(.3);
  animation:sv-ripple .9s 2.6s 2}
.sv-cursor{position:absolute;left:62%;top:58%;width:1.5em;height:1.5em;z-index:3;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
.sv-ok{display:flex;align-items:center;gap:.5em;color:#6EE7A4;font-weight:700;font-size:.95em}
.sv-chip{display:inline-flex;align-items:center;gap:.4em;background:rgba(0,207,255,.1);
  border:1px solid rgba(0,207,255,.28);color:#BFEBFF;border-radius:99px;padding:.3em .75em;
  font-size:.74em;font-weight:600;white-space:nowrap}
.sv-chip-on{background:rgba(26,107,255,.3);border-color:#1A6BFF;color:#fff}
.sv-chips{display:flex;flex-wrap:wrap;gap:.45em}
.sv-drop{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.7em;
  border:.12em dashed rgba(255,255,255,.22);border-radius:.6em}

.sv-prog{display:flex;gap:.35em}
.sv-prog i{flex:1;height:.32em;border-radius:99px;background:#27344F;position:relative;overflow:hidden}
.sv-prog i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#1A6BFF,#00CFFF);
  transform-origin:left;transform:scaleX(0)}
.sv-prog4 i:nth-child(1)::after{animation:sv-grow .4s .2s forwards}
.sv-prog4 i:nth-child(2)::after{animation:sv-grow .4s 2.6s forwards}
.sv-prog4 i:nth-child(3)::after{animation:sv-grow .4s 5.2s forwards}
.sv-prog4 i:nth-child(4)::after{animation:sv-grow .4s 7.8s forwards}
.sv-prog1 i::after{animation:sv-grow 4.2s .8s forwards}

.sv-phone{width:13.5em;flex:0 0 auto;background:#0B1424;border:.32em solid #26334C;border-radius:1.6em;
  padding:.55em;display:flex;flex-direction:column;gap:.45em;position:relative;overflow:hidden}
.sv-notch{height:.9em;display:flex;justify-content:center;align-items:center}
.sv-notch i{width:3em;height:.3em;border-radius:99px;background:#26334C}
.sv-wahdr{background:#075E54;border-radius:.4em .4em 0 0;padding:.45em .6em;font-size:.68em;
  font-weight:700;color:#fff}
.sv-row{display:flex;align-items:center;gap:.5em;font-size:.68em;padding:.42em .5em;border-radius:.4em;
  background:#131F33;color:#CBD6E8}
.sv-row .sv-ar{margin-left:auto;color:#9AA8C2}
.sv-row.sv-hl{background:rgba(37,211,102,.14);color:#AFF3C9;border:1px solid rgba(37,211,102,.35)}

.sv-qrcard{flex:1;align-items:center;justify-content:center}
.sv-qrbox{position:relative;background:#fff;border-radius:.6em;padding:.7em}
.sv-qr{display:grid;grid-template-columns:repeat(21,1fr);width:7.4em;height:7.4em}
.sv-qr span{animation:sv-in .02s both}
.sv-scan{position:absolute;left:.4em;right:.4em;height:.55em;border-radius:99px;
  background:linear-gradient(90deg,transparent,#25D366,transparent);box-shadow:0 0 1.4em #25D366;
  opacity:0;animation:sv-scan 2.6s 2.6s 2 ease-in-out}

.sv-chat{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:.45em;
  justify-content:flex-end;background:linear-gradient(180deg,#0D1728,#0A1322);
  border:1px solid rgba(255,255,255,.13);border-radius:.7em;padding:.9em 1em}
.sv-msg{max-width:72%;padding:.5em .75em;border-radius:.8em;font-size:.78em;line-height:1.4;opacity:0;
  flex:0 0 auto}
.sv-msg.sv-in{align-self:flex-start;background:#1A2540;border-bottom-left-radius:.2em}
.sv-msg.sv-out{align-self:flex-end;background:#145C3A;color:#E7FFF1;border-bottom-right-radius:.2em}
.sv-m1{animation:sv-bub .4s .5s both}
.sv-m2{animation:sv-bub .4s 2.4s both}
.sv-m3{animation:sv-bub .4s 4.6s both}
.sv-m4{animation:sv-bub .4s 7.2s both}
.sv-typing{align-self:flex-end;flex:0 0 auto;display:flex;gap:.25em;background:#145C3A;padding:.6em .8em;
  border-radius:.8em;max-height:3em;opacity:0;overflow:hidden;
  animation:sv-bub .3s 1.3s both,sv-fold .3s 2.4s forwards}
.sv-typing i{width:.35em;height:.35em;border-radius:99px;background:#9AF3C4;animation:sv-bounce .9s infinite}
.sv-typing i:nth-child(2){animation-delay:.15s}
.sv-typing i:nth-child(3){animation-delay:.3s}

.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.8em;flex:1;min-height:0}
.sv-kpi{background:#121C33;border:1px solid rgba(255,255,255,.13);border-radius:.7em;padding:.9em;
  display:flex;flex-direction:column;justify-content:center;gap:.15em;animation:sv-pop .45s both}
.sv-kpi:nth-child(2){animation-delay:.15s}
.sv-kpi:nth-child(3){animation-delay:.3s}
.sv-kpi b{font-size:2.1em;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;
  background:linear-gradient(90deg,#fff,#00CFFF);-webkit-background-clip:text;background-clip:text;
  color:transparent}
.sv-kpi span{font-size:.78em;color:#9AA8C2;font-weight:600}

.sv-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:.7em;text-align:center}
.sv-center h2{font-size:2.5em;line-height:1.05}
.sv-big{font-weight:700;font-size:1em;color:#9AA8C2;margin:0}
.sv-six{display:flex;gap:.45em;flex-wrap:wrap;justify-content:center}
.sv-six span{animation:sv-pop .4s both}
.sv-six span:nth-child(1){animation-delay:.5s}
.sv-six span:nth-child(2){animation-delay:.65s}
.sv-six span:nth-child(3){animation-delay:.8s}
.sv-six span:nth-child(4){animation-delay:.95s}
.sv-six span:nth-child(5){animation-delay:1.1s}
.sv-six span:nth-child(6){animation-delay:1.25s}
.sv-logo{display:flex;align-items:center;gap:.5em;font-weight:800;font-size:1.05em}
.sv-logo i{width:1.5em;height:1.5em;border-radius:.45em;background:linear-gradient(135deg,#1A6BFF,#00CFFF);
  display:grid;place-items:center;font-style:normal;font-size:.8em}

.sv-d03{animation:sv-up .5s .3s both}
.sv-d05{animation:sv-up .5s .5s both}
.sv-d06{animation:sv-pop .4s .6s both}
.sv-d04{animation-delay:.4s}
.sv-d21{animation-delay:2.1s}
.sv-d22{animation:sv-pop .3s 2.2s both}
.sv-d40{animation:sv-pop .3s 4s both}
.sv-d46{animation:sv-pop .4s 4.6s both}
.sv-d54{animation:sv-pop .4s 5.4s both}
.sv-d55{animation:sv-pop .45s 5.5s both}
.sv-d56{animation:sv-pop .3s 5.6s both}
.sv-d70{animation:sv-pop .4s 7s both}
.sv-d86{animation:sv-pop .4s 8.6s both}
.sv-d95{animation:sv-pop .4s 9.5s both}
.sv-d10{animation:sv-up .4s 1s both}

@keyframes sv-up{from{opacity:0;transform:translateY(.6em)}to{opacity:1;transform:none}}
@keyframes sv-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes sv-bub{from{opacity:0;transform:translateY(.5em) scale(.96)}to{opacity:1;transform:none}}
@keyframes sv-type{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes sv-blink{50%{opacity:0}}
@keyframes sv-out{to{opacity:0}}
@keyframes sv-fold{to{opacity:0;max-height:0;padding-top:0;padding-bottom:0;margin-bottom:-.45em}}
@keyframes sv-grow{to{transform:scaleX(1)}}
@keyframes sv-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-.3em)}}
@keyframes sv-in{from{opacity:0}to{opacity:1}}
@keyframes sv-scan{0%{opacity:0;top:.4em}12%{opacity:1}88%{opacity:1}100%{opacity:0;top:6.6em}}
@keyframes sv-ripple{0%{opacity:.9;transform:translate(-50%,-50%) scale(.3)}
  100%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}}
@media (prefers-reduced-motion: reduce){
  .sv-scene *,.sv-scene *::after{animation-duration:.001s!important;animation-delay:0s!important;
    animation-iteration-count:1!important}
}

.sv-ctrls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sv-seg{display:flex;gap:4px;flex:1;min-width:120px}
.sv-seg button{flex:1;height:7px;padding:0;border:0;border-radius:99px;background:rgba(255,255,255,.12);
  position:relative;overflow:hidden;cursor:pointer}
.sv-seg button::after{content:"";position:absolute;inset:0;border-radius:99px;transform-origin:left;
  transform:scaleX(var(--f,0));background:linear-gradient(90deg,#1A6BFF,#00CFFF)}
.sv-pill{font-weight:700;font-size:12px;color:#9AA8C2;white-space:nowrap}
.sv-ib{display:grid;place-items:center;width:34px;height:34px;border-radius:99px;cursor:pointer;
  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#EAF0FB;font-size:12px}
.sv-ib:hover{border-color:#00CFFF;color:#fff}

.sv-poster{display:flex;align-items:center;gap:16px;width:100%;text-align:left;cursor:pointer;
  background:linear-gradient(135deg,rgba(26,107,255,.14),rgba(0,207,255,.07));
  border:1px solid rgba(0,207,255,.3);border-radius:16px;padding:18px 20px;color:#E8F0FF;
  font-family:inherit;flex-wrap:wrap}
.sv-poster:hover{border-color:#00CFFF;background:linear-gradient(135deg,rgba(26,107,255,.2),rgba(0,207,255,.1))}
.sv-poster-play{flex:0 0 auto;width:54px;height:54px;border-radius:99px;display:grid;place-items:center;
  background:linear-gradient(135deg,#1A6BFF,#00CFFF);color:#fff;font-size:18px;
  box-shadow:0 8px 24px -8px rgba(0,207,255,.8)}
.sv-poster-copy{display:flex;flex-direction:column;gap:3px;min-width:200px;flex:1}
.sv-poster-copy strong{font-size:17px;font-weight:700}
.sv-poster-copy span{font-size:13px;color:#9AA8C2}
.sv-poster-steps{display:flex;gap:6px;flex-wrap:wrap}
.sv-poster-steps i{font-style:normal;font-size:11px;font-weight:600;color:#BFEBFF;
  background:rgba(0,207,255,.1);border:1px solid rgba(0,207,255,.25);border-radius:99px;padding:3px 9px}
@media (max-width:640px){
  .sv-poster{padding:16px}
  .sv-poster-steps{display:none}
}
`;
