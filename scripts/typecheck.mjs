/**
 * Chequeo de tipos del frontend.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `tsconfig.json` es un config de "project references": tiene `"files": []` y delega en
 * `tsconfig.app.json`. Eso significa que `npx tsc --noEmit` a secas NO REVISA NINGÚN ARCHIVO.
 * Termina en cero, sin salida, y parece que todo está bien.
 *
 * No estaba bien. Con el config real aparecieron dos identificadores que no existen:
 *
 *   src/pages/dealership/DealershipReservas.tsx  ->  `statusMap`
 *   src/components/satisfaction/SatisfactionOverview.tsx  ->  `DEFAULT_RESPONDED_FILTERS`
 *
 * Los dos son restos de renombres que quedaron a medio camino. `vite build` no los ve
 * (esbuild no chequea tipos ni nombres libres) y salieron a producción: el concesionario
 * abría la lista de citas y la pantalla se caía entera con "statusMap is not defined".
 *
 * QUÉ CORTA Y QUÉ NO
 * ------------------
 * Falla SOLO con la familia "no existe este nombre" (TS2304/TS2551/TS2552). Esos son
 * ReferenceError garantizados apenas se ejecute la línea: no hay forma de que anden.
 *
 * El resto se lista como deuda conocida y no frena nada. Hoy son ~25 y casi todos salen de
 * `src/integrations/supabase/types.ts` desactualizado: columnas que SÍ están en la base
 * (`kommo_lead_id`, `internal_notes`, `sold_plate`, `google_maps_url`...) pero que faltan en
 * los tipos generados. Se arreglan regenerando ese archivo, no tocando las pantallas.
 *
 * Cuando esa deuda llegue a cero, cambiar FATALES por "cualquier error" y esto pasa a ser un
 * gate completo.
 */
import { execSync } from 'node:child_process';

/** Familia "cannot find name": el único error de tipos que rompe la pantalla en runtime. */
const FATALES = /error (TS2304|TS2551|TS2552):/;

let salida = '';
try {
  execSync('npx tsc --noEmit -p tsconfig.app.json', { encoding: 'utf8' });
} catch (e) {
  // tsc termina distinto de cero cuando encuentra errores; el detalle viene por stdout.
  salida = `${e.stdout || ''}${e.stderr || ''}`;
}

const errores = salida.split(/\r?\n/).filter(l => /error TS\d+:/.test(l));
const fatales = errores.filter(l => FATALES.test(l));
const deuda = errores.filter(l => !FATALES.test(l));

if (deuda.length > 0) {
  console.log(`\nDeuda de tipos conocida: ${deuda.length} (no frena el build)`);
  for (const linea of deuda) console.log(`  · ${linea.slice(0, 140)}`);
}

if (fatales.length > 0) {
  console.error(`\n${fatales.length} nombre(s) que no existen — esto revienta en runtime:\n`);
  for (const linea of fatales) console.error(`  ✗ ${linea}`);
  console.error('');
  process.exit(1);
}

console.log('\nSin nombres indefinidos.');
