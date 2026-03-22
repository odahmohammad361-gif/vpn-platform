import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Shield, Loader2 } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c12] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 rounded-2xl bg-blue-600/20 border border-blue-500/30 glow-blue mb-4">
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">VPN Admin</h1>
            <p className="text-gray-500 text-sm mt-1">Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-medium uppercase tracking-wider">Username</label>
              <input
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition placeholder-gray-600"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium uppercase tracking-wider">Password</label>
              <input
                type="password"
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 transition placeholder-gray-600"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
