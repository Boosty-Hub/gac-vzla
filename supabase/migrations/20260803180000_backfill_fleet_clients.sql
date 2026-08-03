-- `clients.is_fleet` nace en false, asi que despues de crear la columna NINGUNO de los 1376
-- clientes quedo marcado. Consecuencia: la pestaña "Choferes" y el selector de chofer por
-- vehiculo no aparecian para nadie. La funcionalidad estaba, pero invisible.
--
-- Regla acordada con el cliente: mas de 2 vehiculos registrados.
--
-- Deliberadamente NO se filtra por tipo de cedula. Una primera version exigia ademas RIF
-- juridico (J/G), lo que dejaba fuera a 3 personas naturales con varios vehiculos y, con el
-- corte en 5, cubria solo 64 clientes. El criterio operativo real es cuantos vehiculos hay
-- que administrar, no la figura legal del titular.
--
-- Alcance medido antes de aplicar: 150 clientes, 1254 vehiculos.
--
-- Reversible y no destructivo: `is_fleet` solo HABILITA la gestion de choferes, no cambia
-- ningun otro comportamiento. Para revertir un caso puntual basta con apagar el switch
-- "Cliente de flota" en la ficha del cliente.

UPDATE public.clients c
   SET is_fleet = true
 WHERE NOT c.is_fleet
   AND (SELECT count(*) FROM public.vehicles v WHERE v.client_id = c.id) > 2;
