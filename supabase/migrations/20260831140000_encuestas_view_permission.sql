-- =============================================================================
-- Permiso "Ver encuestas" en el dashboard de concesionario/asesor (2026-08-31)
-- =============================================================================
--
-- Pedido: "La vista de asesor de servicio y concesionario, deberian poder
-- visualizar en su dashboard las encuestas de satisfaccion afiliadas a su
-- centro de servicio. Aparece habilitado en el apartado de permisos, pero no
-- permite visualizarlo."
--
-- Diagnostico: el unico permiso module='encuestas' que existia era
-- `encuestas.send` (20260824120000_manual_survey_sending.sql), y ese SOLO
-- gatea el boton de reenvio manual de una encuesta -- nunca controlo ninguna
-- visualizacion. El Dashboard del portal concesionario no tenia ninguna
-- seccion de encuestas para gatear, asi que prender el permiso en
-- Configuracion -> Roles no cambiaba nada en pantalla.
--
-- Este permiso nuevo, `encuestas.view`, gatea el widget nuevo que se agrega
-- en esa pantalla (DashboardSurveysWidget). No toca el tab "Satisfaccion" de
-- AdminClientes.tsx (sigue gateado solo por poder entrar a Clientes), ni las
-- politicas RLS de las tablas de encuestas: esas ya filtran por concesionario
-- para 'concesionario' y 'Asesor de Servicio' desde
-- 20260803130000_service_satisfaction_survey.sql.
--
-- Backfill: mismo criterio de roles que uso `encuestas.send` -- si un rol ya
-- puede enviar encuestas manualmente, tiene sentido que tambien pueda verlas
-- resumidas en su dashboard. Ademas, superadmin/admin lo tienen siempre,
-- igual que el permiso original.
-- =============================================================================

INSERT INTO public.permissions (name, module, description)
VALUES ('encuestas.view', 'encuestas', 'Ver resumen de encuestas de satisfaccion en el dashboard')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, (SELECT id FROM public.permissions WHERE name = 'encuestas.view')
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
 WHERE p.name = 'encuestas.send'
ON CONFLICT DO NOTHING;

-- Los dos roles de mando lo tienen siempre, igual que `encuestas.send`.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, (SELECT id FROM public.permissions WHERE name = 'encuestas.view')
  FROM public.roles r
 WHERE r.name IN ('superadmin', 'admin')
ON CONFLICT DO NOTHING;
