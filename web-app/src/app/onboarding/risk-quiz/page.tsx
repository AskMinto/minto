"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiPost } from "@/lib/api";

const QUESTIONS = [
  {
    id: "horizon",
    title: "What is your investment time horizon?",
    options: [
      { label: "Less than 3 years", score: 1 },
      { label: "3-7 years", score: 2 },
      { label: "More than 7 years", score: 3 },
    ],
  },
  {
    id: "volatility",
    title: "How comfortable are you with short-term volatility?",
    options: [
      { label: "Low", score: 1 },
      { label: "Medium", score: 2 },
      { label: "High", score: 3 },
    ],
  },
  {
    id: "income",
    title: "How stable is your income?",
    options: [
      { label: "Unstable", score: 1 },
      { label: "Somewhat stable", score: 2 },
      { label: "Very stable", score: 3 },
    ],
  },
];

export default function RiskQuizPage() {
  const router = useRouter();
  const { recheckOnboarding } = useAuth();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (questionId: string, score: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: score }));
  };

  const canSubmit = QUESTIONS.every((q) => answers[q.id] !== undefined);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const score = Object.values(answers).reduce((acc, val) => acc + val, 0);
      const level = score <= 5 ? "low" : score <= 7 ? "medium" : "high";
      await apiPost("/risk/quiz", { answers, score, level });
      await recheckOnboarding();
      router.push("/chat");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to save risk profile"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Risk Tolerance</h1>
      <p className="text-[#a2b082] text-sm mb-6">
        Answer 3 quick questions to personalize your experience.
      </p>

      {QUESTIONS.map((question, qi) => (
        <div key={question.id} className="bg-white/5 rounded-2xl p-5 mb-4">
          <p className="text-white font-semibold text-sm mb-3">
            <span className="text-[#a2b082] mr-2">{qi + 1}/3</span>
            {question.title}
          </p>
          <div className="space-y-2">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.score;
              return (
                <button
                  key={option.label}
                  onClick={() => handleSelect(question.id, option.score)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    selected
                      ? "bg-[#a2b082] border-[#a2b082] text-minto-dark font-semibold"
                      : "border-white/10 text-gray-300 hover:border-white/25"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className="w-full bg-white text-minto-dark font-semibold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
      >
        {loading ? (
          <span className="inline-block w-5 h-5 border-2 border-minto-dark border-t-transparent rounded-full animate-spin" />
        ) : (
          "Continue"
        )}
      </button>
    </div>
  );
}
