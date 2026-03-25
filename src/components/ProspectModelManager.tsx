import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ProspectModel {
  id: string;
  brand: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onModelsChanged: () => void;
}

const ProspectModelManager = ({ open, onOpenChange, onModelsChanged }: Props) => {
  const [models, setModels] = useState<ProspectModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editName, setEditName] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_models' as any)
      .select('*')
      .order('brand')
      .order('sort_order');
    setModels((data || []) as unknown as ProspectModel[]);
    setLoading(false);
  };

  useEffect(() => { if (open) fetchAll(); }, [open]);

  const brands = useMemo(() => Array.from(new Set(models.map(m => m.brand))).sort(), [models]);

  const filteredModels = useMemo(() =>
    filterBrand === 'all' ? models : models.filter(m => m.brand === filterBrand),
    [models, filterBrand]
  );

  const handleAdd = async () => {
    if (!newBrand.trim() || !newName.trim()) { toast.error('Marca y nombre son requeridos'); return; }
    setSaving(true);
    const maxOrder = models.filter(m => m.brand === newBrand.trim().toUpperCase()).length;
    const { error } = await (supabase.from('prospect_models' as any) as any).insert({
      brand: newBrand.trim().toUpperCase(),
      name: newName.trim(),
      sort_order: maxOrder + 1,
    });
    if (error) { toast.error('Error al crear modelo'); console.error(error); }
    else { toast.success('Modelo creado'); setNewBrand(''); setNewName(''); fetchAll(); onModelsChanged(); }
    setSaving(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editBrand.trim() || !editName.trim()) { toast.error('Marca y nombre son requeridos'); return; }
    const { error } = await (supabase.from('prospect_models' as any) as any)
      .update({ brand: editBrand.trim().toUpperCase(), name: editName.trim() })
      .eq('id', id);
    if (error) { toast.error('Error al actualizar'); console.error(error); }
    else { toast.success('Modelo actualizado'); setEditingId(null); fetchAll(); onModelsChanged(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from('prospect_models' as any) as any).delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); console.error(error); }
    else { toast.success('Modelo eliminado'); fetchAll(); onModelsChanged(); }
  };

  const startEdit = (m: ProspectModel) => {
    setEditingId(m.id);
    setEditBrand(m.brand);
    setEditName(m.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">Modelos de Interés</DialogTitle>
        </DialogHeader>

        {/* Add new */}
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Marca</Label>
            <Input value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="GAC" className="h-8 text-xs uppercase" />
          </div>
          <div className="space-y-1 flex-[2]">
            <Label className="text-xs">Nombre</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="EMPOW GS" className="h-8 text-xs" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving} className="h-8 gap-1">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </Button>
        </div>

        {/* Brand filter */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filtrar:</Label>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las marcas</SelectItem>
              {brands.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filteredModels.length} modelos</span>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px]">
                <TableHead>Marca</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.map(m => (
                <TableRow key={m.id} className="[&>td]:py-1">
                  {editingId === m.id ? (
                    <>
                      <TableCell>
                        <Input value={editBrand} onChange={e => setEditBrand(e.target.value)} className="h-7 text-xs uppercase" />
                      </TableCell>
                      <TableCell>
                        <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs" />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleUpdate(m.id)}>
                            <Check className="w-3 h-3 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{m.brand}</TableCell>
                      <TableCell>{m.name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(m)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {filteredModels.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    No hay modelos configurados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProspectModelManager;
