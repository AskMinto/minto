"use client";

import { useState, useRef } from "react";
import { X, Upload, Lock, FileText, ChevronDown } from "lucide-react";

interface Props {
  onUpload: (file: File, docType: string, brokerName?: string, password?: string) => Promise<{ status: string; message?: string }>;
  onClose: () => void;
  uploading: boolean;
  error: string | null;
}

const DOC_TYPES = [
  {
    value: "cas",
    label: "MFCentral CAS PDF",
    hint: "Consolidated Account Statement from mfcentral.com",
    needsBroker: false,
    passwordCommon: true,
  },
  {
    value: "broker_pl",
    label: "Broker Tax P&L",
    hint: "CSV, Excel or PDF from your broker's Tax P&L / Capital Gains report",
    needsBroker: true,
    passwordCommon: false,
  },
  {
    value: "broker_holdings",
    label: "Broker Holdings",
    hint: "CSV, Excel or PDF of your current holdings from your broker",
    needsBroker: true,
    passwordCommon: false,
  },
  {
    value: "itr",
    label: "ITR PDF",
    hint: "For carry-forward losses — ITR-2 or ITR-3 from incometax.gov.in",
    needsBroker: false,
    passwordCommon: false,
  },
];

const BROKERS = ["Zerodha", "Groww", "Upstox", "Angel One", "ICICI Direct", "Other"];

export function TaxDocumentUpload({ onUpload, onClose, uploading, error }: Props) {
  const [docType, setDocType] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedType = DOC_TYPES.find((d) => d.value === docType);

  const handleFile = (f: File) => setFile(f);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || !docType) return;
    const result = await onUpload(
      file,
      docType,
      selectedType?.needsBroker ? brokerName || undefined : undefined,
      password || undefined
    );
    if (result.status === "needs_password") {
      setNeedsPassword(true);
    } else if (result.status === "parsed") {
      onClose();
    }
    // wrong_password and error stay open — error prop shows the message
  };

  const canUpload = !!file && !!docType && (!selectedType?.needsBroker || !!brokerName) && !uploading;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="glass-elevated rounded-3xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-minto-text text-lg">Upload Document</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <X size={16} className="text-minto-text-secondary" />
          </button>
        </div>

        {/* Doc type selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-minto-text-muted uppercase tracking-wide block mb-2">
            What type of document is this?
          </label>
          <div className="space-y-2">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => { setDocType(dt.value); setNeedsPassword(false); setPassword(""); }}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                  docType === dt.value
                    ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                    : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
                }`}
              >
                <p className="text-sm font-medium">{dt.label}</p>
                <p className="text-xs text-minto-text-muted mt-0.5">{dt.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Broker selector (conditional) */}
        {selectedType?.needsBroker && (
          <div className="mb-4">
            <label className="text-xs font-medium text-minto-text-muted uppercase tracking-wide block mb-2">
              Which broker?
            </label>
            <div className="relative">
              <select
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60 appearance-none"
              >
                <option value="">Select broker…</option>
                {BROKERS.map((b) => (
                  <option key={b} value={b.toLowerCase().replace(" ", "_")}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-minto-text-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* File drop zone */}
        {docType && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`mb-4 border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragging
                ? "border-minto-accent bg-minto-accent/10"
                : file
                ? "border-minto-positive bg-minto-positive/10"
                : "border-white/30 bg-white/5 hover:border-white/50 hover:bg-white/10"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.csv,.xls,.xlsx,.json"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-minto-positive">
                <FileText size={20} />
                <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setNeedsPassword(false); }}
                  className="ml-1 text-minto-text-muted hover:text-minto-negative"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={24} className="text-minto-text-muted mx-auto mb-2" />
                <p className="text-sm text-minto-text-secondary">
                  Drag & drop or click to browse
                </p>
                <p className="text-xs text-minto-text-muted mt-1">
                  PDF · CSV · Excel accepted
                </p>
              </>
            )}
          </div>
        )}

        {/* Password field (shown when needed) */}
        {(needsPassword || selectedType?.passwordCommon) && docType && (
          <div className="mb-4">
            <label className="text-xs font-medium text-minto-text-muted uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Lock size={11} />
              {needsPassword ? "This PDF is password-protected" : "Password (if set when downloading)"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password…"
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm mb-4 bg-red-400/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-3 rounded-full border border-white/20 text-minto-text-secondary text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="flex-1 py-3 rounded-full bg-minto-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Upload size={14} />
                Upload & Parse
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
