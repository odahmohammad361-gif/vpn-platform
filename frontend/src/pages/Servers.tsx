import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wifi, WifiOff, Activity, Copy, Shield, ShieldOff, ExternalLink, Pencil, X, Info } from "lucide-react";
import api from "@/lib/api";

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 transition placeholder-gray-600 text-sm";

function EditModal({ server, onClose }: { server: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: server.name ?? "",
    host: server.host ?? "",
    port_range_start: server.port_range_start ?? 20000,
    port_range_end: server.port_range_end ?? 29999,
    method: server.method ?? "chacha20-ietf-poly1305",
    adguard_password: server.adguard_password ?? "",
    xui_url: server.xui_url ?? "",
    xui_username: server.xui_username ?? "",
    xui_password: server.xui_password ?? "",
    xui_inbound_id: server.xui_inbound_id ?? "",
    vless_host: server.vless_host ?? "",
    vless_port: server.vless_port ?? "",
    vless_public_key: server.vless_public_key ?? "",
    vless_short_id: server.vless_short_id ?? "",
    vless_sni: server.vless_sni ?? "",
  });

  const update = useMutation({
    mutationFn: (data: any) => api.patch(`/servers/${server.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); onClose(); },
  });

  const handleSave = () => {
    const payload: any = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v === "") payload[k] = null;
      else if (k === "port_range_start" || k === "port_range_end" || k === "xui_inbound_id" || k === "vless_port")
        payload[k] = v === "" ? null : Number(v);
      else payload[k] = v;
    });
    update.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Edit Server — {server.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Basic */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Basic</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputClass} placeholder="Host (subdomain or IP)" value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })} />
            <input className={inputClass} placeholder="Port range start" type="number" value={form.port_range_start}
              onChange={(e) => setForm({ ...form, port_range_start: Number(e.target.value) })} />
            <input className={inputClass} placeholder="Port range end" type="number" value={form.port_range_end}
              onChange={(e) => setForm({ ...form, port_range_end: Number(e.target.value) })} />
            <input className={inputClass} placeholder="SS Method" value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })} />
          </div>
        </div>

        {/* AdGuard */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">AdGuard Home</p>
          <input className={inputClass} placeholder="AdGuard password (from setup output)" value={form.adguard_password}
            onChange={(e) => setForm({ ...form, adguard_password: e.target.value })} />
        </div>

        {/* x-ui / VLESS */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">VLESS+Reality (x-ui)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputClass} placeholder="x-ui URL (e.g. https://sg..:6689/path)" value={form.xui_url}
              onChange={(e) => setForm({ ...form, xui_url: e.target.value })} />
            <input className={inputClass} placeholder="x-ui Username" value={form.xui_username}
              onChange={(e) => setForm({ ...form, xui_username: e.target.value })} />
            <input className={inputClass} placeholder="x-ui Password" value={form.xui_password}
              onChange={(e) => setForm({ ...form, xui_password: e.target.value })} />
            <input className={inputClass} placeholder="x-ui Inbound ID (e.g. 1)" type="number" value={form.xui_inbound_id}
              onChange={(e) => setForm({ ...form, xui_inbound_id: e.target.value })} />
            <input className={inputClass} placeholder="VLESS Host override (optional)" value={form.vless_host}
              onChange={(e) => setForm({ ...form, vless_host: e.target.value })} />
            <input className={inputClass} placeholder="VLESS Port (e.g. 55710)" type="number" value={form.vless_port}
              onChange={(e) => setForm({ ...form, vless_port: e.target.value })} />
            <input className={inputClass} placeholder="VLESS Public Key" value={form.vless_public_key}
              onChange={(e) => setForm({ ...form, vless_public_key: e.target.value })} />
            <input className={inputClass} placeholder="VLESS Short ID" value={form.vless_short_id}
              onChange={(e) => setForm({ ...form, vless_short_id: e.target.value })} />
            <input className={inputClass} placeholder="VLESS SNI (e.g. www.apple.com)" value={form.vless_sni}
              onChange={(e) => setForm({ ...form, vless_sni: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={update.isPending}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
            {update.isPending ? "Saving..." : "Save Changes"}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm transition">
            Cancel
          </button>
        </div>
        {update.isError && <p className="text-red-400 text-sm">Failed to save. Check the values and try again.</p>}
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-gray-500 text-xs w-32 shrink-0">{label}</span>
      <span className="text-gray-300 text-xs font-mono truncate flex-1">{value}</span>
      <button onClick={() => navigator.clipboard.writeText(value)}
        className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition">
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}

function ProfileModal({ server, onClose }: { server: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-lg space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">{server.name} — Credentials</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Agent */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Agent</p>
          <div className="bg-white/3 rounded-xl px-4 py-1">
            <CopyRow label="Server ID" value={server.id} />
            <CopyRow label="Agent Secret" value={server.agent_secret} />
            <CopyRow label="API Base" value="https://saymy-vpn.com/agent" />
          </div>
        </div>

        {/* AdGuard */}
        {server.adguard_password && (
          <div>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">AdGuard Home</p>
            <div className="bg-white/3 rounded-xl px-4 py-1">
              <CopyRow label="URL" value={`http://${server.host}:3000`} />
              <CopyRow label="Username" value="admin" />
              <CopyRow label="Password" value={server.adguard_password} />
            </div>
          </div>
        )}

        {/* x-ui / VLESS */}
        {server.xui_url && (
          <div>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">x-ui Panel (VLESS+Reality)</p>
            <div className="bg-white/3 rounded-xl px-4 py-1">
              <CopyRow label="Panel URL" value={server.xui_url} />
              <CopyRow label="Username" value={server.xui_username} />
              <CopyRow label="Password" value={server.xui_password} />
              <CopyRow label="Inbound ID" value={server.xui_inbound_id?.toString()} />
              <CopyRow label="VLESS Port" value={server.vless_port?.toString()} />
              <CopyRow label="Public Key" value={server.vless_public_key} />
              <CopyRow label="Short ID" value={server.vless_short_id} />
              <CopyRow label="SNI" value={server.vless_sni} />
              {server.vless_host && <CopyRow label="VLESS Host" value={server.vless_host} />}
            </div>
          </div>
        )}

        <button onClick={onClose}
          className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm transition">
          Close
        </button>
      </div>
    </div>
  );
}

