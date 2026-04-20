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
import ConfigLayout from "./components/layouts/ConfigLayout";
import PublicReserva from "./pages/PublicReserva";
import PublicProspectos from "./pages/PublicProspectos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
    <AdminLayout>{children}</AdminLayout>
  </ProtectedRoute>
);

const DealershipRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['concesionario', 'Vendedor', 'superadmin', 'admin']}>
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
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/magic-login" element={<MagicLogin />} />
            <Route path="/" element={<RedirectByRole />} />
            <Route path="/reservar" element={<PublicReserva />} />
            <Route path="/prospectos" element={<PublicProspectos />} />

            {/* Cliente routes */}
            <Route path="/usuario" element={
              <ProtectedRoute allowedRoles={['cliente', 'superadmin', 'admin']}>
                <UserPortal />
              </ProtectedRoute>
            } />

            {/* Concesionario routes with sidebar layout */}
            <Route path="/concesionario" element={<DealershipRoute><DealershipDashboard /></DealershipRoute>} />
            <Route path="/concesionario/reservas" element={<DealershipRoute><DealershipReservas /></DealershipRoute>} />
            <Route path="/concesionario/prospectos" element={<DealershipRoute><DealershipProspectos /></DealershipRoute>} />

            {/* Admin routes with sidebar layout */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/reservas" element={<AdminRoute><AdminReservas /></AdminRoute>} />
            <Route path="/admin/garantias" element={<AdminRoute><AdminGarantias /></AdminRoute>} />
            <Route path="/admin/historial" element={<AdminRoute><AdminHistorial /></AdminRoute>} />
            <Route path="/admin/concesionarios" element={<AdminRoute><AdminConcesionarios /></AdminRoute>} />
            <Route path="/admin/vehiculos" element={<AdminRoute><AdminVehiculos /></AdminRoute>} />
            <Route path="/admin/modelos" element={<AdminRoute><AdminModelos /></AdminRoute>} />
            <Route path="/admin/clientes" element={<AdminRoute><AdminClientes /></AdminRoute>} />
            <Route path="/admin/prospectos" element={<AdminRoute><AdminProspectos /></AdminRoute>} />
            <Route path="/admin/configuracion" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminGeneral /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/general" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminGeneral /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/usuarios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminUsuarios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/roles" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminRoles /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/servicios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminServicios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/garantias" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminCondicionesGarantia /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/plantillas" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminPlantillas /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/automatizaciones" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminAutomatizaciones /></ConfigLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
