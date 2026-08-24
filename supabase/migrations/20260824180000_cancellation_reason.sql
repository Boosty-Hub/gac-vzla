-- =============================================================================
-- Motivo de cancelacion de una cita (2026-08-24)
-- =============================================================================
--
-- Reportado desde /admin/historial: al cancelar una cita no queda registrado POR QUE.
-- El historial guardaba el egreso ("Trabajo realizado") y el ingreso ("Motivo del
-- ingreso"), pero de las canceladas no guardaba nada -- y son justo las que alguien va
-- a preguntar despues.
--
-- Columna suelta y no una tabla de motivos: el reporte pide "un cuadro descriptivo",
-- texto libre. Un catalogo cerrado obligaria a elegir "Otros" en la mitad de los casos y
-- perderia exactamente el detalle que se quiere conservar.
--
-- Nullable a proposito: las 11 canceladas que ya existen no tienen motivo y no se puede
-- inventar uno. Se muestran como "sin motivo registrado", que es la verdad.
-- =============================================================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.reservations.cancellation_reason IS
  'Motivo por el que se cancelo la cita. Texto libre, obligatorio en la UI al pasar a '
  '"cancelada", nulo en las canceladas anteriores al 2026-08-24.';
