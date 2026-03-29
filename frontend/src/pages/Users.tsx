import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Ban, CheckCircle, RefreshCw, Copy, Check, ServerIcon, X, Package, Link, PlusCircle } from "lucide-react";
import api from "@/lib/api";

function formatBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  if (quota === 0) return <span className="text-gray-500 text-xs">Unlimited ({formatBytes(used)} used)</span>;
  const pct = Math.min(100, (used / quota) * 100);
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-orange-500" : "bg-blue-500";
  return (
    <div className="space-y-1 min-w-[80px]">
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-gray-500 text-xs">{formatBytes(used)} / {formatBytes(quota)}</p>
    </div>
  );
}

function PlanModal({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans").then((r) => r.data),
  });

  const assign = useMutation({
    mutationFn: (planId: string) =>
      api.post(`/users/${user.id}/assign-plan?plan_id=${planId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
    onError: () => alert("Failed to assign plan."),
  });

  const remove = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/remove-plan`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
  });

  function fmtBytes(b: number) {
    if (b >= 1e9) return `${(b / 1e9).toFixed(0)} GB`;
    return `${b} B`;
  }

  const durationLabel: Record<number, string> = { 1: "1 month", 3: "3 months", 6: "6 months", 12: "12 months" };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold">Assign Plan</h2>
            <p className="text-gray-500 text-sm mt-0.5">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {plans.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
              <div>
                <p className="text-white text-sm font-medium">{p.name}</p>
                <p className="text-gray-500 text-xs">{durationLabel[p.duration_months] ?? `${p.duration_months} months`} · {fmtBytes(p.monthly_quota_bytes)}/mo · <span className="text-yellow-400">¥{Number(p.price_rmb).toFixed(0)}/mo</span></p>
              </div>
              <button
                onClick={() => assign.mutate(p.id)}
                disabled={user.plan_id === p.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  user.plan_id === p.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-default"
                    : "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                }`}
              >
                {user.plan_id === p.id ? "Active" : "Assign"}
              </button>
            </div>
          ))}
          {plans.length === 0 && <p className="text-gray-600 text-sm text-center py-4">No plans yet — create one in Plans page</p>}
        </div>
        {user.plan_id && (
          <button
            onClick={() => remove.mutate()}
            className="mt-4 w-full px-4 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition"
          >
            Remove Plan
          </button>
        )}
      </div>
    </div>
  );
}

