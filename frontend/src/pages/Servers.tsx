import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wifi, WifiOff, Activity, Copy, Shield, ShieldOff, ExternalLink, Key } from "lucide-react";
import api from "@/lib/api";

export default function Servers() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingReality, setEditingReality] = useState<string | null>(null);
  const [realityForm, setRealityForm] = useState({ reality_public_key: "", reality_short_id: "" });
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

  const toggleAdguard = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/servers/${id}/adguard?enabled=${enabled}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });

  const saveReality = useMutation({
    mutationFn: ({ id, ...data }: { id: string; reality_public_key: string; reality_short_id: string }) =>
      api.patch(`/servers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); setEditingReality(null); },
  });

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return new Date().getTime() - new Date(lastSeen).getTime() < 60000;
  };

  const isVless = (s: any) => s.protocol === "vless";

  const inputClass = "w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 transition placeholder-gray-600 text-sm";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Servers</h1>
          <p className="text-gray-500 text-sm mt-1">{servers.length} server{servers.length !== 1 ? "s" : ""} configured</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all duration-200">
          <Plus className="w-4 h-4" /> Add Server
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">New Server</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Name (e.g. EU-01)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputClass} placeholder="Host IP (e.g. 31.220.80.56)" value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createServer.mutate(form)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition">
              Create
            </button>
            <button onClick={() => setCreating(false)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Server cards */}
      <div className="grid gap-4">
        {servers.length === 0 && !creating && (
          <div className="glass rounded-2xl p-12 text-center text-gray-600">
            No servers yet — add one above
          </div>
        )}
        {servers.map((s: any) => {
          const online = isOnline(s.last_seen_at);
          const vless = isVless(s);
          const hasReality = s.reality_public_key && s.reality_short_id;
          return (
            <div key={s.id} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Status icon */}
                  <div className={`p-3 rounded-xl border ${online ? "bg-green-500/10 border-green-500/20" : "bg-white/5 border-white/10"}`}>
                    {online
                      ? <Wifi className="w-5 h-5 text-green-400" />
                      : <WifiOff className="w-5 h-5 text-gray-600" />}
                  </div>

                  {/* Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold">{s.name}</p>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                        online
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-white/5 text-gray-500 border-white/10"
                      }`}>
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm font-mono mt-0.5">{s.host}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-gray-600 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                        vless ? "bg-purple-500/15 text-purple-400" : "bg-blue-500/15 text-blue-400"
                      }`}>
                        {vless ? "VLESS+Reality" : "Shadowsocks"}
                      </span>
                      <span>·</span>
                      {vless
                        ? <span className={hasReality ? "text-green-500" : "text-yellow-500"}>
                            {hasReality ? "Keys configured" : "Keys missing"}
                          </span>
                        : <span>Ports {s.port_range_start}–{s.port_range_end}</span>
                      }
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : "Never seen"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {vless && (
                    <button
                      title="Set Reality keys"
                      onClick={() => {
                        setEditingReality(s.id);
                        setRealityForm({ reality_public_key: s.reality_public_key || "", reality_short_id: s.reality_short_id || "" });
                      }}
                      className={`p-2 rounded-xl border transition ${
                        hasReality
                          ? "bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20"
                          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20"
                      }`}
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    title={s.adguard_enabled ? "AdGuard ON — click to disable" : "AdGuard OFF — click to enable"}
                    onClick={() => toggleAdguard.mutate({ id: s.id, enabled: !s.adguard_enabled })}
                    className={`p-2 rounded-xl border transition ${
                      s.adguard_enabled
                        ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                        : "bg-white/5 border-white/10 text-gray-600 hover:bg-green-500/10 hover:border-green-500/20 hover:text-green-400"
                    }`}
                  >
                    {s.adguard_enabled ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                  </button>
                  {s.adguard_enabled && (
                    <a
                      href={`http://${s.host}:3000`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open AdGuard Home"
                      className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => { if (confirm(`Delete server ${s.name}?`)) deleteServer.mutate(s.id); }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-600 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Reality key editor */}
              {editingReality === s.id && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                  <p className="text-purple-400 text-xs font-semibold">Reality Keys — from vless-setup.sh output</p>
                  <input
                    className={inputClass}
                    placeholder="Reality Public Key"
                    value={realityForm.reality_public_key}
                    onChange={(e) => setRealityForm({ ...realityForm, reality_public_key: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    placeholder="Reality Short ID"
                    value={realityForm.reality_short_id}
                    onChange={(e) => setRealityForm({ ...realityForm, reality_short_id: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReality.mutate({ id: s.id, ...realityForm })}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingReality(null)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* IDs for agent install */}
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-600 text-xs mb-1">Server ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-500 font-mono text-xs break-all">{s.id}</p>
                    <button onClick={() => navigator.clipboard.writeText(s.id)}
                      className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-gray-600 text-xs mb-1">Agent Secret</p>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-500 font-mono text-xs break-all">{s.agent_secret}</p>
                    <button onClick={() => navigator.clipboard.writeText(s.agent_secret)}
                      className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {vless && hasReality && (
                  <>
                    <div>
                      <p className="text-gray-600 text-xs mb-1">Reality Public Key</p>
                      <div className="flex items-center gap-2">
                        <p className="text-gray-500 font-mono text-xs break-all">{s.reality_public_key}</p>
                        <button onClick={() => navigator.clipboard.writeText(s.reality_public_key)}
                          className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-600 text-xs mb-1">Reality Short ID</p>
                      <div className="flex items-center gap-2">
                        <p className="text-gray-500 font-mono text-xs break-all">{s.reality_short_id}</p>
                        <button onClick={() => navigator.clipboard.writeText(s.reality_short_id)}
                          className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
