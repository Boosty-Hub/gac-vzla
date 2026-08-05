-- BUG: un lead marcado en Kommo como "GAC - Maracaibo" entraba al sistema bajo
-- "PITS Services Maracaibo".
--
-- CAUSA: kommo-webhook no tenia forma de saber a que concesionario apunta cada opcion del
-- campo "Concesionario" de Kommo. Lo adivinaba comparando el texto del label contra
-- `dealerships.name` con un puntaje `compartidos / min(#tokens)`. "GAC - Maracaibo" se reduce
-- a un unico token distintivo ("gac" es generico), asi que el minimo valia 1 y los TRES
-- concesionarios que contienen "maracaibo" puntuaban 1.00:
--     GAC - Maracaibo | PITS Services Maracaibo | Tecnico Foraneo - Maracaibo
-- El desempate era `score > best.score`, estricto, sobre un SELECT sin ORDER BY: ganaba la
-- fila mas antigua de la tabla, o sea PITS (creado 2026-02-23; GAC - Maracaibo, 2026-06-17).
--
-- ALCANCE MEDIDO: de 1209 prospectos auto-creados desde Kommo, 145 quedaron en un
-- concesionario distinto del que hoy tienen, es decir que alguien los corrigio a mano.
-- El caso Maracaibo->PITS esta probado en integration_logs (webhook_auto_created con
-- dealership_id = e5af9302..., el ultimo el 2026-08-05 15:40).
--
-- ARREGLO: dejar de adivinar donde se puede. Esta columna fija la correspondencia
-- enum de Kommo -> concesionario. El webhook la consulta ANTES que cualquier heuristica.
-- El emparejamiento por nombre sigue existiendo, corregido y con guarda de empate, pero solo
-- para opciones nuevas del CRM que todavia no esten mapeadas aca.

ALTER TABLE public.dealerships
  ADD COLUMN IF NOT EXISTS kommo_concesionario_enum_id integer;

COMMENT ON COLUMN public.dealerships.kommo_concesionario_enum_id IS
  'Enum id de la opcion del campo "Concesionario" (CF 2988984) en Kommo. Correspondencia '
  'explicita usada por kommo-webhook para resolver el concesionario de un lead sin depender '
  'de como este escrito el label en el CRM.';

-- Indice parcial: varios concesionarios pueden no tener enum (NULL), pero un mismo enum no
-- puede apuntar a dos concesionarios; si pasara volveriamos justo al empate que causo el bug.
CREATE UNIQUE INDEX IF NOT EXISTS dealerships_kommo_concesionario_enum_id_key
  ON public.dealerships (kommo_concesionario_enum_id)
  WHERE kommo_concesionario_enum_id IS NOT NULL;

-- Las 16 opciones del campo Concesionario en Kommo al 2026-08-05, leidas de
-- GET /api/v4/leads/custom_fields/2988984. Quedan dos sin cargar a proposito, porque no
-- existe hoy un concesionario que les corresponda:
--   7832496  Meta Car Group (Zulia) - DFSK
--   8039476  Centro de Servicio Guarenas
-- Esas dos siguen el camino normal del webhook: si algun dia llega un lead con ellas, se crea
-- el concesionario a partir del label y el enum queda guardado solo.
UPDATE public.dealerships AS d
   SET kommo_concesionario_enum_id = m.enum_id
  FROM (VALUES
    (7832490, '7f8bd94d-a0d5-415d-8447-01160aee358a'::uuid), -- Harbin Motor (La Trinidad) - DFSK    -> Harbin Motors, C.A.
    (7832492, '6bbeb735-19a8-4edc-bdee-ba12324b2d25'::uuid), -- Las Garzas Motor (Anzoategui) - DFSK -> Las Garzas Motor
    (7832494, '1b7d540d-4620-4e96-87cd-1dbb5c1b072c'::uuid), -- Hobby Cars (Barinas) - DFSK          -> Hobby Cars
    (7832498, 'f46ec26f-9b04-47d2-9c5b-2a1e6599db0e'::uuid), -- Palma Motors (Falcon) - DFSK         -> Palma Motors
    (7832502, 'dedb0beb-5ffd-45af-9959-5b2e02d2b77e'::uuid), -- GAC Street Boutique (Rosal) - GAC    -> GAC - Street Boutique El Rosal
    (7832504, '5fbaec0a-d3fc-4c22-b88a-0395be25eef8'::uuid), -- GAC - Valencia (Valencia) - GAC      -> GAC - Valencia
    (7832506, '6e9a1905-429a-45ba-ac57-3195c346359b'::uuid), -- GAC - Barquisimeto (Barquisimeto)    -> GAC - Barquisimeto
    (7832508, 'a8df1db5-4d62-47b9-9ca2-ad0bc86dd896'::uuid), -- Automotores la Florida (Caracas)     -> Automotores La Florida, C.A.
    (7832510, '474ce46a-2a8b-4679-bd38-7a2c8bb51f87'::uuid), -- GAC - La Castellana (Caracas) - GAC  -> GAC - La Castellana
    (8134449, '88fda915-e3c4-4d6e-8b34-b3f946939db8'::uuid), -- GAC - Lecherias (Anzoategui) - GAC   -> GAC - Lecherias
    (8159325, '5cf22c48-65c1-4ead-ba6d-772d75676b5b'::uuid), -- Soy Tecnho Exhibicion (typo en CRM)  -> Soy Techno Exhibicion
    (8166565, 'c897da6f-96e0-4afb-a504-39828dac0693'::uuid), -- GAC - El Tigre                       -> GAC - El Tigre
    (8166567, '6a804c85-b340-40e2-a434-b9616a3e63d5'::uuid), -- GAC - Maracaibo                      -> GAC - Maracaibo   <-- el del bug
    (8168865, 'f840d868-f3b8-4abd-8375-aa68afd0ff87'::uuid)  -- Los Aviadores - Maracay              -> Centro De Servicio Los Aviadores
  ) AS m(enum_id, dealership_id)
 WHERE d.id = m.dealership_id;
