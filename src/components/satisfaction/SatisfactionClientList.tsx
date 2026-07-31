import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Phone, Users } from 'lucide-react';
import { getSatisfactionLevel } from '@/lib/satisfaction';
import { cn } from '@/lib/utils';
import type { SatisfactionClientListRow } from './satisfactionDashboardUtils';

interface SatisfactionClientListProps {
  rows: SatisfactionClientListRow[];
}

/**
 * Navigable client list (requirements.md R7). Clicking a row navigates to
 * that client's detail with the surveys sub-tab open — the pinned deep-link
 * contract:
 *   ?client=<client_id>&tab=encuestas
 * against whichever portal (`/admin/clientes` or `/concesionario/clientes`)
 * is currently active — `AdminClientes.tsx` serves both routes
 * (`src/App.tsx:88` and `:102`), so the path is never hardcoded to `/admin`.
 * `AdminClientes.tsx` (owned by another work-unit) reads those two params,
 * opens `ClientDetailDialog` for that client, and selects its "encuestas"
 * tab. Rows with no linked client (legacy pre-migration surveys,
 * `client_id IS NULL`) render normally but are not clickable.
 */
const SatisfactionClientList = ({ rows }: SatisfactionClientListProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const clientesBasePath = location.pathname.startsWith('/concesionario') ? '/concesionario/clientes' : '/admin/clientes';

  return (
    <Card className="gac-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Users className="w-4 h-4" /> Clientes ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sin datos para los filtros seleccionados</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Teléfono</TableHead>
                  <TableHead className="text-xs">Concesionario</TableHead>
                  <TableHead className="text-xs text-center">Encuestas</TableHead>
                  <TableHead className="text-xs">Última encuesta</TableHead>
                  <TableHead className="text-xs text-center">Puntaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const level = row.lastOverallScore != null ? getSatisfactionLevel(Math.round(row.lastOverallScore)) : null;
                  const clickable = !!row.clientId;
                  return (
                    <TableRow
                      key={row.key}
                      className={cn(clickable && 'cursor-pointer hover:bg-muted/50 transition-colors')}
                      onClick={clickable ? () => navigate(`${clientesBasePath}?client=${row.clientId}&tab=encuestas`) : undefined}
                      title={clickable ? `Ver a ${row.clientName} en Clientes` : 'Encuesta histórica sin cliente vinculado'}
                    >
                      <TableCell className="text-xs font-medium">{row.clientName}</TableCell>
                      <TableCell className="text-xs">
                        {row.clientPhone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-muted-foreground" /> {row.clientPhone}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs">{row.dealershipName || '-'}</TableCell>
                      <TableCell className="text-xs text-center">{row.respondedCount}/{row.surveysCount}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(row.lastSurveyAt), "d 'de' MMMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-center">
                        {level ? (
                          <Badge className="text-[10px] gap-1" style={{ backgroundColor: `hsl(${level.color} / 0.15)`, color: `hsl(${level.color})` }}>
                            {row.lastOverallScore!.toFixed(1)} {level.emoji}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Pendiente</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SatisfactionClientList;
