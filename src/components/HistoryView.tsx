import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Info } from 'lucide-react';
import type { HistoricalAirQualityResponse, LanguageCode, LocationOption } from '../shared/types.ts';
import { UI_COPY } from '../shared/i18n.ts';
import { api } from '../services/api.ts';
import { AirQualityChart, type ChartHighlightBand } from './AirQualityChart.tsx';

interface HistoryViewProps {
  location: LocationOption;
  language: LanguageCode;
  lowDataMode: boolean;
}

type PollutantMetricKey = 'pm25Avg' | 'pm10Avg' | 'no2Avg' | 'o3Avg' | 'so2Avg' | 'coAvg';

const METRIC_META: Record<PollutantMetricKey, { label: string; unit: string; color: string }> = {
  pm25Avg: { label: 'PM2.5', unit: 'µg/m³', color: '#0284C7' },
  pm10Avg: { label: 'PM10', unit: 'µg/m³', color: '#D97706' },
  no2Avg: { label: 'NO2', unit: 'µg/m³', color: '#7C3AED' },
  o3Avg: { label: 'O3', unit: 'µg/m³', color: '#059669' },
  so2Avg: { label: 'SO2', unit: 'µg/m³', color: '#DC2626' },
  coAvg: { label: 'CO', unit: 'µg/m³', color: '#475569' },
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const HistoryView: React.FC<HistoryViewProps> = ({ location, language, lowDataMode }) => {
  const copy = UI_COPY[language];
  const [startDate, setStartDate] = useState(() => isoDaysAgo(21));
  const [endDate, setEndDate] = useState(() => isoDaysAgo(0));
  const [selectedMetrics, setSelectedMetrics] = useState<PollutantMetricKey[]>(['pm25Avg', 'pm10Avg']);
  const [data, setData] = useState<HistoricalAirQualityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareDateA, setCompareDateA] = useState('');
  const [compareDateB, setCompareDateB] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getHistoricalAirQuality(location, startDate, endDate)
      .then((res) => {
        if (!active) return;
        setData(res);
        if (res.dailySeries.length >= 2) {
          setCompareDateA(res.dailySeries[0].date);
          setCompareDateB(res.dailySeries[res.dailySeries.length - 1].date);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to fetch historical archive.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location.latitude, location.longitude, startDate, endDate]);

  const applyPresetDays = (days: number) => {
    setStartDate(isoDaysAgo(days));
    setEndDate(isoDaysAgo(0));
  };

  const toggleMetric = (key: PollutantMetricKey) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      return [...prev, key].slice(0, 3);
    });
  };

  const chartSeries = useMemo(() => {
    if (!data) return [];
    return selectedMetrics.map((key) => ({
      id: key,
      label: METRIC_META[key].label,
      unit: METRIC_META[key].unit,
      color: METRIC_META[key].color,
      values: data.dailySeries.map((d) => d[key]),
    }));
  }, [data, selectedMetrics]);

  const eventBands: ChartHighlightBand[] = useMemo(() => {
    if (!data) return [];
    return data.events
      .map((evt) => {
        const startIndex = data.dailySeries.findIndex((d) => d.date === evt.startDate);
        const endIndex = data.dailySeries.findIndex((d) => d.date === evt.endDate);
        if (startIndex < 0 || endIndex < 0) return null;
        return { startIndex, endIndex, label: evt.title };
      })
      .filter((b): b is ChartHighlightBand => b !== null);
  }, [data]);

  const dayA = data?.dailySeries.find((d) => d.date === compareDateA) ?? null;
  const dayB = data?.dailySeries.find((d) => d.date === compareDateB) ?? null;

  return (
    <div className="space-y-8">
      {/* Header & Date Range Toolbar */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{copy.historicalTrends}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {location.name}
              {location.country ? `, ${location.country}` : ''}
              <span aria-hidden="true"> · </span>
              {data?.source ?? 'Open-Meteo Historical Air Quality Archive (CAMS)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: '7D', days: 7 },
              { label: '14D', days: 14 },
              { label: '30D', days: 30 },
              { label: '60D', days: 60 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPresetDays(p.days)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>From</span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <span>To</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={isoDaysAgo(0)}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(Object.keys(METRIC_META) as PollutantMetricKey[]).map((key) => {
              const active = selectedMetrics.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMetric(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {METRIC_META[key].label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" aria-busy="true" />
      )}

      {data && !loading && (
        <>
          {/* Weekly Environmental Summary */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">7-Day Mean PM2.5</p>
              <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {data.weeklySummary.avgPm25 ?? '—'}
                <span className="ml-1.5 text-xs font-normal text-slate-400">µg/m³</span>
              </p>
              {data.weeklySummary.deltaVsPriorWeekPct !== null && (
                <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                  {data.weeklySummary.deltaVsPriorWeekPct > 0 ? '+' : ''}
                  {data.weeklySummary.deltaVsPriorWeekPct}% vs prior 7d
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">7-Day Mean PM10</p>
              <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {data.weeklySummary.avgPm10 ?? '—'}
                <span className="ml-1.5 text-xs font-normal text-slate-400">µg/m³</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">NO2 avg: {data.weeklySummary.avgNo2 ?? '—'} µg/m³</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Exceedance Days (US AQI &gt; 100)</p>
              <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {data.weeklySummary.exceedanceDays}
                <span className="ml-1.5 text-xs font-normal text-slate-400">days</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Across {data.dailySeries.length} days shown</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Clean Air Days (US AQI ≤ 50)</p>
              <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {data.weeklySummary.cleanDays}
                <span className="ml-1.5 text-xs font-normal text-slate-400">days</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Favorable for outdoor routines</p>
            </div>
          </section>

          {/* Line Chart with Highlighted Pollution Episodes */}
          <AirQualityChart
            title={`Daily Mean Pollutant Trend (${startDate} to ${endDate})`}
            subtitle={
              eventBands.length > 0
                ? 'Shaded intervals indicate elevated PM2.5 / US AQI exceedance episodes'
                : 'Select up to 3 pollutants above to compare trajectories'
            }
            labels={data.dailySeries.map((d) => d.date.slice(5))}
            series={chartSeries}
            highlights={eventBands}
            height={270}
            lowDataMode={lowDataMode}
          />

          {/* Significant Past Pollution Events + Day Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Significant Past Pollution Events
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Detected from daily exceedance thresholds (PM2.5 ≥ 22 µg/m³ or US AQI ≥ 95) in your selected window.
              </p>

              {data.events.length === 0 ? (
                <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>No multi-day exceedance episodes were detected in this date range for {location.name}.</span>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {data.events.map((evt) => (
                    <li key={evt.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{evt.title}</span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {evt.startDate} → {evt.endDate} · Peak AQI {evt.peakAqi}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{evt.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Day-over-Day Comparison */}
            <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Compare Two Days</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Day A
                  <select
                    value={compareDateA}
                    onChange={(e) => setCompareDateA(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  >
                    {data.dailySeries.map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.date}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Day B
                  <select
                    value={compareDateB}
                    onChange={(e) => setCompareDateB(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  >
                    {data.dailySeries.map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.date}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {dayA && dayB && (
                <table className="mt-4 w-full text-xs font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-1.5 text-left font-sans">Metric</th>
                      <th className="py-1.5 text-right">{dayA.date.slice(5)}</th>
                      <th className="py-1.5 text-right">{dayB.date.slice(5)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    <tr>
                      <td className="py-2 font-sans text-slate-600 dark:text-slate-300">Peak US AQI</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayA.usAqiMax ?? '—'}</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayB.usAqiMax ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-600 dark:text-slate-300">Mean PM2.5 (µg/m³)</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayA.pm25Avg ?? '—'}</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayB.pm25Avg ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-600 dark:text-slate-300">Mean PM10 (µg/m³)</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayA.pm10Avg ?? '—'}</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayB.pm10Avg ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-600 dark:text-slate-300">Mean NO2 (µg/m³)</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayA.no2Avg ?? '—'}</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayB.no2Avg ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-600 dark:text-slate-300">Mean O3 (µg/m³)</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayA.o3Avg ?? '—'}</td>
                      <td className="py-2 text-right text-slate-900 dark:text-slate-100">{dayB.o3Avg ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};
