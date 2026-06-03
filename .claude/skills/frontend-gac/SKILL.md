---
name: frontend-gac
description: >
  Especialista en desarrollo frontend del proyecto GAC Venezuela.
  Úsala para: crear o modificar páginas React, agregar componentes,
  implementar formularios, manejar permisos en UI, agregar rutas,
  trabajar con shadcn/ui, Tailwind, hooks del proyecto, o cualquier
  cambio en src/. También aplica para bugs de UI, columnas de tabla,
  filtros, modales, y patrones de estado del proyecto.
---

# Frontend GAC — Patrones y Convenciones

## Stack técnico

- **React 18** + **TypeScript** + **Vite** (puerto 8080 por defecto, puede variar)
- **Tailwind CSS** + **shadcn/ui** (radix-ui)
- **React Router DOM v6** — routing
- **@tanstack/react-query** — server state (poco usado, mayoría usa useState + fetch directo)
- **Sonner** — toasts (`toast.success()`, `toast.error()`)
- **Recharts** — gráficas en dashboard
- **Alias**: `@/` apunta a `src/`

## Comandos
```bash
npm run dev    # Dev server
npm run build  # Build de producción (verificar antes de push)
npm run lint   # ESLint
```

---

## Estructura de rutas (App.tsx)

```
/              → RedirectByRole (redirige según portal del rol)
/login         → Login.tsx
/magic-login   → MagicLogin.tsx
/reservar      → PublicReserva.tsx (sin auth)
/prospectos    → PublicProspectos.tsx (sin auth)
/usuario       → UserPortal.tsx (portal cliente)
/concesionario → DealershipLayout > DealershipDashboard
/concesionario/reservas    → DealershipReservas
/concesionario/prospectos  → DealershipProspectos
/concesionario/garantias   → AdminGarantias (reutilizado)
/concesionario/historial   → AdminHistorial (reutilizado)
/concesionario/vehiculos   → AdminVehiculos (reutilizado)
/concesionario/modelos     → AdminModelos (reutilizado)
/concesionario/clientes    → AdminClientes (reutilizado)
/concesionario/concesionarios → AdminConcesionarios (reutilizado)
/concesionario/usuarios    → AdminUsuarios (reutilizado)
/concesionario/roles       → AdminRoles (reutilizado)
/admin         → AdminLayout > AdminDashboard
/admin/reservas, /admin/garantias, etc.
/admin/configuracion/*     → ConfigLayout > AdminRoles, AdminUsuarios, etc.
```

**Agregar una ruta nueva en App.tsx**:
1. Importar el componente
2. Añadir `<Route path="..." element={<AdminRoute><MiComponente /></AdminRoute>} />`
3. Para concesionario: usar `<DealershipRoute>`
4. Agregar el item al `menuGroups` en `DealershipLayout.tsx` o `menuItems` en `AdminLayout.tsx`

---

## Sistema de permisos en UI

```typescript
const { hasPermission, role } = useAuth();

// Verificar permiso
if (!hasPermission('reservas.create')) return null;

// Verificar rol
const isAdmin = role?.name === 'superadmin' || role?.name === 'admin';
const isVendedor = role?.name === 'vendedor';

// Permisos disponibles: {módulo}.{acción}
// módulos: dashboard, clientes, vehiculos, modelos, concesionarios,
//          reservas, garantias, historial, prospectos, usuarios, roles
// acciones: view, create, edit, delete
```

---

## Hooks del proyecto

### `useDealershipAccess()`
```typescript
const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading } = useDealershipAccess();
// dealerships: todos los accesibles según rol
// selectedDealership: ID del concesionario activo
// showSelector: true cuando hay múltiples opciones
```

### `useCurrentSalesperson()`
```typescript
const { salesperson, isSalesperson } = useCurrentSalesperson();
// salesperson: registro del vendedor vinculado al usuario actual
// isSalesperson: true si el rol es vendedor
```

### `useNotifications()`
```typescript
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
```

### Hooks de catálogos
```typescript
const { statuses } = useProspectStatuses();   // estados de prospectos
const { sources } = useProspectSources();     // fuentes de leads
const { events } = useProspectEvents();       // eventos/ferias
const { salespersons } = useSalespersons();   // lista de vendedores
```

