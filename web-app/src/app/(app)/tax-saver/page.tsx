"use client";

import { useState } from "react";
import { useTaxChat } from "@/hooks/use-tax-chat";
import { MessageList } from "@/components/chat/message-list";
import { Spinner } from "@/components/ui/spinner";
import { TaxWelcomeScreen } from "./components/tax-welcome-screen";
import { TaxChatInput } from "./components/tax-chat-input";
import { TaxProgressBar } from "./components/tax-progress-bar";
import { TaxAnalysisPanel } from "./components/tax-analysis-panel";
import { TaxDocumentUpload } from "./components/tax-document-upload";

export default function TaxSaverPage() {
  const {
    messages,
    input,
    setInput,
    sendMessage,
    sending,
    loading,
    sessionState,
    uploadDocument,
    uploadingDoc,
    uploadError,
    setUploadError,
  } = useTaxChat();

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const handleSend = () => sendMessage(input);
  const handleChipSend = (text: string) => sendMessage(text);

  const handleDownloadReport = () => {
    sendMessage("Please generate a PDF report of my complete tax plan.");
  };

  const handleViewAnalysis = () => {
    sendMessage("Show me the full tax analysis with all the steps.");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Progress bar — shown once document collection has started */}
      {sessionState && (sessionState.documents_needed?.length ?? 0) > 0 && (
        <TaxProgressBar sessionState={sessionState} />
      )}

      {/* Analysis panel — shown once tax analysis is complete */}
      {sessionState?.has_tax_analysis && (
        <TaxAnalysisPanel
          sessionState={sessionState}
          onDownloadReport={handleDownloadReport}
          onViewAnalysis={handleViewAnalysis}
        />
      )}

      {/* Main chat area */}
      {messages.length === 0 ? (
        <>
          <TaxWelcomeScreen onSend={handleChipSend} />
          <TaxChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onUploadClick={() => setUploadModalOpen(true)}
            disabled={sending}
          />
        </>
      ) : (
        <>
          <MessageList
            messages={messages}
            sending={sending}
          />
          <TaxChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onUploadClick={() => setUploadModalOpen(true)}
            disabled={sending || uploadingDoc}
          />
        </>
      )}

      {/* Document upload modal */}
      {uploadModalOpen && (
        <TaxDocumentUpload
          onUpload={async (file, docType, brokerName, password) => {
            const result = await uploadDocument(file, docType, brokerName, password);
            if (result.status === "parsed") {
              setUploadModalOpen(false);
            }
            return result;
          }}
          onClose={() => {
            setUploadModalOpen(false);
            setUploadError(null);
          }}
          uploading={uploadingDoc}
          error={uploadError}
        />
      )}
    </div>
  );
}
