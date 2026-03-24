"use client";

import { useState, useRef } from "react";
import { Paperclip, X, Upload, ChevronDown } from "lucide-react";
import type { UploadResult } from "@/hooks/use-tax-harvest";

const DOC_TYPES = [
  { value: "cas", label: "CAS PDF (Mutual Funds)" },
  { value: "broker_pl", label: "Broker Tax P&L" },
  { value: "broker_holdings", label: "Broker Holdings" },
  { value: "itr", label: "Last Year's ITR" },
];

const BROKERS = [
  "Zerodha", "Groww", "Upstox", "Angel One", "ICICI Direct", "HDFC Securities", "Other"
];

interface Props {
  onUpload: (file: File, docType: string, brokerName?: string, password?: string) => Promise<UploadResult>;
  disabled?: boolean;
  uploading?: boolean;
}

export function DocumentUploadButton({ onUpload, disabled, uploading }: Props) {
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState("cas");
  const [broker, setBroker] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsBroker = docType === "broker_pl" || docType === "broker_holdings";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
      setPassword("");
      setPasswordError("");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const result = await onUpload(selectedFile, docType, needsBroker ? broker : undefined);
    setUploadResult(result);

    if (result.status === "parsed") {
      setOpen(false);
      setSelectedFile(null);
      setPassword("");
      setBroker("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (result.status === "needs_password") {
      // Close the modal — the parent TaxHarvestChat will render the inline PasswordPrompt
      setOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (result.status === "wrong_password") {
      setPasswordError("Incorrect password. Try your PAN or date of birth.");
    }
  };

  const handlePasswordSubmit = async () => {
    if (!selectedFile || !password) return;
    setPasswordError("");
    const result = await onUpload(selectedFile, docType, needsBroker ? broker : undefined, password);
    setUploadResult(result);

    if (result.status === "parsed") {
      setOpen(false);
      setSelectedFile(null);
      setPassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (result.status === "wrong_password") {
      setPasswordError("Incorrect password. Try your PAN or date of birth (DDMMYYYY).");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || uploading}
        title="Upload document"
        className="w-9 h-9 rounded-full bg-minto-accent/10 text-minto-accent flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-minto-accent/20 transition-colors"
      >
        <Paperclip size={18} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-3 z-20">
      <div className="glass-elevated rounded-2xl p-4 border border-white/30 shadow-lg max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-minto-text">Upload Document</span>
          <button
            onClick={() => { setOpen(false); setSelectedFile(null); setUploadResult(null); }}
            className="text-minto-text-muted hover:text-minto-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Document type selector */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-minto-text-muted mb-1 block">Document Type</label>
            <div className="relative">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-white/70 border border-white/50 rounded-xl px-3 py-2 text-sm text-minto-text appearance-none focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-minto-text-muted pointer-events-none" />
            </div>
          </div>

          {needsBroker && (
            <div>
              <label className="text-xs text-minto-text-muted mb-1 block">Broker</label>
              <div className="relative">
                <select
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  className="w-full bg-white/70 border border-white/50 rounded-xl px-3 py-2 text-sm text-minto-text appearance-none focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
                >
                  <option value="">Select broker...</option>
                  {BROKERS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-minto-text-muted pointer-events-none" />
              </div>
            </div>
          )}

          {/* File picker */}
          <div>
            <label className="text-xs text-minto-text-muted mb-1 block">File</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-minto-accent/30 rounded-xl px-4 py-3 text-center cursor-pointer hover:border-minto-accent/60 transition-colors"
            >
              {selectedFile ? (
                <div className="text-sm text-minto-text font-medium">{selectedFile.name}</div>
              ) : (
                <div className="text-sm text-minto-text-muted">Click to select PDF, Excel, or CSV</div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv,.xlsm"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || (needsBroker && !broker)}
            className="w-full flex items-center justify-center gap-2 bg-minto-accent text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {uploading ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              <>
                <Upload size={15} />
                Upload & Parse
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
