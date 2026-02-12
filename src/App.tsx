import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, RedirectByRole } from "@/components/ProtectedRoute";
import AdminLayout from "@/components/layouts/AdminLayout";
import Login from "./pages/Login";
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
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AdminModelos from "./pages/admin/AdminModelos";
import AdminClientes from "./pages/admin/AdminClientes";
import AdminRoles from "./pages/admin/config/AdminRoles";
import AdminPermisos from "./pages/admin/config/AdminPermisos";
import ConfigLayout from "./components/layouts/ConfigLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
    <AdminLayout>{children}</AdminLayout>
  </ProtectedRoute>
);

const DealershipRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['concesionario', 'superadmin', 'admin']}>
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
            <Route path="/" element={<RedirectByRole />} />

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
            <Route path="/admin/configuracion" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminUsuarios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/usuarios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminUsuarios /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/roles" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminRoles /></ConfigLayout></ProtectedRoute>} />
            <Route path="/admin/configuracion/permisos" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ConfigLayout><AdminPermisos /></ConfigLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
