import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import api from "@/lib/api";

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(0)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
}

export default function Plans() {
  const qc = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans").then((r) => r.data),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: () => alert("Cannot delete a plan that is assigned to users."),
  });

  const durationLabel: Record<number, string> = { 1: "1 month", 3: "3 months", 6: "6 months", 12: "12 months" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Plans</h1>
        <p className="text-gray-500 text-sm mt-1">Subscription plans — users sign up via the portal</p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Monthly Quota</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Price RMB</th>
              <th className="text-left px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Price USDT</th>
              <th className="text-right px-5 py-3.5 text-gray-500 text-xs font-semibold uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {plans.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-600 py-12">No plans configured</td></tr>
            )}
            {plans.map((p: any) => (
              <tr key={p.id} className="hover:bg-white/3 transition-colors">
                <td className="px-5 py-4 text-white font-medium">{p.name}</td>
                <td className="px-5 py-4 text-gray-300">{durationLabel[p.duration_months] ?? `${p.duration_months} months`}</td>
                <td className="px-5 py-4 text-gray-300">{fmtBytes(p.monthly_quota_bytes)} / month</td>
                <td className="px-5 py-4 text-yellow-400 font-medium">¥{Number(p.price_rmb).toFixed(0)}</td>
                <td className="px-5 py-4 text-green-400 font-medium">${Number(p.price_usdt).toFixed(0)}</td>
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
