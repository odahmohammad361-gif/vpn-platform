import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayoutDashboard, Users, Server, LogOut, Shield, BarChart2 } from "lucide-react";
import { useAuth } from "@/store/auth";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import ServersPage from "@/pages/Servers";
import StatsPage from "@/pages/Stats";

const qc = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
        : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
    }`;

  return (
    <div className="flex min-h-screen bg-[#0a0c12]">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-white/5 bg-[#0d0f17]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">VPN Admin</p>
            <p className="text-gray-600 text-xs mt-0.5">Management Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider px-3 py-2">Overview</p>
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </NavLink>
          <NavLink to="/stats" className={navClass}>
            <BarChart2 className="w-4 h-4" /> Statistics
          </NavLink>

          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider px-3 py-2 mt-3">Manage</p>
          <NavLink to="/users" className={navClass}>
            <Users className="w-4 h-4" /> Users
          </NavLink>
          <NavLink to="/servers" className={navClass}>
            <Server className="w-4 h-4" /> Servers
          </NavLink>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-white/5">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/10 w-full transition-all duration-200"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
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
          <Route path="/stats" element={<ProtectedRoute><Layout><StatsPage /></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Layout><ServersPage /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