export default function Servers() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingServer, setEditingServer] = useState<any>(null);
  const [profileServer, setProfileServer] = useState<any>(null);
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

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return Math.abs(Date.now() - new Date(lastSeen).getTime()) < 300000;
  };

  return (
    <div className="space-y-6">
      {editingServer && <EditModal server={editingServer} onClose={() => setEditingServer(null)} />}
      {profileServer && <ProfileModal server={profileServer} onClose={() => setProfileServer(null)} />}

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
            <input className={inputClass} placeholder="Name (e.g. HK-FAST-1)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputClass} placeholder="Host (e.g. hk.saymy-vpn.com)" value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })} />
            <input className={inputClass} placeholder="Port range start" type="number" value={form.port_range_start}
              onChange={(e) => setForm({ ...form, port_range_start: Number(e.target.value) })} />
            <input className={inputClass} placeholder="Port range end" type="number" value={form.port_range_end}
              onChange={(e) => setForm({ ...form, port_range_end: Number(e.target.value) })} />
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
          return (
            <div key={s.id} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl border ${online ? "bg-green-500/10 border-green-500/20" : "bg-white/5 border-white/10"}`}>
                    {online ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-gray-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold">{s.name}</p>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                        online ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-white/5 text-gray-500 border-white/10"
                      }`}>
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm font-mono mt-0.5">{s.host}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-gray-600 text-xs flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-400">
                        Shadowsocks
                      </span>
                      <span>Ports {s.port_range_start}–{s.port_range_end}</span>
                      {s.vless_port && (
                        <>
                          <span>·</span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-500/15 text-purple-400">
                            VLESS+Reality
                          </span>
                          <span>:{s.vless_port}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : "Never seen"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                    <a href={`http://${s.host}:3000`} target="_blank" rel="noopener noreferrer"
                      title="Open AdGuard Home"
                      className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => setProfileServer(s)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-gray-600 transition"
                    title="View credentials">
                    <Info className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingServer(s)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-gray-600 transition"
                    title="Edit server">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm(`Delete server ${s.name}?`)) deleteServer.mutate(s.id); }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-600 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
