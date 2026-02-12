import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, ShieldCheck, Users, Wrench, ArrowRight } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();

  const portales = [
    {
      titulo: 'Portal del Cliente',
      descripcion: 'Agenda tu servicio, consulta concesionarios y gestiona tus reservas desde tu celular.',
      icon: Car,
      ruta: '/usuario',
      color: 'gac-gradient',
      textColor: 'text-primary-foreground',
    },
    {
      titulo: 'Panel Administrativo',
      descripcion: 'Visualiza todas las reservas, controla garantías y supervisa el historial de servicios.',
      icon: ShieldCheck,
      ruta: '/admin',
      color: 'bg-gac-dark',
      textColor: 'text-primary-foreground',
    },
    {
      titulo: 'Panel del Concesionario',
      descripcion: 'Gestiona las reservas de tu sede, registra prospectos y da seguimiento a clientes.',
      icon: Users,
      ruta: '/concesionario',
      color: 'bg-gac-charcoal',
      textColor: 'text-primary-foreground',
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <header className="gac-gradient px-6 py-12 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Wrench className="w-8 h-8 text-primary-foreground" />
            <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-foreground tracking-tight">
              GAC Motor Venezuela
            </h1>
          </div>
          <p className="text-primary-foreground/80 text-base md:text-lg">
            Sistema de Gestión de Servicios y Reservas
          </p>
        </div>
      </header>

      {/* Portal Cards */}
      <main className="flex-1 px-6 py-10 max-w-4xl mx-auto w-full">
        <h2 className="text-xl font-display font-bold mb-6 text-center">Selecciona tu portal de acceso</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {portales.map(p => (
            <Card
              key={p.ruta}
              className="overflow-hidden gac-shadow hover:gac-shadow-lg transition-all cursor-pointer group"
              onClick={() => navigate(p.ruta)}
            >
              <div className={`${p.color} p-6 flex items-center justify-center`}>
                <p.icon className={`w-12 h-12 ${p.textColor}`} />
              </div>
              <CardContent className="p-5">
                <h3 className="font-display font-semibold text-lg mb-2">{p.titulo}</h3>
                <p className="text-sm text-muted-foreground mb-4">{p.descripcion}</p>
                <Button variant="outline" className="w-full group-hover:border-primary group-hover:text-primary transition-colors" size="sm">
                  Acceder <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-muted py-4 text-center text-xs text-muted-foreground">
        © 2025 GAC Motor Venezuela · Sistema de Gestión de Servicios
      </footer>
    </div>
  );
};

export default Index;
