import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayoutDashboard, Users, Server, LogOut, Shield, BarChart2, Package, Menu, X } from "lucide-react";
import { useAuth } from "@/store/auth";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import ServersPage from "@/pages/Servers";
import StatsPage from "@/pages/Stats";
import PlansPage from "@/pages/Plans";

const qc = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
        : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
    }`;

  const NavContent = () => (
    <>
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
        <NavLink to="/" end className={navClass} onClick={() => setOpen(false)}>
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </NavLink>
        <NavLink to="/stats" className={navClass} onClick={() => setOpen(false)}>
          <BarChart2 className="w-4 h-4" /> Statistics
        </NavLink>

        <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider px-3 py-2 mt-3">Manage</p>
        <NavLink to="/users" className={navClass} onClick={() => setOpen(false)}>
          <Users className="w-4 h-4" /> Users
        </NavLink>
        <NavLink to="/servers" className={navClass} onClick={() => setOpen(false)}>
          <Server className="w-4 h-4" /> Servers
        </NavLink>
        <NavLink to="/plans" className={navClass} onClick={() => setOpen(false)}>
          <Package className="w-4 h-4" /> Plans
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
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#0a0c12]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-white/5 bg-[#0d0f17]">
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={`fixed top-0 left-0 h-full w-64 flex flex-col bg-[#0d0f17] border-r border-white/5 z-50 transform transition-transform duration-300 md:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0f17] md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <p className="text-white font-bold text-sm">VPN Admin</p>
          </div>
        </div>
        <div className="p-4 md:p-8">{children}</div>
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
      <BrowserRouter basename="/ilovemydad9708">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute><Layout><StatsPage /></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Layout><ServersPage /></Layout></ProtectedRoute>} />
          <Route path="/plans" element={<ProtectedRoute><Layout><PlansPage /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
