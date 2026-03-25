"use client";

import { useRef, useState } from "react";
import {
  Check,
  Upload,
  ChevronDown,
  ChevronUp,
  Lock,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type { DocInstruction } from "@/hooks/use-tax-saver";
import type { UploadResult } from "@/hooks/use-tax-saver";

interface Props {
  docInstructions: DocInstruction[];
  allUploaded: boolean;
  uploading: string | null; // doc_key currently being uploaded
  onUpload: (docKey: string, file: File, password?: string) => Promise<UploadResult>;
  onRunAnalysis: () => void;
  onStartOver: () => void;
  onRefreshDocs: () => Promise<void>; // re-fetch doc status from server
}

export function DocUploadScreen({
  docInstructions,
  allUploaded,
  uploading,
  onUpload,
  onRunAnalysis,
  onStartOver,
  onRefreshDocs,
}: Props) {
  const uploadedCount = docInstructions.filter((d) => d.uploaded).length;
  const totalCount = docInstructions.length;
  const anyUploaded = uploadedCount > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-minto-text">Upload your documents</h2>
            <button
              onClick={onStartOver}
              className="text-xs text-minto-text/80 hover:text-minto-text transition-colors"
            >
              Start over
            </button>
          </div>
          <p className="text-sm text-minto-text/80">
            {allUploaded
              ? "All documents uploaded! Ready to analyse."
              : uploadedCount > 0
              ? `${uploadedCount} of ${totalCount} uploaded — you can analyse now or upload more for a complete picture.`
              : `${totalCount} document${totalCount !== 1 ? "s" : ""} needed. Upload whichever you have.`}
          </p>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-minto-accent rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (uploadedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Doc cards */}
        <div className="space-y-4">
          {docInstructions.map((doc) => (
            <DocCard
              key={doc.doc_key}
              doc={doc}
              isUploading={uploading === doc.doc_key}
              onUpload={onUpload}
              onRefreshDocs={onRefreshDocs}
            />
          ))}
        </div>

        {/* Analyse button — shown once at least one doc is uploaded */}
        {anyUploaded && (
          <div className="mt-8">
            <button
              onClick={onRunAnalysis}
              className="w-full bg-minto-accent text-white rounded-2xl px-6 py-4 text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg"
            >
              {allUploaded ? "Analyse my tax situation" : `Analyse with ${uploadedCount} document${uploadedCount !== 1 ? "s" : ""}`}
              <ArrowRight size={16} />
            </button>
            {!allUploaded && (
              <p className="text-center text-xs text-minto-text/80 mt-2">
                You can upload remaining documents later for a more complete analysis.
              </p>
            )}
            <p className="text-center text-[10px] text-minto-text/80 mt-2">
              Documents are analysed in memory and never stored in raw form (DPDPA compliant).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Doc types that always need a password — show the field upfront
const ALWAYS_PASSWORD_DOCS = new Set(["cas_pdf", "itr_pdf"]);

function DocCard({
  doc,
  isUploading,
  onUpload,
  onRefreshDocs,
}: {
  doc: DocInstruction;
  isUploading: boolean;
  onUpload: (docKey: string, file: File, password?: string) => Promise<UploadResult>;
  onRefreshDocs: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(!doc.uploaded);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recovering, setRecovering] = useState(false);

  // For CAS and ITR, show password field upfront before file selection
  const showPasswordUpfront = ALWAYS_PASSWORD_DOCS.has(doc.doc_key) && !!doc.password_hint;
  const [upfrontPassword, setUpfrontPassword] = useState("");

  const doUpload = async (file: File, pwd?: string) => {
    setUploadResult(null);
    setNeedsPassword(false);
    setPasswordError("");

    const result = await onUpload(doc.doc_key, file, pwd);
    setUploadResult(result);

    if (result.status === "needs_password") {
      // Shouldn't happen for upfront-password docs, but handle anyway
      setNeedsPassword(true);
      setPendingFile(file);
    } else if (result.status === "extracted") {
      setExpanded(false);
      setUpfrontPassword("");
    } else if (result.status === "error") {
      // Could be a proxy timeout — the backend may have succeeded anyway.
      // Refresh from server to check if the doc actually got stored.
      setRecovering(true);
      await new Promise((r) => setTimeout(r, 2000)); // brief delay
      await onRefreshDocs();
      setRecovering(false);
      // If doc is now uploaded (parent re-renders with uploaded=true), we're done.
      // If still not uploaded, leave the error message visible.
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingFile(file);
    const pwd = showPasswordUpfront ? upfrontPassword : undefined;
    await doUpload(file, pwd || undefined);
  };

  const handlePasswordSubmit = async () => {
    if (!pendingFile || !password.trim()) return;
    setPasswordError("");

    const result = await onUpload(doc.doc_key, pendingFile, password);
    setUploadResult(result);

    if (result.status === "wrong_password") {
      setPasswordError(result.message || "Incorrect password. Please try again.");
    } else if (result.status === "extracted") {
      setNeedsPassword(false);
      setPassword("");
      setExpanded(false);
    } else if (result.status === "error") {
      setRecovering(true);
      await onRefreshDocs();
      setRecovering(false);
    }
  };

  const accept = (doc.file_types || []).join(",");

  return (
    <div
      className={[
        "glass-card rounded-2xl overflow-hidden transition-all",
        doc.uploaded ? "opacity-90" : "",
      ].join(" ")}
    >
      {/* Card header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => !doc.uploaded && setExpanded((e) => !e)}
      >
        <div
          className={[
            "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base",
            doc.uploaded ? "bg-green-500/15" : "bg-white/40",
          ].join(" ")}
        >
          {doc.uploaded ? (
            <Check size={16} className="text-green-600" />
          ) : (
            <span>{doc.icon}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-minto-text text-[14px]">{doc.label}</span>
            {doc.uploaded && (
              <span className="text-[10px] bg-green-500/15 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Uploaded
              </span>
            )}
            {showPasswordUpfront && !doc.uploaded && (
              <span className="text-[10px] bg-amber-100/60 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock size={9} /> Password required
              </span>
            )}
          </div>
          {!doc.uploaded && (
            <p className="text-xs text-minto-text/80 truncate">{doc.description}</p>
          )}
          {doc.uploaded && doc.preview && (
            <p className="text-[11px] text-minto-text/80 truncate font-mono mt-0.5">
              {doc.preview}
            </p>
          )}
        </div>
        {!doc.uploaded && (
          <span className="shrink-0 text-minto-text/80">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && !doc.uploaded && (
        <div className="px-5 pb-5 border-t border-white/20">
          {/* Download instructions */}
          <div className="pt-4 mb-4">
            <p className="text-xs font-medium text-minto-text mb-2">How to download:</p>
            <ol className="space-y-1.5">
              {doc.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-minto-text/80">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-white/50 flex items-center justify-center text-[10px] font-medium mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Upfront password field for CAS / ITR */}
          {showPasswordUpfront && (
            <div className="mb-4 p-3 bg-amber-50/60 rounded-xl border border-amber-200/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lock size={12} className="text-amber-600" />
                <p className="text-xs font-medium text-amber-900">Enter the document password first</p>
              </div>
              <p className="text-[11px] text-amber-800 mb-2">{doc.password_hint}</p>
              <input
                type="password"
                value={upfrontPassword}
                onChange={(e) => setUpfrontPassword(e.target.value)}
                placeholder="Document password"
                className="w-full bg-white/80 border border-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-minto-accent/50"
              />
            </div>
          )}

          {/* Password prompt shown after upload detects encryption (non-upfront docs) */}
          {needsPassword && !showPasswordUpfront && (
            <div className="mb-4 p-4 bg-amber-50/60 rounded-xl border border-amber-200/50">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={14} className="text-amber-600" />
                <p className="text-sm font-medium text-amber-900">This file is password-protected</p>
              </div>
              {uploadResult?.hint && (
                <p className="text-xs text-amber-800 mb-3">{uploadResult.hint}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  placeholder="Enter password"
                  autoFocus
                  className="flex-1 bg-white/80 border border-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-minto-accent/50"
                />
                <button
                  onClick={handlePasswordSubmit}
                  disabled={isUploading || !password.trim()}
                  className="bg-minto-accent text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : "Unlock"}
                </button>
              </div>
              {passwordError && <p className="text-xs text-red-500 mt-2">{passwordError}</p>}
              <button
                onClick={() => { setNeedsPassword(false); setPendingFile(null); setPassword(""); }}
                className="mt-2 text-xs text-minto-text/80 hover:text-minto-text transition-colors"
              >
                ← Upload a different file
              </button>
            </div>
          )}

          {/* Upload result messages */}
          {(recovering || (isUploading && (doc.doc_key.endsWith("_pdf")))) && !doc.uploaded && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-200/50">
              <Loader2 size={13} className="text-amber-600 animate-spin" />
              <p className="text-xs text-amber-800">
                {recovering
                  ? "Extracting tables from PDF via Gemini — this can take up to 90 seconds..."
                  : "Uploading..."}
              </p>
            </div>
          )}
          {!recovering && uploadResult && uploadResult.status === "likely_invalid" && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50/60 rounded-xl border border-red-200/50">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{uploadResult.message}</p>
            </div>
          )}
          {!recovering && uploadResult && uploadResult.status === "error" && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50/60 rounded-xl border border-red-200/50">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                {uploadResult.message || "Upload failed. The document may still have been processed — check below or try again."}
              </p>
            </div>
          )}
          {!recovering && uploadResult && uploadResult.status === "wrong_password" && !needsPassword && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50/60 rounded-xl border border-red-200/50">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">Incorrect password. Please check and try again.</p>
            </div>
          )}

          {/* Upload button — hidden while handling password for non-upfront docs */}
          {!needsPassword && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept || ".pdf,.xlsx,.csv"}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || recovering || (showPasswordUpfront && !upfrontPassword.trim())}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-minto-accent/30 rounded-xl py-4 text-sm text-minto-accent hover:bg-minto-accent/5 transition-colors disabled:opacity-40"
              >
                {isUploading || recovering ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {recovering ? "Verifying..." : "Uploading & extracting..."}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Choose file{doc.file_types?.length ? ` (${doc.file_types.join(", ")})` : ""}
                  </>
                )}
              </button>
              {showPasswordUpfront && !upfrontPassword.trim() && (
                <p className="text-center text-[11px] text-minto-text/80 mt-2">
                  Enter the password above before choosing your file.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Re-upload option when already uploaded */}
      {doc.uploaded && (
        <div className="px-5 pb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept || ".pdf,.xlsx,.csv"}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => { setExpanded(true); }}
            disabled={isUploading}
            className="text-xs text-minto-text/80 hover:text-minto-text transition-colors"
          >
            Re-upload
          </button>
        </div>
      )}
    </div>
  );
}
