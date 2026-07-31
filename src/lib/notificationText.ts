/**
 * Presentation helpers for notification rows.
 *
 * Context: dealership managers reported notifications "duplicating". They are not
 * duplicated — a live check of every rapid pair in production found 78 of 78 with
 * *different* messages. What actually happens is that one prospect or reservation
 * changes status twice within seconds, so two legitimate rows land back to back with
 * the same title and the same icon. The message that tells them apart is rendered
 * small and grey, so the pair reads as one event repeated.
 *
 * Surfacing the transition (old -> new) makes the two rows visibly distinct.
 */

/** Raw status pair carried in `notifications.metadata` by the status-change triggers. */
export interface StatusTransition {
  from: string;
  to: string;
}

/**
 * Turns a stored status slug into something readable: `cotizacion_enviada` ->
 * `Cotizacion enviada`. Accents are deliberately not restored — the database stores
 * unaccented slugs and inventing them here would drift from what the rest of the UI
 * shows for the same value.
 */
export function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Reads the `old_status` / `new_status` pair written by `notify_on_prospect_status_change`
 * and `notify_on_reservation_status_change`.
 *
 * Returns `null` when the notification is not a status change, when either end is
 * missing, or when both ends are equal — an unchanged pair carries no information and
 * rendering `X -> X` would be noise.
 */
export function getStatusTransition(
  metadata: Record<string, unknown> | null | undefined,
): StatusTransition | null {
  if (!metadata) return null;

  const rawFrom = metadata.old_status;
  const rawTo = metadata.new_status;
  if (typeof rawFrom !== 'string' || typeof rawTo !== 'string') return null;

  const from = humanizeStatus(rawFrom);
  const to = humanizeStatus(rawTo);
  if (!from || !to || from === to) return null;

  return { from, to };
}
