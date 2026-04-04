import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Database, TrendingUp, Server } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import api from "@/lib/api";

function fmtBytes(b: number) {
  if (b >= 1e12) return (b / 1e12).toFixed(2) + " TB";
  if (b >= 1e9)  return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6)  return (b / 1e6).toFixed(1) + " MB";
  if (b >= 1e3)  return (b / 1e3).toFixed(1) + " KB";
  return b + " B";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs space-y-1">
      <p className="text-gray-400">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtBytes(p.value)}</p>
      ))}
    </div>
  );
};

export default function Stats() {
  const [serverPeriod, setServerPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const { data: overview } = useQuery({
    queryKey: ["stats-overview"],
    queryFn: () => api.get("/stats/overview").then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: traffic = [] } = useQuery({
    queryKey: ["stats-traffic-30"],
    queryFn: () => api.get("/stats/traffic?days=30").then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: topUsers = [] } = useQuery({
    queryKey: ["stats-top-users"],
    queryFn: () => api.get("/stats/top-users?limit=10").then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: serverStats = [] } = useQuery({
    queryKey: ["stats-servers"],
    queryFn: () => api.get("/stats/servers").then((r) => r.data),
    refetchInterval: 30000,
  });

  const totalTraffic = traffic.reduce((sum: number, d: any) => sum + (d.upload || 0) + (d.download || 0), 0);
  const maxUserBytes = topUsers.length > 0 ? topUsers[0].bytes_used : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <p className="text-gray-500 text-sm mt-1">Platform usage overview — last 30 days</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users",   value: overview?.total_users ?? 0,                        icon: Users,      color: "bg-blue-600" },
          { label: "Active Users",  value: overview?.active_users ?? 0,                       icon: TrendingUp, color: "bg-green-600" },
          { label: "Servers",       value: overview?.total_servers ?? 0,                      icon: Server,     color: "bg-purple-600" },
          { label: "Traffic Today", value: fmtBytes(overview?.traffic_today_bytes ?? 0),      icon: Database,   color: "bg-orange-600" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.color} shrink-0`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{s.label}</p>
              <p className="text-white text-2xl font-bold mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Traffic chart */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold">Traffic — Last 30 Days</h2>
            <p className="text-gray-500 text-xs mt-0.5">Total: {fmtBytes(totalTraffic)}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Download</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Upload</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={traffic} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="#374151" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
            <YAxis stroke="#374151" tickFormatter={fmtBytes} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="download" name="Download" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="upload"   name="Upload"   fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Server traffic */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Server Traffic Report</h2>
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button key={p} onClick={() => setServerPeriod(p)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  serverPeriod === p
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {serverStats.map((s: any) => {
            const isOnline = s.last_seen_at && Math.abs(Date.now() - new Date(s.last_seen_at).getTime()) < 300000;
            const trafficValue = serverPeriod === "daily"
              ? s.traffic_today_bytes
              : serverPeriod === "weekly"
              ? s.traffic_7d_bytes
              : s.traffic_30d_bytes;
            const periodLabel = serverPeriod === "daily" ? "today" : serverPeriod === "weekly" ? "7d" : "30d";
            return (
              <div key={s.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-400" : "bg-gray-600"}`} />
                  <div>
                    <p className="text-white text-sm font-medium">{s.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">SS</span>
                      {s.vless_port && <span className="text-xs text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">VLESS</span>}
                      <span className="text-gray-600 text-xs">{s.user_count} users</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-medium">{fmtBytes(trafficValue)}</p>
                  <p className="text-gray-500 text-xs">{periodLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top users */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-5">Top Users by Usage</h2>
        {topUsers.length === 0 ? (
          <p className="text-gray-600 text-sm">No data yet</p>
        ) : (
          <div className="space-y-3">
            {topUsers.map((u: any, i: number) => {
              const pct = Math.min(100, (u.bytes_used / maxUserBytes) * 100);
              return (
                <div key={u.username}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 text-xs w-5 text-right">{i + 1}.</span>
                      <span className="text-white text-sm font-medium">{u.username}</span>
                    </div>
                    <span className="text-gray-400 text-xs">{fmtBytes(u.bytes_used)}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
