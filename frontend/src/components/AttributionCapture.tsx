'use client';
import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution';

// Va en el layout raíz para capturar el origen sin importar por qué página entre la persona.
export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
