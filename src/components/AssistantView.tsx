import React, { useEffect, useState } from 'react';
import { Brain, Send, ShieldCheck } from 'lucide-react';
import type {
  AqiStandard,
  AssistantStructuredResponse,
  EnvironmentSnapshot,
  FamilyProfile,
  LanguageCode,
  LocationOption,
} from '../shared/types.ts';
import { UI_COPY } from '../shared/i18n.ts';
import { api } from '../services/api.ts';

interface AssistantViewProps {
  location: LocationOption;
  standard: AqiStandard;
  language: LanguageCode;
  profile: FamilyProfile;
  snapshot: EnvironmentSnapshot | null;
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
}

const STARTER_PROMPTS = [
  'Should we open windows for morning ventilation today or rely on HEPA filtration?',
  'Plan a low-exposure school drop-off, commute, and evening workout schedule for our family today.',
  'How does today’s wind and mixing layer height affect winter smog accumulation tonight?',
  'Suggest realistic home energy and commuting swaps to lower our household’s particulate footprint this week.',
];

export const AssistantView: React.FC<AssistantViewProps> = ({
  location,
  standard,
  language,
  profile,
  snapshot,
  pendingPrompt,
  onConsumePendingPrompt,
}) => {
  const copy = UI_COPY[language];
  const [question, setQuestion] = useState('');
  const [thinkingMode, setThinkingMode] = useState<'fast' | 'deep'>('deep');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantStructuredResponse | null>(null);

  const runQuery = async (promptText: string, modeOverride?: 'fast' | 'deep') => {
    const trimmed = promptText.trim();
    if (trimmed.length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.queryAssistant({
        question: trimmed,
        thinkingMode: modeOverride ?? thinkingMode,
        language,
        location,
        standard,
        profileOverride: profile,
      });
      setResult(res.advice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach ClearAir AI assistant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pendingPrompt) {
      setQuestion(pendingPrompt);
      runQuery(pendingPrompt, 'deep');
      onConsumePendingPrompt();
    }
  }, [pendingPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runQuery(question);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{copy.askAssistantTitle}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Grounded in {location.name} telemetry ({snapshot?.dataUnavailable ? 'unavailable — general guidance mode' : `observed ${snapshot?.current.observedAt.replace('T', ' ') ?? 'now'}`})
              <span aria-hidden="true"> · </span>
              Household profile applied
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setThinkingMode('fast')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                thinkingMode === 'fast'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {copy.fastModeLabel}
            </button>
            <button
              type="button"
              onClick={() => setThinkingMode('deep')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                thinkingMode === 'deep'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Brain className="w-3.5 h-3.5" aria-hidden="true" />
              {copy.deepThinkingLabel}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label htmlFor="assistant-question" className="sr-only">
            Ask ClearAir AI about air quality, indoor ventilation, or commute decisions
          </label>
          <textarea
            id="assistant-question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about school run timing, window ventilation, HEPA sizing, or low-emission travel..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-2 focus:outline-sky-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              Non-medical environmental guidance only · Responses reference verified telemetry
            </span>

            <button
              type="submit"
              disabled={loading || question.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {loading ? (thinkingMode === 'deep' ? 'Reasoning deeply...' : 'Generating...') : 'Analyze & Recommend'}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Suggested questions</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setQuestion(p);
                  runQuery(p);
                }}
                className="text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-4" aria-live="polite">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>
                Mode: {result.thinkingMode === 'deep' ? 'High Thinking' : 'Fast'} · Model: {result.modelUsed}
              </span>
              <span>Generated {new Date(result.generatedAt).toLocaleTimeString()}</span>
            </div>

            <p className="mt-3 text-base text-slate-900 dark:text-slate-100 leading-relaxed">{result.answerSummary}</p>

            <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-800">
              {result.recommendations.map((rec, idx) => (
                <article key={`${rec.title}-${idx}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      0{idx + 1}. {rec.title}
                    </h3>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {rec.category.replace('_', ' ')} · {rec.confidenceBasis}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    <strong className="font-medium text-slate-900 dark:text-slate-100">Why relevant:</strong> {rec.whyRelevant}
                  </p>

                  <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                    {rec.actionSteps.map((step, sIdx) => (
                      <li key={sIdx}>{step}</li>
                    ))}
                  </ul>

                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <strong>Expected benefit:</strong> {rec.expectedBenefit}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Safety & Medical Notice:</strong> {result.safetyNotice}
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Data Limitations:</strong> {result.dataLimitations}
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Sources:</strong> {result.sourcesUsed.join(' · ')}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
