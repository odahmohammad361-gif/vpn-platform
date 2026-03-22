import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function fmtBytes(b: number) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(2) + " MB";
  return (b / 1e3).toFixed(1) + " KB";
}

export default function Stats() {
  const { data: traffic = [] } = useQuery({
    queryKey: ["stats-traffic"],
    queryFn: () => api.get("/stats/traffic?days=30").then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: overview } = useQuery({
    queryKey: ["stats-overview"],
    queryFn: () => api.get("/stats/overview").then((r) => r.data),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Statistics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: overview?.total_users ?? 0 },
          { label: "Active Users", value: overview?.active_users ?? 0 },
          { label: "Servers", value: overview?.total_servers ?? 0 },
          { label: "Traffic Today", value: fmtBytes(overview?.traffic_today_bytes ?? 0) },
        ].map((s) => (
          <div key={s.label} className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">{s.label}</div>
            <div className="text-white text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">Traffic (30 days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={traffic}>
            <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tickFormatter={(v) => fmtBytes(v)} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => fmtBytes(v)} />
            <Bar dataKey="bytes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