function AssignModal({ user, servers, onClose }: { user: any; servers: any[]; onClose: () => void }) {
  const qc = useQueryClient();

  const assign = useMutation({
    mutationFn: (serverId: string) => api.post(`/users/${user.id}/servers/${serverId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-servers", user.id] }),
  });

  const remove = useMutation({
    mutationFn: (serverId: string) => api.delete(`/users/${user.id}/servers/${serverId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-servers", user.id] }),
  });

  const { data: userServers = [] } = useQuery({
    queryKey: ["user-servers", user.id],
    queryFn: () => api.get(`/users/${user.id}/servers`).then((r) => r.data),
  });

  const assignedIds = new Set(userServers.map((us: any) => us.server_id));

  const unassignedServers = servers.filter((s: any) => !assignedIds.has(s.id));
  const assignAll = async () => {
    for (const s of unassignedServers) {
      await api.post(`/users/${user.id}/servers/${s.id}`).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ["user-servers", user.id] });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold">Assign Servers</h2>
            <p className="text-gray-500 text-sm mt-0.5">{user.username}</p>
          </div>
          <div className="flex items-center gap-2">
            {unassignedServers.length > 0 && (
              <button
                onClick={assignAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition"
              >
                Assign All
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-500 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {servers.map((s: any) => {
            const assigned = assignedIds.has(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div>
                  <p className="text-white text-sm font-medium">{s.name}</p>
                  <p className="text-gray-500 text-xs font-mono">{s.host}</p>
                </div>
                <button
                  onClick={() => assigned ? remove.mutate(s.id) : assign.mutate(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    assigned
                      ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                      : "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                  }`}
                >
                  {assigned ? "Remove" : "Assign"}
                </button>
              </div>
            );
          })}
          {servers.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-4">No servers configured yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SubModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { data: urls } = useQuery({
    queryKey: ["sub-urls", user.id],
    queryFn: () => api.get(`/users/${user.id}/subscription`).then((r) => r.data),
  });

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const rows: { key: string; label: string; note?: string }[] = [
    { key: "shadowrocket", label: "Shadowrocket" },
    { key: "clash", label: "Clash" },
    { key: "v2rayng", label: "v2rayNG" },
    { key: "surge", label: "Shadowrocket + AdGuard DNS", note: "Sets DNS to VPN server — routes through AdGuard Home" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold">Subscription URLs</h2>
            <p className="text-gray-500 text-sm mt-0.5">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          {rows.map(({ key, label, note }) => (
            <div key={key} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-300 text-xs font-semibold uppercase tracking-wide">{label}</span>
                <button
                  onClick={() => urls?.[key] && copy(key, urls[key])}
                  disabled={!urls}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-gray-400 text-xs transition"
                >
                  {copied === key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copied === key ? "Copied" : "Copy"}
                </button>
              </div>
              {urls?.[key] && (
                <p className="text-gray-600 text-xs font-mono mt-1.5 truncate">{urls[key]}</p>
              )}
              {note && <p className="text-blue-400/70 text-xs mt-1">{note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExtendQuotaModal({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [extraGb, setExtraGb] = useState(50);

  const extend = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/extend-quota?extra_gb=${extraGb}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
    onError: () => alert("Failed to extend quota."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold">Extend Quota</h2>
            <p className="text-gray-500 text-sm mt-0.5">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Current quota: <span className="text-white font-medium">{user.quota_bytes === 0 ? "Unlimited" : formatBytes(user.quota_bytes)}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Extra GB to add</label>
            <input
              type="number"
              min="1"
              step="1"
              value={extraGb}
              onChange={(e) => setExtraGb(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 transition text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            {[50, 100, 200, 500].map(gb => (
              <button
                key={gb}
                onClick={() => setExtraGb(gb)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${
                  extraGb === gb
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                    : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                }`}
              >
                +{gb}GB
              </button>
            ))}
          </div>
          <button
            onClick={() => extend.mutate()}
            disabled={extend.isPending || extraGb <= 0}
            className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            Add {extraGb} GB
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const [assigningUser, setAssigningUser] = useState<any>(null);
  const [planUser, setPlanUser] = useState<any>(null);
  const [subUser, setSubUser] = useState<any>(null);
  const [extendUser, setExtendUser] = useState<any>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get("/servers").then((r) => r.data),
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, active }: any) =>
      active ? api.post(`/users/${id}/disable`) : api.post(`/users/${id}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: () => alert("Failed to delete user. Please try again."),
  });

  const resetQuota = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reset-quota`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const confirmPayment = useMutation({
    mutationFn: (id: string) => api.post(`/signup/confirm/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: () => alert("Failed to confirm payment."),
  });

  return (
    <div className="space-y-6">
      {planUser && <PlanModal user={planUser} onClose={() => setPlanUser(null)} />}
      {subUser && <SubModal user={subUser} onClose={() => setSubUser(null)} />}
      {extendUser && <ExtendQuotaModal user={extendUser} onClose={() => setExtendUser(null)} />}
      {assigningUser && (
        <AssignModal user={assigningUser} servers={servers} onClose={() => setAssigningUser(null)} />
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-500 text-sm mt-1">{users.length} total users — new users sign up via the portal</p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Usage</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Plan / Expires</th>
              <th className="text-right px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={5} className="text-center text-gray-600 py-12">Loading...</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-600 py-12">No users yet</td></tr>
            )}
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-white font-mono font-medium">{u.username}</p>
                  {u.email && <p className="text-gray-600 text-xs mt-0.5">{u.email}</p>}
                </td>
                <td className="px-5 py-4">
                  <div className="space-y-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      u.is_active
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                      {u.is_active ? "Active" : u.disabled_reason ?? "Disabled"}
                    </span>
                    {u.payment_status === "pending_payment" && (
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          💰 {u.payment_ref} USDT
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <QuotaBar used={u.bytes_used} quota={u.quota_bytes} />
                </td>
                <td className="px-5 py-4">
                  {u.expires_at
                    ? <div>
                        <p className="text-gray-300 text-sm">{new Date(u.expires_at).toLocaleDateString()}</p>
                        {u.next_reset_at && <p className="text-gray-600 text-xs mt-0.5">resets {new Date(u.next_reset_at).toLocaleDateString()}</p>}
                      </div>
                    : <span className="text-gray-600 text-sm">No plan</span>}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1.5 justify-end">
                    <button title="Assign plan" onClick={() => setPlanUser(u)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-gray-500 transition">
                      <Package className="w-3.5 h-3.5" />
                    </button>
                    <button title="Assign servers" onClick={() => setAssigningUser(u)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-gray-500 transition">
                      <ServerIcon className="w-3.5 h-3.5" />
                    </button>
                    <button title="Subscription URLs" onClick={() => setSubUser(u)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-gray-500 transition">
                      <Link className="w-3.5 h-3.5" />
                    </button>
                    <button title={u.is_active ? "Disable" : "Enable"}
                      onClick={() => toggleUser.mutate({ id: u.id, active: u.is_active })}
                      className="p-2 rounded-lg bg-white/5 hover:bg-orange-500/20 hover:text-orange-400 text-gray-500 transition">
                      {u.is_active ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    </button>
                    {u.payment_status === "pending_payment" && (
                      <button title="Confirm payment manually" onClick={() => { if (confirm(`Confirm payment for ${u.username}?`)) confirmPayment.mutate(u.id); }}
                        className="p-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 transition">
                        💰
                      </button>
                    )}
                    <button title="Extend quota" onClick={() => setExtendUser(u)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-green-500/20 hover:text-green-400 text-gray-500 transition">
                      <PlusCircle className="w-3.5 h-3.5" />
                    </button>
                    <button title="Reset quota" onClick={() => resetQuota.mutate(u.id)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-gray-500 transition">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button title="Delete" onClick={() => { if (confirm("Delete user?")) deleteUser.mutate(u.id); }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
