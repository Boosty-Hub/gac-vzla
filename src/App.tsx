import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, RedirectByRole } from "@/components/ProtectedRoute";
import AdminLayout from "@/components/layouts/AdminLayout";
import Login from "./pages/Login";
import MagicLogin from "./pages/MagicLogin";
import AuthCallback from "./pages/AuthCallback";
import UserPortal from "./pages/UserPortal";
import DealershipLayout from "./components/layouts/DealershipLayout";
import DealershipDashboard from "./pages/dealership/DealershipDashboard";
import DealershipReservas from "./pages/dealership/DealershipReservas";
import DealershipProspectos from "./pages/dealership/DealershipProspectos";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminReservas from "./pages/admin/AdminReservas";
import AdminGarantias from "./pages/admin/AdminGarantias";
import AdminHistorial from "./pages/admin/AdminHistorial";
import AdminConcesionarios from "./pages/admin/AdminConcesionarios";
import AdminVehiculos from "./pages/admin/AdminVehiculos";
import AdminModelos from "./pages/admin/AdminModelos";
import AdminClientes from "./pages/admin/AdminClientes";
import AdminProspectos from "./pages/admin/AdminProspectos";
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AdminRoles from "./pages/admin/config/AdminRoles";
import AdminServicios from './pages/admin/config/AdminServicios';
import AdminCondicionesGarantia from './pages/admin/config/AdminCondicionesGarantia';
import AdminGeneral from './pages/admin/config/AdminGeneral';
import AdminPlantillas from './pages/admin/config/AdminPlantillas';
import AdminAutomatizaciones from './pages/admin/config/AdminAutomatizaciones';
import AdminEventos from './pages/admin/config/AdminEventos';
import AdminSoporte from './pages/admin/config/AdminSoporte';
import ConfigLayout from "./components/layouts/ConfigLayout";
import BoostySupport from "./components/BoostySupport";
import PublicReserva from "./pages/PublicReserva";
import PublicMiFlota from "./pages/PublicMiFlota";
import PublicProspectos from "./pages/PublicProspectos";
import PublicEncuesta from "./pages/PublicEncuesta";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * `module` es el permiso que hace falta para entrar. Sin él, estas rutas sólo miraban el
 * portal: el menú escondía el ítem, pero escribir la dirección a mano entraba igual. Un
 * vendedor podía abrir /concesionario/roles y ver la matriz completa de roles y permisos.
 *
 * Las home de cada portal van sin `module` a propósito: ahí el layout ya redirige al primer
 * módulo disponible.
 */
const AdminRoute = ({ children, module }: { children: React.ReactNode; module?: string }) => (
  <ProtectedRoute allowedPortals={['admin']} requiredModule={module}>
    <AdminLayout>{children}</AdminLayout>
  </ProtectedRoute>
);

const DealershipRoute = ({ children, module }: { children: React.ReactNode; module?: string }) => (
  <ProtectedRoute allowedPortals={['concesionario', 'admin']} requiredModule={module}>
    <DealershipLayout>{children}</DealershipLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BoostySupport />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/magic-login" element={<MagicLogin />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={<RedirectByRole />} />
            <Route path="/reservar" element={<PublicReserva />} />
            <Route path="/mi-flota" element={<PublicMiFlota />} />
            <Route path="/prospectos" element={<PublicProspectos />} />
            <Route path="/encuesta/:token" element={<PublicEncuesta />} />

            {/* Cliente routes */}
            <Route path="/usuario" element={
              <ProtectedRoute allowedPortals={['cliente', 'admin']}>
                <UserPortal />
              </ProtectedRoute>
            } />

            {/* Concesionario routes — ALL modules accessible; visibility controlled by permissions */}
            <Route path="/concesionario" element={<DealershipRoute><DealershipDashboard /></DealershipRoute>} />
            <Route path="/concesionario/reservas" element={<DealershipRoute module="reservas"><DealershipReservas /></DealershipRoute>} />
            <Route path="/concesionario/prospectos" element={<DealershipRoute module="prospectos"><DealershipProspectos /></DealershipRoute>} />
            <Route path="/concesionario/garantias" element={<DealershipRoute module="garantias"><AdminGarantias /></DealershipRoute>} />
            <Route path="/concesionario/historial" element={<DealershipRoute module="historial"><AdminHistorial /></DealershipRoute>} />
            <Route path="/concesionario/vehiculos" element={<DealershipRoute module="vehiculos"><AdminVehiculos /></DealershipRoute>} />
            <Route path="/concesionario/modelos" element={<DealershipRoute module="modelos"><AdminModelos /></DealershipRoute>} />
            <Route path="/concesionario/clientes" element={<DealershipRoute module="clientes"><AdminClientes /></DealershipRoute>} />
            <Route path="/concesionario/concesionarios" element={<DealershipRoute module="concesionarios"><AdminConcesionarios /></DealershipRoute>} />
            <Route path="/concesionario/usuarios" element={<DealershipRoute module="usuarios"><AdminUsuarios /></DealershipRoute>} />
            <Route path="/concesionario/roles" element={<DealershipRoute module="roles"><AdminRoles /></DealershipRoute>} />
            <Route path="/concesionario/eventos" element={<DealershipRoute module="eventos"><AdminEventos /></DealershipRoute>} />

            {/* Admin routes with sidebar layout */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/reservas" element={<AdminRoute module="reservas"><AdminReservas /></AdminRoute>} />
            <Route path="/admin/garantias" element={<AdminRoute module="garantias"><AdminGarantias /></AdminRoute>} />
            <Route path="/admin/historial" element={<AdminRoute module="historial"><AdminHistorial /></AdminRoute>} />
            <Route path="/admin/concesionarios" element={<AdminRoute module="concesionarios"><AdminConcesionarios /></AdminRoute>} />
            <Route path="/admin/vehiculos" element={<AdminRoute module="vehiculos"><AdminVehiculos /></AdminRoute>} />
            <Route path="/admin/modelos" element={<AdminRoute module="modelos"><AdminModelos /></AdminRoute>} />
            <Route path="/admin/clientes" element={<AdminRoute module="clientes"><AdminClientes /></AdminRoute>} />
            <Route path="/admin/prospectos" element={<AdminRoute module="prospectos"><AdminProspectos /></AdminRoute>} />
            <Route path="/admin/eventos" element={<AdminRoute module="eventos"><AdminEventos /></AdminRoute>} />
            <Route path="/admin/configuracion" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminGeneral /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/general" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminGeneral /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/usuarios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminUsuarios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/roles" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminRoles /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/servicios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminServicios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/garantias" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminCondicionesGarantia /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/plantillas" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminPlantillas /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/automatizaciones" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminAutomatizaciones /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/soporte" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminSoporte /></ConfigLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
