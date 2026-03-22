import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayoutDashboard, Users, Server, LogOut } from "lucide-react";
import { useAuth } from "@/store/auth";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import ServersPage from "@/pages/Servers";

const qc = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition ${isActive ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`;

  return (
    <div className="flex min-h-screen bg-gray-950">
      <aside className="w-56 bg-gray-900 flex flex-col p-4 gap-1">
        <div className="text-white font-bold text-lg px-4 py-3 mb-2">VPN Admin</div>
        <NavLink to="/" end className={navClass}><LayoutDashboard className="w-4 h-4" /> Dashboard</NavLink>
        <NavLink to="/users" className={navClass}><Users className="w-4 h-4" /> Users</NavLink>
        <NavLink to="/servers" className={navClass}><Server className="w-4 h-4" /> Servers</NavLink>
        <div className="mt-auto">
          <button onClick={logout} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white w-full transition">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Layout><ServersPage /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
