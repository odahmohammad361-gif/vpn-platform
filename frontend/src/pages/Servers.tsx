import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ServerIcon, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import api from "@/lib/api";

export default function Servers() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", host: "", api_port: 8080, port_range_start: 20000, port_range_end: 29999 });

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get("/servers").then((r) => r.data),
    refetchInterval: 15000,
  });

  const createServer = useMutation({
    mutationFn: (data: any) => api.post("/servers", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); setCreating(false); },
  });

  const deleteServer = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return new Date().getTime() - new Date(lastSeen).getTime() < 60000;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Servers</h1>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          <Plus className="w-4 h-4" /> Add Server
        </button>
      </div>

      {creating && (
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <h2 className="text-white font-semibold">New Server</h2>
          {[
            { label: "Name", key: "name", placeholder: "SG-Contabo-01" },
            { label: "Host (IP)", key: "host", placeholder: "1.2.3.4" },
          ].map(({ label, key, placeholder }) => (
            <input key={key} className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
              placeholder={placeholder}
              value={(form as any)[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          ))}
          <div className="flex gap-2">
            <button onClick={() => createServer.mutate(form)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Create</button>
            <button onClick={() => setCreating(false)}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {servers.map((s: any) => (
          <div key={s.id} className="bg-gray-900 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isOnline(s.last_seen_at) ? "bg-green-900" : "bg-gray-800"}`}>
                {isOnline(s.last_seen_at)
                  ? <Wifi className="w-5 h-5 text-green-400" />
                  : <WifiOff className="w-5 h-5 text-gray-500" />}
              </div>
              <div>
                <p className="text-white font-semibold">{s.name}</p>
                <p className="text-gray-400 text-sm font-mono">{s.host} · {s.method}</p>
                <p className="text-gray-500 text-xs">
                  Ports {s.port_range_start}–{s.port_range_end} ·
                  Last seen: {s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : "never"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${s.is_active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                {s.is_active ? "Active" : "Inactive"}
              </span>
              <button onClick={() => { if (confirm("Delete server?")) deleteServer.mutate(s.id); }}
                className="p-2 rounded bg-red-900 hover:bg-red-800 text-red-300">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
