import { BACKEND_URL } from '@/lib/config';

// Negocios predeterminados que sirve el backend (backend/src/services/nicheTemplates.js)
export type NicheTemplate = {
  id: string;
  label: string;
  fields: Record<string, unknown>;
  faqs: { title: string; content: string }[];
};

// Marca de los datos que solo el negocio conoce: "[COMPLETAR: ...]"
export const PLACEHOLDER_RE = /\[COMPLETAR[^\]]*\]/i;

export const hasPlaceholder = (value: unknown) => typeof value === 'string' && PLACEHOLDER_RE.test(value);

export const withBusinessName = (value: string, name?: string) =>
  value.replace(/\{negocio\}/g, name?.trim() || 'nuestro negocio');

export const fetchNicheTemplates = async (): Promise<NicheTemplate[]> => {
  try {
    const r = await fetch(`${BACKEND_URL}/api/business/templates/niches`, { cache: 'no-store' });
    const d = await r.json();
    return d.success ? d.templates || [] : [];
  } catch {
    return [];
  }
};

/** Plantilla que corresponde a la categoría guardada del negocio, si alguna coincide. */
export const templateForCategory = (templates: NicheTemplate[], category?: string) =>
  templates.find(t => t.fields.category && t.fields.category === category) || null;
