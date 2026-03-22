import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Ban, CheckCircle, RefreshCw, Copy } from "lucide-react";
import api from "@/lib/api";

function formatBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${b} B`;
}

export default function Users() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", quota_bytes: 0 });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
    refetchInterval: 15000,
  });

  const createUser = useMutation({
    mutationFn: (data: any) => api.post("/users", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setCreating(false); },
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, active }: any) =>
      active ? api.post(`/users/${id}/disable`) : api.post(`/users/${id}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const resetQuota = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reset-quota`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const copySubUrl = (token: string) => {
    const url = `${window.location.origin}/sub/${token}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {creating && (
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <h2 className="text-white font-semibold">New User</h2>
          <input className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
            placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
            placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="number" className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
            placeholder="Quota bytes (0 = unlimited)" value={form.quota_bytes}
            onChange={(e) => setForm({ ...form, quota_bytes: Number(e.target.value) })} />
          <div className="flex gap-2">
            <button onClick={() => createUser.mutate(form)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Create</button>
            <button onClick={() => setCreating(false)}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="text-left px-4 py-3">Username</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Usage</th>
              <th className="text-left px-4 py-3">Quota</th>
              <th className="text-left px-4 py-3">Expires</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {isLoading && (
              <tr><td colSpan={6} className="text-center text-gray-500 py-8">Loading...</td></tr>
            )}
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-800 transition">
                <td className="px-4 py-3 text-white font-mono">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                    {u.is_active ? "Active" : u.disabled_reason ?? "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{formatBytes(u.bytes_used)}</td>
                <td className="px-4 py-3 text-gray-300">{u.quota_bytes === 0 ? "∞" : formatBytes(u.quota_bytes)}</td>
                <td className="px-4 py-3 text-gray-300">{u.expires_at ? new Date(u.expires_at).toLocaleDateString() : "Never"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button title="Copy sub URL" onClick={() => copySubUrl(u.subscription_token)}
                      className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button title={u.is_active ? "Disable" : "Enable"} onClick={() => toggleUser.mutate({ id: u.id, active: u.is_active })}
                      className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
                      {u.is_active ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    </button>
                    <button title="Reset quota" onClick={() => resetQuota.mutate(u.id)}
                      className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button title="Delete" onClick={() => { if (confirm("Delete user?")) deleteUser.mutate(u.id); }}
                      className="p-1.5 rounded bg-red-900 hover:bg-red-800 text-red-300">
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
