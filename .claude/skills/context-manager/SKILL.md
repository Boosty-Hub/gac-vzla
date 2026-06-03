---
name: context-manager
description: >
  Gestiona el contexto, la memoria y la calidad de los prompts en sesiones largas
  del proyecto GAC Venezuela. Úsala cuando: el contexto esté saturado o cercano
  al límite, cuando haya que guardar información importante entre sesiones,
  cuando el usuario diga "recuerda esto" o "no olvides", cuando una sesión lleve
  muchos requerimientos implementados, o cuando los prompts del usuario sean
  ambiguos y necesiten clarificación antes de actuar.
---

# Context Manager — Gestión de Sesiones GAC

## Cuándo hacer /compact

Ejecuta `/compact` cuando:
- La sesión supera **~50 mensajes** o hay más de **5 requerimientos** implementados
- Se reciban errores de "context limit" o "too many tokens"
- El sistema empiece a olvidar cosas de la sesión actual
- Se complete un bloque de trabajo significativo (ej: 3+ requerimientos de una lista)
- El usuario diga "ya terminamos esta parte" o "pasemos a lo siguiente"

**Antes de compactar**, asegúrate de que:
1. Los cambios importantes estén commiteados (o el usuario sepa que están en local)
2. Se hayan guardado memorias críticas de la sesión
3. Los edge functions desplegados estén desplegados

---

## Sistema de memoria del proyecto

Las memorias del proyecto están en:
`C:\Users\santi\.claude\projects\C--Users-santi-Gac-Vnzla-gac-vzla\memory\`

### Índice: MEMORY.md
Siempre actualizar `MEMORY.md` cuando se agregue una memoria nueva.

### Tipos de memoria

**user/** — Sobre el usuario (Santiago):
- Rol: dueño/product manager del proyecto GAC Venezuela
- Workflow: siempre implementar en local primero, luego pedir autorización para push
- Prefiere: español, respuestas cortas, sin emojis
- No le gusta: pantallas en blanco, cosas confusas, UX compleja

**feedback/** — Guías de comportamiento:
- `workflow_local_first.md` — nunca commitear sin autorización explícita
- `response_style.md` — respuestas concisas, sin resúmenes largos al final

**project/** — Estado del proyecto:
- Stack, credenciales, URLs importantes
- Requerimientos en progreso
- Decisiones técnicas recientes

**reference/** — Dónde encontrar cosas:
- Supabase project ref, tokens
- Kommo pipeline/stage IDs

---

## Cómo escribir una memoria

```markdown
---
name: nombre-kebab-case
description: Una línea — qué hay aquí y cuándo es relevante
metadata:
  type: feedback | user | project | reference
---

Contenido de la memoria.
**Why:** Por qué es importante.
**How to apply:** Cómo usarla en la práctica.
```

---

## Información crítica del proyecto (siempre en contexto)

Si estás en una sesión nueva y necesitas recordar el contexto:

**Credenciales Supabase:**
- Project ref: `wsbuqiznddvxcwvpnbxm`
- Management API: `sbp_b715f486726674624577159f19c827fc1a9d7d4c`

**Reglas de workflow:**
- **Local first**: hacer todos los cambios localmente, el usuario decide cuándo subir
- **Build check**: siempre `npm run build` antes de push
- **Edge functions**: después de modificar, hacer deploy con supabase CLI
- `kommo-webhook` siempre con `--no-verify-jwt`

**Git workflow:**
```bash
git add <archivos específicos>  # NUNCA git add -A sin revisar
git commit -m "tipo: descripción breve\n\nDetalle\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Mejora de prompts del usuario

Cuando el usuario dé un requerimiento ambiguo, antes de implementar:

1. **Identifica la ambigüedad**: ¿Dónde? ¿Qué exactamente? ¿Admin, dealership, o los dos?
2. **Haz UNA pregunta específica** (no un cuestionario)
3. **Propón la interpretación más probable** y pregunta si es correcta

Ejemplos de clarificación rápida:
- "¿Esto aplica al portal admin, al de concesionario, o a los dos?"
- "¿Quieres que sea visible solo para ciertos roles?"
- "¿Debe sincronizarse con Kommo también?"

---

## Priorización de requerimientos

Cuando el usuario da múltiples requerimientos en un mensaje:

1. **Verificar primero** si ya están implementados (leer archivos, no asumir)
2. **Ordenar por dependencias**: primero DB/API, luego frontend
3. **Agrupar los relacionados**: los de la misma página juntos
4. **Comunicar el plan** en formato lista numerada antes de empezar
5. **Confirmar al terminar cada grupo** con qué falta

---

## Checklist de cierre de sesión

Antes de terminar una sesión larga, verificar:

- [ ] Build pasa: `npm run build`
- [ ] Todos los cambios locales commiteados (si el usuario autorizó)
- [ ] Edge functions desplegadas si se modificaron
- [ ] Migraciones SQL aplicadas en Supabase
- [ ] Memorias importantes guardadas en memory/
- [ ] MEMORY.md actualizado con nuevas entradas
- [ ] **Skills enriquecidas** con nuevos patrones, IDs, o soluciones descubiertos

---

## Política de enriquecimiento de skills

**Las skills deben crecer junto con el proyecto.** Después de implementar algo significativo:

### Cuándo enriquecer una skill
- Se descubre un nuevo patrón que se repetirá (ej: cómo obtener company de Kommo)
- Se corrige un pitfall o error frecuente
- Se agrega una tabla/columna nueva a la DB
- Se descubren nuevos IDs de Kommo (stages, campos, pipelines)
- Se implementa un patrón de UI nuevo que se reutilizará
- Se resuelve un bug con una solución no obvia

### Qué agregar a cada skill

**supabase-gac**: Tablas nuevas, columnas, triggers, funciones SQL, queries útiles
**kommo-gac**: IDs nuevos, patrones de API, errores encontrados y cómo resolverlos
**frontend-gac**: Patrones nuevos, componentes nuevos, pitfalls encontrados
**requirements-gac**: Nuevos tipos de requerimientos y su workflow

### Cuándo crear una skill nueva
Si un área de trabajo se vuelve suficientemente compleja y recurrente para merecer su propia guía especializada (ej: sistema de garantías, dashboard widgets, importación Excel).

### Cómo enriquecer
Editar directamente el `SKILL.md` correspondiente en `.claude/skills/`.
Commitear junto con los cambios del requerimiento o en un commit separado.
No esperar a "terminar" — mejor agregar mientras el contexto está fresco.

---

## Señales de saturación de contexto

El contexto puede estar saturado si:
- Claude empieza a repetir soluciones ya implementadas
- Claude no recuerda decisiones de la sesión reciente
- Las respuestas se vuelven genéricas en vez de específicas al proyecto
- El usuario tiene que repetir instrucciones ya dadas

**Acción**: Hacer `/compact` y continuar desde el resumen.
