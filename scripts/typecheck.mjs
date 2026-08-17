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
 * QUÉ CORTA
 * ---------
 * Cualquier error de tipos. La deuda arrancó en 25 y quedó en CERO: 12 salían de
 * `src/integrations/supabase/types.ts` desactualizado (columnas que SÍ están en la base pero
 * faltaban en los tipos generados) y se fueron al regenerarlo contra producción; los otros 13
 * se arreglaron uno por uno.
 *
 * MANTENERLO EN CERO. Si aparece un error nuevo, se arregla — no se agrega a una lista de
 * tolerados. La lista de tolerados es exactamente cómo `statusMap` llegó a producción.
 *
 * Si algún día `types.ts` vuelve a quedar viejo, se regenera así:
 *   curl -s "https://api.supabase.com/v1/projects/<ref>/types/typescript" \
 *     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e "..."
 * Es un archivo SOLO de tipos: se borra entero al compilar, así que regenerarlo no puede
 * cambiar el comportamiento. Verificado — el bundle salió idéntico byte por byte.
 */
import { execSync } from 'node:child_process';

/** Familia "cannot find name": ReferenceError seguro en runtime. Se destaca aparte. */
const REVIENTA_EN_RUNTIME = /error (TS2304|TS2551|TS2552):/;

let salida = '';
try {
  execSync('npx tsc --noEmit -p tsconfig.app.json', { encoding: 'utf8' });
} catch (e) {
  // tsc termina distinto de cero cuando encuentra errores; el detalle viene por stdout.
  salida = `${e.stdout || ''}${e.stderr || ''}`;
}

const errores = salida.split(/\r?\n/).filter(l => /error TS\d+:/.test(l));

if (errores.length === 0) {
  console.log('\nTipos OK — 0 errores.');
  process.exit(0);
}

const revientan = errores.filter(l => REVIENTA_EN_RUNTIME.test(l));
const resto = errores.filter(l => !REVIENTA_EN_RUNTIME.test(l));

if (revientan.length > 0) {
  console.error(`\n${revientan.length} nombre(s) que no existen — esto revienta en runtime:\n`);
  for (const linea of revientan) console.error(`  ✗ ${linea}`);
}
if (resto.length > 0) {
  console.error(`\n${resto.length} error(es) de tipos:\n`);
  for (const linea of resto) console.error(`  · ${linea.slice(0, 160)}`);
}

console.error('');
process.exit(1);
