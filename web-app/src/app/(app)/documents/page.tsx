"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Trash2, FileCheck, AlertCircle } from "lucide-react";
import { apiGet, apiDelete } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

interface TaxDocument {
  id: string;
  doc_type: string;
  broker_name: string | null;
  file_name: string | null;
  parse_status: string;
  uploaded_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cas: "MFCentral CAS",
  broker_pl: "Broker Tax P&L",
  broker_holdings: "Broker Holdings",
  itr: "ITR",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await apiGet<{ documents: TaxDocument[] }>("/tax/documents");
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDelete = async (docId: string) => {
    setDeleting(docId);
    try {
      await apiDelete(`/tax/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      // Silently fail — user can retry
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-minto-accent/15 flex items-center justify-center">
            <FileText size={20} className="text-minto-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-minto-text">Documents</h1>
            <p className="text-sm text-minto-text-secondary">
              Documents uploaded for tax analysis. Raw files are deleted within 60s of parsing.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={28} />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full glass-card flex items-center justify-center mb-4">
              <FileText size={28} className="text-minto-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-minto-text mb-2">No documents yet</h3>
            <p className="text-sm text-minto-text-secondary max-w-sm">
              Documents you upload in the Tax Saver will appear here. Go to Tax Saver to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="glass-card rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-minto-accent/10 flex items-center justify-center shrink-0">
                    {doc.parse_status === "parsed" ? (
                      <FileCheck size={16} className="text-minto-positive" />
                    ) : (
                      <AlertCircle size={16} className="text-minto-negative" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-minto-text">
                      {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      {doc.broker_name && (
                        <span className="text-minto-text-muted ml-1.5 text-xs font-normal">
                          · {doc.broker_name}
                        </span>
                      )}
                    </p>
                    {doc.file_name && (
                      <p className="text-xs text-minto-text-muted truncate max-w-[200px] sm:max-w-xs">
                        {doc.file_name}
                      </p>
                    )}
                    <p className="text-xs text-minto-text-muted mt-0.5">
                      {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      doc.parse_status === "parsed"
                        ? "bg-minto-positive/15 text-minto-positive"
                        : "bg-minto-negative/15 text-minto-negative"
                    }`}
                  >
                    {doc.parse_status === "parsed" ? "Parsed" : "Failed"}
                  </span>

                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="w-8 h-8 rounded-full hover:bg-minto-negative/10 flex items-center justify-center transition-colors disabled:opacity-40"
                    title="Delete document record"
                  >
                    {deleting === doc.id ? (
                      <span className="w-4 h-4 border-2 border-minto-negative border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={14} className="text-minto-text-muted hover:text-minto-negative transition-colors" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DPDPA note */}
        {documents.length > 0 && (
          <div className="glass-subtle rounded-2xl px-4 py-3 mt-6 text-xs text-minto-text-muted">
            <strong className="text-minto-text-secondary">DPDPA 2023:</strong> Raw document files are deleted within
            60 seconds of parsing and are never stored long-term. Only derived summary figures are retained for
            your session. Deleting a record here removes the audit entry — your underlying data was already deleted.
          </div>
        )}
      </div>
    </div>
  );
}
