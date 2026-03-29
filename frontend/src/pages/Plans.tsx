import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Trash2 } from "lucide-react";
import api from "@/lib/api";

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(0)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
}

const PRESETS = [
  { name: "Monthly", duration_months: 1 },
  { name: "Quarterly", duration_months: 3 },
  { name: "Half Year", duration_months: 6 },
  { name: "Annual", duration_months: 12 },
];

export default function Plans() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "Monthly", duration_months: 1, quota_gb: 100, price_rmb: 0 });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans").then((r) => r.data),
  });

  const seedPlans = useMutation({
    mutationFn: () => api.post("/plans/seed"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      const seeded = res.data.seeded as string[];
      if (seeded.length === 0) alert("Plans already exist.");
      else alert(`Seeded: ${seeded.join(", ")}`);
    },
    onError: () => alert("Failed to seed plans."),
  });

  const createPlan = useMutation({
    mutationFn: ({ quota_gb, ...rest }: any) =>
      api.post("/plans", { ...rest, monthly_quota_bytes: Math.round(quota_gb * 1e9) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: () => alert("Failed to create plan."),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: () => alert("Cannot delete a plan that is assigned to users."),
  });

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-blue-500/60 transition placeholder-gray-600 text-sm";

  const durationLabel: Record<number, string> = { 1: "1 month", 3: "3 months", 6: "6 months", 12: "12 months" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Define subscription plans with monthly quota auto-reset</p>
        </div>
        <button
          onClick={() => seedPlans.mutate()}
          disabled={seedPlans.isPending}
          className="px-4 py-2.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-xl text-sm font-medium transition disabled:opacity-50"
        >
          Seed Default Plans
        </button>
      </div>

      {/* Create form */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">New Plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {/* Preset picker */}
          <div className="flex gap-2 sm:col-span-5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setForm({ ...form, name: p.name, duration_months: p.duration_months })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  form.duration_months === p.duration_months
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                    : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <input className={inputClass} placeholder="Plan name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="number" className={inputClass} placeholder="Duration (months)" min="1"
            value={form.duration_months}
            onChange={(e) => setForm({ ...form, duration_months: Number(e.target.value) })} />
          <input type="number" className={inputClass} placeholder="Monthly quota (GB)" min="1"
            value={form.quota_gb}
            onChange={(e) => setForm({ ...form, quota_gb: Number(e.target.value) })} />
          <input type="number" className={inputClass} placeholder="Price (¥ RMB)" min="0" step="0.01"
            value={form.price_rmb}
            onChange={(e) => setForm({ ...form, price_rmb: Number(e.target.value) })} />
          <button
            onClick={() => createPlan.mutate(form)}
            disabled={createPlan.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            <PackagePlus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {/* Plans list */}
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Monthly Quota</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Price / Month</th>
              <th className="text-right px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {plans.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-600 py-12">No plans yet — click "Seed Default Plans" to add the standard 1/3/6 month plans</td></tr>
            )}
            {plans.map((p: any) => (
              <tr key={p.id} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-4 text-white font-medium">{p.name}</td>
                <td className="px-5 py-4 text-gray-300">{durationLabel[p.duration_months] ?? `${p.duration_months} months`}</td>
                <td className="px-5 py-4 text-gray-300">{fmtBytes(p.monthly_quota_bytes)} / month</td>
                <td className="px-5 py-4 text-yellow-400 font-medium">¥{Number(p.price_rmb).toFixed(0)}</td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => { if (confirm("Delete plan?")) deletePlan.mutate(p.id); }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
