import { useQuery } from "@tanstack/react-query";
import { Users, Server, TrendingUp, Database } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "@/lib/api";

function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function StatCard({ label, value, icon: Icon, color, glow, sub }: any) {
  return (
    <div className={`glass rounded-2xl p-5 flex items-center gap-4 ${glow}`}>
      <div className={`p-3 rounded-xl ${color} shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value ?? "—"}</p>
        {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs space-y-1">
      <p className="text-gray-400">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatBytes(p.value)}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { data: overview } = useQuery({
    queryKey: ["stats-overview"],
    queryFn: () => api.get("/stats/overview").then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: traffic = [] } = useQuery({
    queryKey: ["stats-traffic"],
    queryFn: () => api.get("/stats/traffic?days=14").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back — here's what's happening</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={overview?.total_users ?? 0} icon={Users} color="bg-blue-600" glow="glow-blue" />
        <StatCard label="Active Users" value={overview?.active_users ?? 0} icon={TrendingUp} color="bg-green-600" glow="glow-green" />
        <StatCard label="Servers" value={overview?.total_servers ?? 0} icon={Server} color="bg-purple-600" glow="glow-purple" />
        <StatCard label="Traffic Today" value={formatBytes(overview?.traffic_today_bytes ?? 0)} icon={Database} color="bg-orange-600" glow="glow-orange" />
      </div>

      {/* Traffic chart */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold">Network Traffic</h2>
            <p className="text-gray-500 text-xs mt-0.5">Last 14 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Download</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Upload</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={traffic} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="download" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="upload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="#374151" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
            <YAxis stroke="#374151" tickFormatter={formatBytes} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="download" stroke="#3b82f6" strokeWidth={2} fill="url(#download)" name="Download" />
            <Area type="monotone" dataKey="upload" stroke="#22c55e" strokeWidth={2} fill="url(#upload)" name="Upload" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