---

## Patrones de formularios

### Persistencia en localStorage/sessionStorage
```typescript
// Clave de localStorage (ya establecidas)
const LS_KEY = 'admin_reservas_create_form';    // AdminReservas (crear)
const LS_KEY = 'dealership_reservas_create_form'; // DealershipReservas
const SS_KEY = 'dealership_prospectos_dialog';    // DealershipProspectos (sessionStorage)

// Patrón de init desde storage
const [pName, setPName] = useState<string>(() => getSS().pName || '');

// Patrón de guardado
useEffect(() => {
  if (!dialogOpen || editing) { sessionStorage.removeItem(SS_KEY); return; }
  sessionStorage.setItem(SS_KEY, JSON.stringify({ dialogOpen, pName, pPhone, ... }));
}, [dialogOpen, editing, pName, pPhone, ...]);
```

### Validación con confirmación de campos faltantes
```typescript
// Patrón: campos opcionales → mostrar diálogo de confirmación si faltan
const missing: string[] = [];
if (!pEmail.trim()) missing.push('Correo electrónico');
if (missing.length > 0) {
  setMissingFields(missing);
  setConfirmOpen(true);
  return;
}
await doSave();
```

---

## Patrones de tabla

### Columnas toggleables
```typescript
type ColKey = 'nombre' | 'empresa' | 'telefono' | 'email' | ...;
const COL_LABELS: Record<ColKey, string> = { nombre: 'Nombre', empresa: 'Empresa', ... };
const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(ALL_COLS));

// En JSX:
{visibleCols.has('empresa') && <TableHead>Empresa</TableHead>}
{visibleCols.has('empresa') && <TableCell>{p.company_name || '-'}</TableCell>}
```

### Ordenamiento
```typescript
type SortField = 'name' | 'created_at' | ...;
const [sortField, setSortField] = useState<SortField>('created_at');
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
const toggleSort = (f: SortField) => { setSortDir(d => f === sortField ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); setSortField(f); };
```

---

## Componentes shadcn/ui más usados

```typescript
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';  // classnames helper
```

**Clases de tamaño estándar del proyecto**:
- Texto xs en tablas: `text-xs`, encabezados `text-[11px] font-semibold`
- Botones en tabla: `h-6 w-6` (ghost icon)
- Inputs de filtro: `h-8 text-xs`
- Badges de estado: `text-[10px] px-1.5 py-0`

---

## Clases de colores de estado (reservas)

```typescript
const STATUS_COLORS = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-blue-100 text-blue-800',
  en_proceso: 'bg-purple-100 text-purple-800',
  completada: 'bg-green-100 text-green-800',
  cancelada:  'bg-red-100 text-red-800',
};
```

---

## Garantías — Patrón con fallback global

```typescript
// Si el modelo tiene valores propios → usar esos
// Si no → usar warranty_conditions (tabla global)
const hasModelWarranty = m && (m.warranty_km != null || m.warranty_months != null);
const maxKm = hasModelWarranty ? m.warranty_km! : warrantyCond?.max_km ?? 0;
const maxMonths = hasModelWarranty ? m.warranty_months! : warrantyCond?.max_months ?? 0;
```

---

## Pitfalls frecuentes

| Problema | Causa | Solución |
|---|---|---|
| Blank page | Import duplicado | `grep -n "from 'lucide-react'"` para encontrar duplicados |
| `PORTAL_BASE_PERMS is not defined` | Constante eliminada sin limpiar referencias | `grep -n "PORTAL_BASE_PERMS" src/` |
| Supabase `as any` en tablas nuevas | Types.ts no regenerado | Usar `as any` mientras el equipo no regenere tipos |
| `prospects."Estado de Vnzla"` | Columna con espacio | En SQL: comillas dobles; en JS: `p['Estado de Vnzla']` |
| Form no persiste | sessionStorage.removeItem incorrecto | Verificar que solo se llama cuando `editing` no es null |

---

## Build check obligatorio

Siempre verificar antes de hacer push:
```bash
npm run build 2>&1 | grep -E "✓ built|error TS|Error\b"
```

Si hay error TypeScript, la build falla aunque el dev server funcione.
