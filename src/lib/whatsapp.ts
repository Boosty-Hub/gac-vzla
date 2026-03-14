import { supabase } from '@/integrations/supabase/client';

/**
 * Normalize a phone number for WhatsApp (Venezuelan format).
 */
function normalizePhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  let num = cleaned;
  if (num.startsWith('0')) num = '58' + num.slice(1);
  if (!num.startsWith('+')) num = num.startsWith('58') ? num : '58' + num;
  num = num.replace('+', '');
  if (num.length < 10) return null;
  return num;
}

/**
 * Format a date string to a human-readable Spanish format.
 */
function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Format a time string (HH:mm) to 12-hour format.
 */
function formatTime(t: string): string {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

/**
 * Default template used when no DB template is available.
 */
const DEFAULT_TEMPLATE = `Hola {{cliente}},

Tu cita de servicio ha sido *confirmada* ✅

📅 *Fecha:* {{fecha}}
⏰ *Hora:* {{hora}}
🔧 *Servicio:* {{servicio}}
{{#vehiculo}}🚗 *Vehiculo:* {{vehiculo}}
{{/vehiculo}}{{#placa}}🔖 *Placa:* {{placa}}
{{/placa}}{{#concesionario}}📍 *Concesionario:* {{concesionario}}
{{/concesionario}}{{#kilometraje}}📏 *Kilometraje:* {{kilometraje}} km
{{/kilometraje}}{{#notas}}📝 *Notas:* {{notas}}
{{/notas}}
Te esperamos. Gracias por confiar en nosotros 🙏`;

/**
 * Process a template string by replacing variables and handling conditional blocks.
 */
function processTemplate(template: string, vars: Record<string, string | undefined>): string {
  let result = template;

  // Handle conditional blocks: {{#key}}...{{/key}} - only show if key has a value
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return vars[key] ? content : '';
  });

  // Replace simple variables: {{key}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');

  // Clean up extra blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * Fetch the template from the database, falling back to the default.
 */
async function fetchTemplate(templateKey: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('message_templates')
      .select('content')
      .eq('template_key', templateKey)
      .eq('is_active', true)
      .single();
    return data?.content || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export interface WhatsAppReservationParams {
  phone: string;
  clientName: string;
  date: string;
  time: string;
  serviceType: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehiclePlate?: string;
  dealershipName?: string;
  mileage?: number;
  notes?: string;
}

/**
 * Build a WhatsApp URL using the DB template (async version).
 */
export async function buildWhatsAppReservationUrlAsync(params: WhatsAppReservationParams): Promise<string | null> {
  const num = normalizePhone(params.phone);
  if (!num) return null;

  const template = await fetchTemplate('reservation_confirmed');
  const vehicle = [params.vehicleBrand, params.vehicleModel, params.vehicleYear].filter(Boolean).join(' ');

  const vars: Record<string, string | undefined> = {
    cliente: params.clientName,
    fecha: formatDate(params.date),
    hora: formatTime(params.time),
    servicio: params.serviceType,
    vehiculo: vehicle || undefined,
    placa: params.vehiclePlate || undefined,
    concesionario: params.dealershipName || undefined,
    kilometraje: params.mileage && params.mileage > 0 ? params.mileage.toLocaleString() : undefined,
    notas: params.notes || undefined,
  };

  const msg = processTemplate(template, vars);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/**
 * Build a WhatsApp URL (sync version, uses default template).
 */
export function buildWhatsAppReservationUrl(params: WhatsAppReservationParams): string | null {
  const num = normalizePhone(params.phone);
  if (!num) return null;

  const vehicle = [params.vehicleBrand, params.vehicleModel, params.vehicleYear].filter(Boolean).join(' ');

  const vars: Record<string, string | undefined> = {
    cliente: params.clientName,
    fecha: formatDate(params.date),
    hora: formatTime(params.time),
    servicio: params.serviceType,
    vehiculo: vehicle || undefined,
    placa: params.vehiclePlate || undefined,
    concesionario: params.dealershipName || undefined,
    kilometraje: params.mileage && params.mileage > 0 ? params.mileage.toLocaleString() : undefined,
    notas: params.notes || undefined,
  };

  const msg = processTemplate(DEFAULT_TEMPLATE, vars);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
