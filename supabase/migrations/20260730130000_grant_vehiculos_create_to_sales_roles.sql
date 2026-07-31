-- Permitir que vendedores y concesionarios agreguen vehículos a sus clientes.
--
-- Contexto: la ficha del cliente gana un botón "Agregar vehículo" (recompra, R6 del cambio
-- satisfaction-survey). El pedido del usuario fue explícito: "que así un vendedor pueda
-- agregarle su vehículo al cliente".
--
-- Estado verificado antes de esta migración (2026-07-30):
--
--   vehiculos.view    -> admin, Asesor de Servicio, superadmin
--   vehiculos.create  -> admin, superadmin
--   vehiculos.edit    -> admin, superadmin
--   vehiculos.delete  -> admin, superadmin
--
-- O sea: el permiso `vehiculos.create` YA EXISTÍA en `public.permissions` desde 2026-02-12.
-- Lo que faltaba no era el permiso sino su asignación — ningún rol de ventas lo tenía.
-- (Un grep del frontend solo mostraba `vehiculos.edit`/`vehiculos.delete` porque son los
-- únicos que el código referencia hoy; eso dice qué se usa, no qué existe.)
--
-- Esta migración asigna a `vendedor` y `concesionario`:
--   * vehiculos.view   — sin poder ver los vehículos del cliente, agregar uno a ciegas no
--                        tiene sentido: no se puede comprobar si ya está cargado.
--   * vehiculos.create — el pedido en sí.
--
-- NO se otorga `vehiculos.edit` ni `vehiculos.delete`: agregar el auto que uno acaba de
-- vender es parte del trabajo de ventas; modificar o borrar el parque vehicular de un
-- cliente no lo es, y `vehicles` alimenta el módulo de garantías.
--
-- Se incluye `concesionario` además de `vendedor` porque es el rol que supervisa a los
-- vendedores de su sede; dejar al supervisor sin un permiso que sí tiene su equipo sería
-- incoherente. Si no es lo que se quiere, revertir solo esa parte con el bloque de abajo.
--
-- IDEMPOTENTE: `ON CONFLICT DO NOTHING` sobre la PK compuesta, así que re-ejecutarla no
-- duplica filas ni falla.

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE r.name IN ('vendedor', 'concesionario')
   AND p.name IN ('vehiculos.view', 'vehiculos.create')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- REVERSIÓN (ejecutable — descomentar para revocar)
--
-- DELETE FROM public.role_permissions rp
--  USING public.roles r, public.permissions p
--  WHERE rp.role_id = r.id
--    AND rp.permission_id = p.id
--    AND r.name IN ('vendedor', 'concesionario')
--    AND p.name IN ('vehiculos.view', 'vehiculos.create');
--
-- Para revocar SOLO a concesionario y dejar a vendedor, usar el mismo DELETE con
--    AND r.name = 'concesionario'
-- ============================================================================
