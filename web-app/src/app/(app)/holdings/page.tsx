"use client";

import { useState } from "react";
import { useHoldings } from "@/hooks/use-holdings";
import { AddHoldingModal } from "@/components/holdings/add-holding-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency, formatPct } from "@/lib/format";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function HoldingsPage() {
  const { holdings, loading, addHolding, deleteHolding } = useHoldings();
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this holding?")) return;
    setDeleting(id);
    try {
      await deleteHolding(id);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-minto-text">Holdings</h1>
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus size={14} /> Add Holding
          </Button>
        </div>

        {holdings.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-minto-text-muted mb-4">No holdings yet.</p>
            <Button onClick={() => setShowAdd(true)} size="sm">
              <Plus size={14} /> Add your first holding
            </Button>
          </Card>
        ) : (
          /* Desktop table */
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left px-5 py-3 font-medium text-minto-text-muted text-xs">Name</th>
                  <th className="text-left px-3 py-3 font-medium text-minto-text-muted text-xs">Type</th>
                  <th className="text-right px-3 py-3 font-medium text-minto-text-muted text-xs">Qty</th>
                  <th className="text-right px-3 py-3 font-medium text-minto-text-muted text-xs">Avg Cost</th>
                  <th className="text-right px-3 py-3 font-medium text-minto-text-muted text-xs">Price</th>
                  <th className="text-right px-3 py-3 font-medium text-minto-text-muted text-xs">Value</th>
                  <th className="text-right px-3 py-3 font-medium text-minto-text-muted text-xs">P&L</th>
                  <th className="text-right px-5 py-3 font-medium text-minto-text-muted text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const isMF = !!h.scheme_code;
                  const pnlColor = (h.pnl_pct || 0) >= 0 ? "text-minto-positive" : "text-minto-negative";
                  return (
                    <tr key={h.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-colors">
                      <td className="px-5 py-3 font-medium text-minto-text max-w-[200px] truncate">
                        {h.symbol || h.scheme_name || h.isin || "Holding"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={isMF ? "mf" : "equity"}>{isMF ? "MF" : "Equity"}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right text-minto-text">{h.qty}</td>
                      <td className="px-3 py-3 text-right text-minto-text-muted">
                        {h.avg_cost ? formatCurrency(h.avg_cost) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-minto-text">
                        {h.current_price ? formatCurrency(h.current_price) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-minto-text">
                        {h.value ? formatCurrency(h.value) : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-medium ${pnlColor}`}>
                        {formatPct(h.pnl_pct || 0)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(h.id)}
                          disabled={deleting === h.id}
                          className="text-minto-text-muted hover:text-minto-negative transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <AddHoldingModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onSave={addHolding}
        />
      </div>
    </div>
  );
}
