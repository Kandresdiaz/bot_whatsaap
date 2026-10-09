// Estilos de las páginas públicas (landing, páginas de nicho y guías).
export const LANDING_CSS = `
.lp { min-height: 100vh; background: radial-gradient(ellipse at 50% 0%, rgba(26,107,255,0.16) 0%, #080E1F 60%); color: #f8fafc; padding-bottom: 40px; }
.lp-wrap { max-width: 1180px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
.lp a { text-decoration: none; }
.lp-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 18px; padding-bottom: 18px; }
.lp-logo { display: flex; align-items: center; gap: 10px; color: #fff; font-size: 22px; font-weight: 800; }
.lp-logo-icon { font-size: 22px; background: linear-gradient(135deg, #1A6BFF, #00CFFF); border-radius: 12px; padding: 6px 9px; line-height: 1; }
.lp-nav-links { display: flex; gap: 26px; }
.lp-nav-links a { color: #94a3b8; font-size: 14px; font-weight: 600; }
.lp-nav-links a:hover { color: #fff; }
.lp-nav-actions { display: flex; gap: 8px; }
.lp-btn-sm { padding: 8px 14px; font-size: 13px; }
.lp-btn-lg { padding: 14px 22px; font-size: 15px; font-weight: 800; border-radius: 12px; }
.lp-btn-wa { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.45); }
.lp-btn-wa:hover { background: rgba(34,197,94,0.2); }
.lp-btn-outline { background: rgba(26,107,255,0.15); color: #fff; border: 1px solid rgba(26,107,255,0.6); }
.lp-btn-outline:hover { background: rgba(26,107,255,0.3); }

.lp-hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 48px; align-items: center; padding-top: 48px; padding-bottom: 40px; }
.lp-pill { display: inline-flex; background: rgba(0,207,255,0.1); border: 1px solid rgba(0,207,255,0.35); color: #00CFFF; border-radius: 30px; padding: 6px 16px; font-size: 13px; font-weight: 700; margin-bottom: 18px; }
.lp-h1 { font-size: clamp(32px, 5vw, 52px); font-weight: 900; line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 18px; }
.lp-grad { background: linear-gradient(135deg, #1A6BFF, #00CFFF); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-lead { font-size: 17px; color: #cbd5e1; line-height: 1.6; max-width: 600px; margin-bottom: 26px; }
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; }
.lp-fineprint { margin-top: 14px; font-size: 13px; color: #94a3b8; }

.lp-phone { background: #0B132B; border: 1px solid rgba(0,207,255,0.3); border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(26,107,255,0.2); max-width: 400px; width: 100%; justify-self: center; }
.lp-phone-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #0D1A36; border-bottom: 1px solid rgba(255,255,255,0.06); }
.lp-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(26,107,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.lp-chat { display: flex; flex-direction: column; gap: 10px; padding: 18px 14px; }
.lp-msg { max-width: 86%; padding: 9px 12px 18px; border-radius: 12px; font-size: 13px; line-height: 1.45; position: relative; }
.lp-msg span { position: absolute; right: 10px; bottom: 4px; font-size: 10px; color: #94a3b8; }
.lp-msg-in { align-self: flex-start; background: #16213F; border-top-left-radius: 4px; }
.lp-msg-out { align-self: flex-end; background: linear-gradient(135deg, rgba(26,107,255,0.45), rgba(0,207,255,0.3)); border-top-right-radius: 4px; }

.lp-section { padding-top: 64px; padding-bottom: 16px; }
.lp-h2 { font-size: clamp(24px, 3.4vw, 34px); font-weight: 900; text-align: center; color: #fff; }
.lp-sub { text-align: center; color: #94a3b8; font-size: 15px; margin-top: 8px; margin-bottom: 30px; }
.lp-h3 { font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 8px; }
.lp-text { color: #cbd5e1; font-size: 14px; line-height: 1.6; }
.lp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
.lp-step { position: relative; }
.lp-step-num { position: absolute; top: 18px; right: 20px; font-size: 13px; font-weight: 800; color: #00CFFF; border: 1px solid rgba(0,207,255,0.4); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
.lp-grid-audience { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.lp-audience { display: flex; gap: 14px; align-items: flex-start; padding: 18px; }

.lp-plan { display: flex; flex-direction: column; position: relative; }
.lp-plan-popular { border: 2px solid #00CFFF; background: linear-gradient(180deg, rgba(26,107,255,0.14) 0%, #0D1428 100%); }
.lp-plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #1A6BFF, #00CFFF); color: #080E1F; font-weight: 800; font-size: 11px; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; white-space: nowrap; }
.lp-list { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.lp-list li { display: flex; gap: 8px; font-size: 13px; color: #e2e8f0; }
.lp-list li span { color: #00CFFF; font-weight: 800; }

.lp-faq { padding: 18px 20px; }
.lp-faq summary { cursor: pointer; font-weight: 700; font-size: 15px; color: #fff; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary::after { content: '+'; color: #00CFFF; font-size: 20px; line-height: 1; }
.lp-faq[open] summary::after { content: '−'; }

.lp-final { margin-top: 72px; text-align: center; padding: 44px 24px; border-radius: 20px; border: 1px solid rgba(0,207,255,0.3); background: linear-gradient(135deg, rgba(26,107,255,0.14) 0%, rgba(0,207,255,0.06) 100%); }
.lp-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #64748b; line-height: 1.6; }
.lp-footer a { color: #94a3b8; font-size: 13px; }

.lp-wa-float { position: fixed; right: 18px; bottom: 18px; z-index: 50; background: #22c55e; color: #fff; font-weight: 800; font-size: 14px; padding: 12px 18px; border-radius: 30px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }

.lp-steps-list { list-style: none; display: flex; flex-direction: column; gap: 12px; margin-top: 28px; }
.lp-steps-list li { display: flex; gap: 14px; align-items: center; font-size: 15px; color: #e2e8f0; padding: 16px 18px; }
.lp-steps-list li span { flex: none; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #00CFFF; border: 1px solid rgba(0,207,255,0.4); }
.lp-guide-card { display: block; color: inherit; transition: border-color 0.2s; }
.lp-guide-card:hover { border-color: rgba(0,207,255,0.5); }

.lp-article { max-width: 760px; padding-top: 24px; }
.lp-article .lp-h1 { font-size: clamp(28px, 4.2vw, 42px); }
.lp-article h2 { font-size: 22px; font-weight: 800; color: #fff; margin: 34px 0 12px; }
.lp-article p { color: #cbd5e1; font-size: 16px; line-height: 1.75; margin-bottom: 14px; }
.lp-article ul { margin: 0 0 14px 22px; display: flex; flex-direction: column; gap: 8px; color: #cbd5e1; font-size: 16px; line-height: 1.6; }
.lp-breadcrumb { font-size: 13px; color: #94a3b8; margin-bottom: 14px; }
.lp-breadcrumb a { color: #00CFFF; }

@media (max-width: 900px) {
  .lp-hero { grid-template-columns: 1fr; gap: 36px; padding-top: 24px; }
  .lp-grid-3, .lp-grid-audience { grid-template-columns: 1fr; }
  .lp-grid-audience { grid-template-columns: repeat(2, 1fr); }
  .lp-nav-links { display: none; }
  .lp-plan-popular { margin-top: 8px; }
}
@media (max-width: 560px) {
  .lp-grid-audience { grid-template-columns: 1fr; }
  .lp-hide-mobile { display: none; }
  .lp-cta-row .btn { width: 100%; }
  .lp-wa-float { padding: 12px 14px; font-size: 20px; }
}
`;
