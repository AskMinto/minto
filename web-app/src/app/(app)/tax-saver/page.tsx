"use client";

import { useTaxSaver } from "@/hooks/use-tax-saver";
import { IntakeScreen } from "./components/intake-screen";
import { DocUploadScreen } from "./components/doc-upload-screen";
import { AnalysisStream } from "./components/analysis-stream";

export default function TaxSaverPage() {
  const {
    phase,
    intakeAnswers,
    docInstructions,
    allUploaded,
    messages,
    sending,
    uploading,
    submitIntake,
    uploadDocument,
    runAnalysis,
    sendFollowUp,
    startOver,
    goToUpload,
    refreshDocs,
  } = useTaxSaver();

  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_infinite]" />
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
        </div>
      </div>
    );
  }

  if (phase === "intake") {
    return <IntakeScreen onSubmit={submitIntake} />;
  }

  if (phase === "upload") {
    return (
      <DocUploadScreen
        docInstructions={docInstructions}
        allUploaded={allUploaded}
        uploading={uploading}
        onUpload={uploadDocument}
        onRunAnalysis={runAnalysis}
        onStartOver={startOver}
        onRefreshDocs={refreshDocs}
      />
    );
  }

  // analysing or done — show the streaming analysis + follow-up chat
  return (
    <AnalysisStream
      messages={messages}
      sending={sending}
      onSendFollowUp={sendFollowUp}
      onStartOver={startOver}
      onBackToUpload={goToUpload}
    />
  );
}
