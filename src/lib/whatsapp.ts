/**
 * Build a WhatsApp URL to send a reservation confirmation message.
 * Uses only emojis from the Unicode standard supported by WhatsApp.
 */
export function buildWhatsAppReservationUrl(params: {
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
}): string | null {
  const cleaned = params.phone.replace(/[\s\-()]/g, '');
  // Normalize Venezuelan numbers
  let num = cleaned;
  if (num.startsWith('0')) num = '58' + num.slice(1);
  if (!num.startsWith('+')) num = num.startsWith('58') ? num : '58' + num;
  num = num.replace('+', '');

  if (num.length < 10) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  const vehicle = [params.vehicleBrand, params.vehicleModel, params.vehicleYear].filter(Boolean).join(' ');

  let msg = `Hola ${params.clientName},\n\n`;
  msg += `Tu cita de servicio ha sido *confirmada* \u2705\n\n`;
  msg += `\uD83D\uDCC5 *Fecha:* ${formatDate(params.date)}\n`;
  msg += `\u23F0 *Hora:* ${formatTime(params.time)}\n`;
  msg += `\uD83D\uDD27 *Servicio:* ${params.serviceType}\n`;

  if (vehicle) msg += `\uD83D\uDE97 *Vehiculo:* ${vehicle}\n`;
  if (params.vehiclePlate) msg += `\uD83C\uDD94 *Placa:* ${params.vehiclePlate}\n`;
  if (params.dealershipName) msg += `\uD83D\uDCCD *Concesionario:* ${params.dealershipName}\n`;
  if (params.mileage && params.mileage > 0) msg += `\uD83D\uDCCF *Kilometraje:* ${params.mileage.toLocaleString()} km\n`;
  if (params.notes) msg += `\uD83D\uDCDD *Notas:* ${params.notes}\n`;

  msg += `\nTe esperamos. Gracias por confiar en nosotros \uD83D\uDE4F`;

  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
