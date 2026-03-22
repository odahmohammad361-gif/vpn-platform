import { useQuery } from "@tanstack/react-query";
import { Users, Server, TrendingUp, Database } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import api from "@/lib/api";

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white text-2xl font-bold">{value ?? "..."}</p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${bytes} B`;
}

export default function Dashboard() {
  const { data: overview } = useQuery({
    queryKey: ["stats-overview"],
    queryFn: () => api.get("/stats/overview").then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: traffic } = useQuery({
    queryKey: ["stats-traffic"],
    queryFn: () => api.get("/stats/traffic?days=14").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={overview?.total_users} icon={Users} color="bg-blue-600" />
        <StatCard label="Active Users" value={overview?.active_users} icon={TrendingUp} color="bg-green-600" />
        <StatCard label="Servers" value={overview?.total_servers} icon={Server} color="bg-purple-600" />
        <StatCard label="Traffic Today" value={formatBytes(overview?.traffic_today_bytes ?? 0)} icon={Database} color="bg-orange-600" />
      </div>

      <div className="bg-gray-900 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Traffic (14 days)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={traffic ?? []}>
            <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 11 }} />
            <YAxis stroke="#6b7280" tickFormatter={(v) => formatBytes(v)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatBytes(v)} />
            <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="#1d4ed8" fillOpacity={0.3} name="Download" />
            <Area type="monotone" dataKey="upload" stroke="#22c55e" fill="#15803d" fillOpacity={0.3} name="Upload" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
