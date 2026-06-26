"use client";

import { useState } from "react";
import { Send, Sparkles, FileText, AlertCircle } from "lucide-react";
import {
  answerQuestion,
  SUGGESTED_QUESTIONS,
  type AssistantAnswer,
} from "@/lib/domain/assistant";
import type {
  DiligenceRequestItem,
  Document,
  ExtractedMetric,
  Transaction,
} from "@/lib/domain/types";
import { cn } from "@/lib/ui";

interface Msg {
  role: "user" | "assistant";
  text: string;
  answer?: AssistantAnswer;
}

export function AiAssistant({
  transaction,
  items,
  documents,
  metrics,
  riskNarrative,
  nowIso,
}: {
  transaction: Transaction;
  items: DiligenceRequestItem[];
  documents: Document[];
  metrics: ExtractedMetric[];
  riskNarrative: string;
  nowIso: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    const answer = answerQuestion(
      question,
      { transaction, items, documents, metrics, riskNarrative },
      new Date(nowIso),
    );
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question },
      { role: "assistant", text: answer.answer, answer },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
        <Sparkles size={14} />
        Grounded analyst — answers only from extracted documents, cites sources, and flags missing data. It never invents numbers.
      </div>

      {/* Suggested questions */}
      {messages.length === 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.slice(0, 9).map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              className="rounded-full border border-ink-200 bg-panel px-3 py-1.5 text-xs text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      {/* Transcript */}
      <div className="mb-4 space-y-3">
        {messages.map((m, idx) => (
          <div key={idx} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "border border-ink-200 bg-panel text-ink-800",
              )}
            >
              <p className="whitespace-pre-line">{m.text}</p>
              {m.answer ? <AnswerMeta answer={m.answer} /> : null}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 rounded-xl border border-ink-200 bg-panel px-3 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about T12 revenue, EBITDA, AR, missing items…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Send size={14} /> Ask
        </button>
      </form>
    </div>
  );
}

function AnswerMeta({ answer }: { answer: AssistantAnswer }) {
  if (!answer.citations.length && answer.confidence === undefined && !answer.missingData) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-2 text-xs text-ink-500">
      {answer.citations.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded bg-ink-50 px-1.5 py-0.5">
          <FileText size={11} /> {c.document}
          {c.page ? ` p.${c.page}` : ""}
        </span>
      ))}
      {answer.confidence !== undefined ? (
        <span className="rounded bg-ink-50 px-1.5 py-0.5">conf {Math.round(answer.confidence * 100)}%</span>
      ) : null}
      {answer.missingData ? (
        <span className="inline-flex items-center gap-1 rounded bg-ochre-50 px-1.5 py-0.5 text-ochre-600">
          <AlertCircle size={11} /> some data still missing
        </span>
      ) : null}
    </div>
  );
}
