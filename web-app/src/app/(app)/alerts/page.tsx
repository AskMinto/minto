"use client";

import { useState } from "react";
import { useAlerts, CreateAlertPayload } from "@/hooks/use-alerts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";

const ALERT_TYPE_LABELS: Record<string, string> = {
  above: "Price goes above",
  below: "Price drops below",
  pct_change_up: "Price rises by",
  pct_change_down: "Price falls by",
};

const ALERT_TYPE_SUFFIX: Record<string, string> = {
  above: "",
  below: "",
  pct_change_up: "%",
  pct_change_down: "%",
};

const INSTRUMENT_TYPES = [
  { value: "equity", label: "Stock (Equity)" },
  { value: "mf", label: "Mutual Fund" },
] as const;

type InstrumentType = "equity" | "mf";

interface CreateAlertFormState {
  display_name: string;
  instrument_type: InstrumentType;
  symbol: string;
  exchange: string;
  scheme_code: string;
  alert_type: "above" | "below" | "pct_change_up" | "pct_change_down";
  target_value: string;
}

const DEFAULT_FORM: CreateAlertFormState = {
  display_name: "",
  instrument_type: "equity",
  symbol: "",
  exchange: "NSE",
  scheme_code: "",
  alert_type: "below",
  target_value: "",
};

function CreateAlertModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (payload: CreateAlertPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateAlertFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (patch: Partial<CreateAlertFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.display_name.trim()) {
      setFormError("Enter a display name for the instrument.");
      return;
    }
    if (!form.target_value || isNaN(Number(form.target_value))) {
      setFormError("Enter a valid target value.");
      return;
    }
    if (form.instrument_type === "equity" && !form.symbol.trim()) {
      setFormError("Enter a stock ticker symbol (e.g. SBIN, INFY).");
      return;
    }
    if (form.instrument_type === "mf" && !form.scheme_code.trim()) {
      setFormError("Enter the MFAPI scheme code.");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateAlertPayload = {
        display_name: form.display_name.trim(),
        alert_type: form.alert_type,
        target_value: Number(form.target_value),
      };
      if (form.instrument_type === "equity") {
        payload.symbol = form.symbol.trim().toUpperCase();
        payload.exchange = form.exchange;
      } else {
        payload.scheme_code = parseInt(form.scheme_code.trim(), 10);
      }
      await onSave(payload);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create alert.");
    } finally {
      setSaving(false);
    }
  };

  const isPct = form.alert_type === "pct_change_up" || form.alert_type === "pct_change_down";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-minto-text-muted hover:text-minto-text transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-minto-accent/10 flex items-center justify-center">
            <Bell size={18} className="text-minto-accent" />
          </div>
          <h2 className="text-lg font-bold text-minto-text">New Price Alert</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Instrument type toggle */}
          <div>
            <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
              Instrument type
            </label>
            <div className="flex gap-2">
              {INSTRUMENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set({ instrument_type: t.value })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    form.instrument_type === t.value
                      ? "bg-minto-accent text-white border-minto-accent"
                      : "bg-white/40 text-minto-text-secondary border-white/30 hover:bg-white/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
              Instrument name
            </label>
            <input
              type="text"
              placeholder={
                form.instrument_type === "equity"
                  ? "e.g. SBI Bank, Infosys"
                  : "e.g. Parag Parikh Flexi Cap"
              }
              value={form.display_name}
              onChange={(e) => set({ display_name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
            />
          </div>

          {/* Equity fields */}
          {form.instrument_type === "equity" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
                  Ticker symbol
                </label>
                <input
                  type="text"
                  placeholder="e.g. SBIN"
                  value={form.symbol}
                  onChange={(e) => set({ symbol: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40 uppercase"
                />
              </div>
              <div className="w-28">
                <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
                  Exchange
                </label>
                <select
                  value={form.exchange}
                  onChange={(e) => set({ exchange: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>
            </div>
          )}

          {/* MF scheme code */}
          {form.instrument_type === "mf" && (
            <div>
              <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
                MFAPI scheme code
              </label>
              <input
                type="number"
                placeholder="e.g. 125497"
                value={form.scheme_code}
                onChange={(e) => set({ scheme_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
              />
              <p className="text-[11px] text-minto-text-muted mt-1">
                Find the code at{" "}
                <a
                  href="https://api.mfapi.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-minto-accent underline"
                >
                  api.mfapi.in
                </a>
              </p>
            </div>
          )}

          {/* Alert type */}
          <div>
            <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
              Alert condition
            </label>
            <select
              value={form.alert_type}
              onChange={(e) =>
                set({
                  alert_type: e.target.value as CreateAlertFormState["alert_type"],
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
            >
              {Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Target value */}
          <div>
            <label className="text-xs font-medium text-minto-text-muted block mb-1.5">
              Target {isPct ? "percentage (%)" : "price (₹)"}
            </label>
            <div className="relative">
              {!isPct && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-minto-text-muted text-sm">
                  ₹
                </span>
              )}
              <input
                type="number"
                min="0"
                step="any"
                placeholder={isPct ? "e.g. 3" : "e.g. 1800"}
                value={form.target_value}
                onChange={(e) => set({ target_value: e.target.value })}
                className={`w-full py-2 rounded-lg bg-white/50 border border-white/30 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40 ${
                  isPct ? "px-3" : "pl-7 pr-3"
                }`}
              />
              {isPct && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-minto-text-muted text-sm">
                  %
                </span>
              )}
            </div>
          </div>

          {formError && (
            <p className="text-xs text-minto-negative bg-minto-negative/5 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner size={14} /> : null}
              {saving ? "Creating…" : "Create Alert"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function alertConditionLabel(
  alertType: string,
  targetValue: number,
  isPct: boolean
): string {
  const prefix = ALERT_TYPE_LABELS[alertType] ?? alertType;
  const suffix = ALERT_TYPE_SUFFIX[alertType] ?? "";
  if (isPct) {
    return `${prefix} ${targetValue}${suffix} in a day`;
  }
  return `${prefix} ₹${targetValue.toLocaleString("en-IN")}`;
}

export default function AlertsPage() {
  const { alerts, loading, error, createAlert, cancelAlert } = useAlerts();
  const [showCreate, setShowCreate] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    if (!confirm("Remove this alert?")) return;
    setCancelling(id);
    try {
      await cancelAlert(id);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-minto-text">Price Alerts</h1>
            <p className="text-sm text-minto-text-muted mt-0.5">
              Get notified in chat when an instrument hits your target.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} /> New Alert
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={28} />
          </div>
        ) : error ? (
          <Card>
            <p className="text-minto-negative text-sm text-center py-6">{error}</p>
          </Card>
        ) : alerts.length === 0 ? (
          <Card className="text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-minto-accent/10 flex items-center justify-center mx-auto mb-4">
              <BellOff size={22} className="text-minto-accent/60" />
            </div>
            <p className="font-medium text-minto-text mb-1">No active alerts</p>
            <p className="text-sm text-minto-text-muted mb-5">
              Create an alert and Minto will notify you in chat when the price is hit.
            </p>
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus size={14} /> Create your first alert
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const isPct =
                alert.alert_type === "pct_change_up" ||
                alert.alert_type === "pct_change_down";
              const conditionLabel = alertConditionLabel(
                alert.alert_type,
                alert.target_value,
                isPct
              );
              const isRising =
                alert.alert_type === "above" || alert.alert_type === "pct_change_up";

              return (
                <Card key={alert.id} className="flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isRising ? "bg-minto-positive/10" : "bg-minto-negative/10"
                    }`}
                  >
                    <Bell
                      size={18}
                      className={
                        isRising ? "text-minto-positive" : "text-minto-negative"
                      }
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-minto-text truncate">
                      {alert.display_name}
                    </p>
                    <p className="text-sm text-minto-text-muted mt-0.5">
                      {conditionLabel}
                    </p>
                    {alert.symbol && (
                      <p className="text-xs text-minto-text-muted/70 mt-0.5">
                        {alert.symbol} · {alert.exchange}
                      </p>
                    )}
                    {alert.scheme_code && (
                      <p className="text-xs text-minto-text-muted/70 mt-0.5">
                        Scheme #{alert.scheme_code}
                      </p>
                    )}
                  </div>

                  {/* Target badge */}
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded-full ${
                        isRising
                          ? "bg-minto-positive/10 text-minto-positive"
                          : "bg-minto-negative/10 text-minto-negative"
                      }`}
                    >
                      {isPct
                        ? `${isRising ? "+" : "-"}${alert.target_value}%`
                        : `₹${alert.target_value.toLocaleString("en-IN")}`}
                    </span>
                    <p className="text-[11px] text-minto-text-muted mt-1">
                      {new Date(alert.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleCancel(alert.id)}
                    disabled={cancelling === alert.id}
                    className="text-minto-text-muted hover:text-minto-negative transition-colors p-1 shrink-0"
                    title="Remove alert"
                  >
                    {cancelling === alert.id ? <Spinner size={14} /> : <Trash2 size={14} />}
                  </button>
                </Card>
              );
            })}
          </div>
        )}

        {showCreate && (
          <CreateAlertModal
            onClose={() => setShowCreate(false)}
            onSave={createAlert}
          />
        )}
      </div>
    </div>
  );
}
