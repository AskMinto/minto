"use client";

import { useState } from "react";
import { useTaxWizard, WizardStep } from "@/hooks/use-tax-wizard";
import { Spinner } from "@/components/ui/spinner";
import { StepWelcome } from "./steps/step-welcome";
import { StepResidency } from "./steps/step-residency";
import { StepPortfolioType } from "./steps/step-portfolio-type";
import { StepNpsTier } from "./steps/step-nps-tier";
import { StepUlipCheck } from "./steps/step-ulip-check";
import { StepCarryForward } from "./steps/step-carry-forward";
import { StepTaxRegime } from "./steps/step-tax-regime";
import { StepDocuments } from "./steps/step-documents";
import { StepAnalysis } from "./steps/step-analysis";
import { WizardNav } from "./wizard-nav";
import { TaxDocumentUpload } from "./tax-document-upload";

export function TaxWizard() {
  const wizard = useTaxWizard();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const { sessionState, loading, saving, analysing, uploadingDoc, uploadError, setUploadError } = wizard;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const step = sessionState.step;

  // Steps that show the back nav + progress
  const showNav = !["welcome", "analysis", "blocked"].includes(step);

  const handleBack = () => {
    const backMap: Partial<Record<WizardStep, WizardStep>> = {
      residency_check: "welcome",
      portfolio_type: "residency_check",
      nps_tier: "portfolio_type",
      ulip_check: "portfolio_type",
      cf_check: "portfolio_type",
      cf_how_to_check: "cf_check",
      tax_regime: "cf_check",
      income_bracket: "tax_regime",
      documents: "tax_regime",
    };
    const prev = backMap[step];
    if (prev) wizard.setStep(prev);
  };

  const renderStep = () => {
    switch (step) {
      case "welcome":
        return <StepWelcome onStart={() => wizard.setStep("residency_check")} />;

      case "residency_check":
        return (
          <StepResidency
            onResident={() => wizard.setStep("portfolio_type")}
            onNRI={async (name, email) => {
              await wizard.saveAnswer("blocked", true);
              await wizard.saveAnswer("block_reason", "nri");
              if (name && email) {
                await wizard.saveAnswer("notification_name", name);
                await wizard.saveAnswer("notification_email", email);
              }
              await wizard.setStep("blocked");
            }}
          />
        );

      case "portfolio_type":
        return (
          <StepPortfolioType
            saving={saving}
            onContinue={async (selected, extras) => {
              await wizard.saveAnswer("portfolio_type", selected);
              if (extras.blocked) {
                await wizard.saveAnswer("blocked", true);
                await wizard.saveAnswer("block_reason", extras.blockReason || "foreign");
                await wizard.setStep("blocked");
                return;
              }
              if (extras.hasNps) {
                await wizard.setStep("nps_tier");
              } else if (extras.hasUlip) {
                await wizard.setStep("ulip_check");
              } else {
                await wizard.setStep("cf_check");
              }
            }}
          />
        );

      case "nps_tier":
        return (
          <StepNpsTier
            saving={saving}
            onContinue={async (tier) => {
              await wizard.saveAnswer("nps_tier", tier);
              const hasUlip = sessionState.portfolio_type.includes("4") || sessionState.portfolio_type.includes("ulips");
              if (hasUlip) {
                await wizard.setStep("ulip_check");
              } else {
                await wizard.setStep("cf_check");
              }
            }}
          />
        );

      case "ulip_check":
        return (
          <StepUlipCheck
            saving={saving}
            onContinue={async (hasDisclaimer) => {
              await wizard.saveAnswer("ulip_disclaimer_active", hasDisclaimer);
              await wizard.setStep("cf_check");
            }}
            onBlock={async (name, email) => {
              await wizard.saveAnswer("blocked", true);
              await wizard.saveAnswer("block_reason", "ulip");
              if (name && email) {
                await wizard.saveAnswer("notification_name", name);
                await wizard.saveAnswer("notification_email", email);
              }
              await wizard.setStep("blocked");
            }}
          />
        );

      case "cf_check":
      case "cf_how_to_check":
        return (
          <StepCarryForward
            step={step}
            saving={saving}
            onYes={async () => {
              await wizard.saveAnswer("carry_forward", true);
              await wizard.setStep("tax_regime");
            }}
            onNo={async () => {
              await wizard.saveAnswer("carry_forward", false);
              await wizard.setStep("tax_regime");
            }}
            onNotSure={() => wizard.setStep("cf_how_to_check")}
          />
        );

      case "tax_regime":
      case "income_bracket":
        return (
          <StepTaxRegime
            step={step}
            saving={saving}
            onContinue={async (regime, slabRate, baseIncome) => {
              await wizard.saveAnswer("tax_regime", regime);
              await wizard.saveAnswer("slab_rate", slabRate);
              if (baseIncome !== undefined) {
                await wizard.saveAnswer("base_income", baseIncome);
              }
              await wizard.setStep("documents");
            }}
            onNeedIncomeBracket={() => wizard.setStep("income_bracket")}
          />
        );

      case "documents":
        return (
          <StepDocuments
            sessionState={sessionState}
            holdingsContext={wizard.holdingsContext}
            uploadingDoc={uploadingDoc}
            onUploadClick={() => setUploadModalOpen(true)}
            onAnalyse={wizard.runAnalysis}
            analysing={analysing}
          />
        );

      case "analysis":
        return (
          <StepAnalysis
            sessionState={sessionState}
            onSyncHoldings={wizard.syncHoldings}
            onUploadMore={() => wizard.setStep("documents")}
            onStartOver={wizard.startOver}
          />
        );

      case "blocked":
        return (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto text-center">
            <div className="glass-card p-6 rounded-3xl mb-6">
              <p className="text-2xl font-bold text-minto-text mb-3">
                {sessionState.block_reason === "nri"
                  ? "NRI Support Coming Soon"
                  : sessionState.block_reason === "ulip"
                  ? "ULIP Support Coming Soon"
                  : "Foreign Equity Support Coming Soon"}
              </p>
              <p className="text-minto-text-secondary text-sm leading-relaxed">
                {sessionState.block_reason === "nri"
                  ? "This tool is currently built for resident Indians only. NRIs have different tax rules — TDS on redemptions, different rate structures, and potential DTAA benefits — that this tool doesn't handle yet."
                  : sessionState.block_reason === "ulip"
                  ? "Since you've realised gains from a high-premium equity ULIP this year, part of your ₹1.25L LTCG exemption may already be consumed in ways we can't calculate here."
                  : "Foreign stocks have significantly different tax treatment — no ₹1.25L exemption, currency conversion gains/losses, and DTAA complexities."}
              </p>
              <p className="text-minto-text-muted text-sm mt-4">
                We've noted your interest and will notify you when support is available.
              </p>
            </div>
          </div>
        );

      default:
        return <StepWelcome onStart={() => wizard.setStep("residency_check")} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {showNav && (
        <WizardNav
          step={step}
          onBack={handleBack}
          saving={saving}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {renderStep()}
      </div>

      {/* Document upload modal */}
      {uploadModalOpen && (
        <TaxDocumentUpload
          onUpload={async (file, docType, brokerName, password) => {
            const result = await wizard.uploadDocument(file, docType, brokerName, password);
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
