import React, { useMemo, useState } from 'react';

export interface ChartSeries {
  id: string;
  label: string;
  unit: string;
  color: string;
  dashed?: boolean;
  values: Array<number | null>;
}

export interface ChartHighlightBand {
  startIndex: number;
  endIndex: number;
  label: string;
}

interface AirQualityChartProps {
  title: string;
  subtitle?: string;
  labels: string[];
  series: ChartSeries[];
  highlights?: ChartHighlightBand[];
  height?: number;
  lowDataMode?: boolean;
}

export const AirQualityChart: React.FC<AirQualityChartProps> = ({
  title,
  subtitle,
  labels,
  series,
  highlights = [],
  height = 240,
  lowDataMode = false,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const padLeft = 46;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { maxVal, yTicks } = useMemo(() => {
    const allNums: number[] = [];
    for (const s of series) {
      for (const v of s.values) {
        if (typeof v === 'number' && Number.isFinite(v)) allNums.push(v);
      }
    }
    const rawMax = allNums.length ? Math.max(...allNums) : 50;
    const ceiling = Math.max(20, Math.ceil((rawMax * 1.15) / 10) * 10);
    return {
      maxVal: ceiling,
      yTicks: [0, Math.round(ceiling * 0.33), Math.round(ceiling * 0.66), ceiling],
    };
  }, [series]);

  if (labels.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
        No time-series points available for this selection.
      </div>
    );
  }

  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const getX = (idx: number) => padLeft + (labels.length > 1 ? idx * stepX : plotW / 2);
  const getY = (val: number) => padTop + plotH - (Math.min(maxVal, Math.max(0, val)) / maxVal) * plotH;

  const activeIdx = hoverIdx !== null && hoverIdx < labels.length ? hoverIdx : labels.length - 1;
  const tickStride = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span
                className="inline-block w-3 h-0.5"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
                aria-hidden="true"
              />
              <span>{s.label}</span>
              <span className="font-mono text-slate-400">({s.unit})</span>
            </span>
          ))}
        </div>
      </div>

      {lowDataMode ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                <th className="py-1.5 pr-3">Time</th>
                {series.map((s) => (
                  <th key={s.id} className="py-1.5 px-2 text-right">
                    {s.label} ({s.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.filter((_, i) => i % Math.max(1, Math.floor(labels.length / 8)) === 0).map((lbl, idx) => {
                const realIdx = idx * Math.max(1, Math.floor(labels.length / 8));
                return (
                  <tr key={lbl} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{lbl}</td>
                    {series.map((s) => (
                      <td key={s.id} className="py-1.5 px-2 text-right text-slate-900 dark:text-slate-100">
                        {s.values[realIdx] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto cursor-crosshair select-none"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* Episode Highlight Bands */}
            {highlights.map((band) => {
              const x1 = getX(Math.max(0, band.startIndex));
              const x2 = getX(Math.min(labels.length - 1, band.endIndex));
              const bandW = Math.max(8, x2 - x1);
              return (
                <g key={`${band.startIndex}-${band.endIndex}`}>
                  <rect
                    x={x1}
                    y={padTop}
                    width={bandW}
                    height={plotH}
                    className="fill-rose-500/10 dark:fill-rose-400/10"
                  />
                </g>
              );
            })}

            {/* Horizontal Grid Lines */}
            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* X-axis Labels */}
            {labels.map((label, i) => {
              if (i % tickStride !== 0 && i !== labels.length - 1) return null;
              return (
                <text
                  key={`${label}-${i}`}
                  x={getX(i)}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {label}
                </text>
              );
            })}

            {/* Series Paths */}
            {series.map((s) => {
              const segments: string[] = [];
              let started = false;
              s.values.forEach((val, idx) => {
                if (typeof val === 'number' && Number.isFinite(val)) {
                  const cmd = started ? 'L' : 'M';
                  segments.push(`${cmd} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`);
                  started = true;
                } else {
                  started = false;
                }
              });
              const d = segments.join(' ');
              if (!d) return null;
              return (
                <path
                  key={s.id}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {/* Active Crosshair */}
            <line
              x1={getX(activeIdx)}
              y1={padTop}
              x2={getX(activeIdx)}
              y2={padTop + plotH}
              className="stroke-slate-400/60 dark:stroke-slate-600"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const val = s.values[activeIdx];
              if (typeof val !== 'number' || !Number.isFinite(val)) return null;
              return (
                <circle
                  key={`${s.id}-pt`}
                  cx={getX(activeIdx)}
                  cy={getY(val)}
                  r={3.5}
                  fill={s.color}
                  className="stroke-white dark:stroke-slate-900"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Invisible Hover Columns */}
            {labels.map((_, idx) => {
              const colW = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
              return (
                <rect
                  key={`hover-${idx}`}
                  x={Math.max(padLeft, getX(idx) - colW / 2)}
                  y={padTop}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onFocus={() => setHoverIdx(idx)}
                  tabIndex={0}
                  aria-label={`${labels[idx]}: ${series.map((s) => `${s.label} ${s.values[idx] ?? 'N/A'}`).join(', ')}`}
                />
              );
            })}
          </svg>

          {/* Compact Readout Bar */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-2.5 text-xs font-mono tabular-nums">
            <span className="text-slate-500 dark:text-slate-400">
              Point: <strong className="text-slate-900 dark:text-slate-100">{labels[activeIdx]}</strong>
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {series.map((s) => (
                <span key={s.id} className="text-slate-700 dark:text-slate-300">
                  {s.label}:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {s.values[activeIdx] !== null && s.values[activeIdx] !== undefined ? `${s.values[activeIdx]} ${s.unit}` : '—'}
                  </strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
