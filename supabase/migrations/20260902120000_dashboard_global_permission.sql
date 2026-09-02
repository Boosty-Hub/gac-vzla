-- Nuevo modulo de permiso 'dashboard_global': deja ver el dashboard GLOBAL (el mismo que usa
-- Admin, todos los concesionarios juntos, sin filtrar por concesionario/vendedor) desde el
-- portal de concesionario, sin cambiar el rol de nadie a admin.
--
-- Caso de uso (2026-09-02): un vendedor especifico va a llevar la metrica global de ventas.
-- Cambiarle el rol a admin no sirve -- perderia la logica de "solo mis prospectos/clientes"
-- en TODO lo demas, y is_admin_user() lo sacaria por completo del alcance de
-- role_module_scopes. La idea es: mismo rol/logica de vendedor en todo, mas la posibilidad
-- puntual de ver el dashboard global.
--
-- No hace falta tocar RLS: prospects_select_global y reservations_select_global YA usan
-- has_global_scope(), que es agnostico al nombre del rol -- solo mira role_module_scopes. Con
-- 'prospectos' y 'reservas' en 'all' para el rol, el dashboard global lee los datos sin
-- problema. Este permiso nuevo solo abre la RUTA (ver App.tsx / DealershipLayout.tsx) -- la
-- data la sigue filtrando (o no) el alcance de siempre.
INSERT INTO public.permissions (name, description, module)
VALUES ('dashboard_global.view', 'Ver dashboard global (todos los concesionarios, como Admin)', 'dashboard_global')
ON CONFLICT (name) DO NOTHING;
