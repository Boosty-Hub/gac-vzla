import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vehicle {
  id: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number;
  purchase_date: string | null;
  warranty_active: boolean;
  is_active: boolean;
  vehicle_models: { name: string; brand: string } | null;
  clients: { full_name: string; cedula: string | null } | null;
}

const AdminVehiculos = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const fetchVehicles = async () => {
    setLoading(true);

    let query = supabase
      .from('vehicles')
      .select('*, vehicle_models(name, brand), clients(full_name, cedula)', { count: 'exact' });

    if (brandFilter !== 'all') {
      query = query.eq('vehicle_models.brand', brandFilter);
    }

    if (busqueda.trim()) {
      query = query.or(`plate.ilike.%${busqueda}%,vin.ilike.%${busqueda}%,color.ilike.%${busqueda}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching vehicles:', error);
    } else {
      // If brand filter is active, filter client-side since PostgREST can't filter on joined columns in .eq
      let filtered = data || [];
      if (brandFilter !== 'all') {
        filtered = filtered.filter(v => v.vehicle_models?.brand === brandFilter);
      }
      setVehicles(filtered as Vehicle[]);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    setPage(0);
  }, [busqueda, brandFilter, pageSize]);

  useEffect(() => {
    fetchVehicles();
  }, [page, busqueda, brandFilter, pageSize]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Vehículos</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Car className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar placa, VIN o color..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="GAC">GAC</SelectItem>
            <SelectItem value="DFSK">DFSK</SelectItem>
            <SelectItem value="SHINERAY">SHINERAY</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 filas</SelectItem>
            <SelectItem value="300">300 filas</SelectItem>
            <SelectItem value="1000">1000 filas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando vehículos...</p>
          </CardContent>
        ) : vehicles.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron vehículos</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Año</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>VIN</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>F. Compra</TableHead>
                <TableHead>Gar.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map(v => (
                <TableRow key={v.id} className="[&>td]:py-1.5">
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
                      {v.vehicle_models?.brand || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{v.vehicle_models?.name || '-'}</TableCell>
                  <TableCell>{v.year}</TableCell>
                  <TableCell className="font-mono">{v.plate || '-'}</TableCell>
                  <TableCell>{v.color || '-'}</TableCell>
                  <TableCell className="max-w-[160px] truncate" title={v.clients?.full_name || ''}>
                    {v.clients?.full_name || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono">{v.vin || '-'}</TableCell>
                  <TableCell>{v.mileage.toLocaleString()}</TableCell>
                  <TableCell>{formatDate(v.purchase_date)}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-[10px] px-1.5 py-0", v.warranty_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
                      {v.warranty_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVehiculos;
