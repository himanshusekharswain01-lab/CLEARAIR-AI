import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, Compass, RefreshCw, ShieldAlert, Wind } from 'lucide-react';
import type {
  AlertEvent,
  AlertRule,
  AqiClassification,
  AqiStandard,
  EnvironmentSnapshot,
  FamilyProfile,
  LanguageCode,
} from '../shared/types.ts';
import { UI_COPY } from '../shared/i18n.ts';
import { AirQualityChart } from './AirQualityChart.tsx';

interface DashboardViewProps {
  snapshot: EnvironmentSnapshot | null;
  loading: boolean;
  error: string | null;
  standard: AqiStandard;
  language: LanguageCode;
  profile: FamilyProfile;
  lowDataMode: boolean;
  alertRules: AlertRule[];
  alertEvents: AlertEvent[];
  onRefresh: () => void;
  onAckAlert: (id: string) => void;
  onOpenSettings: (tab: 'alerts' | 'family') => void;
  onAskAssistant: (prompt: string) => void;
}

const SEVERITY_STYLES: Record<AqiClassification['colorToken'], string> = {
  emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800',
  amber: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
  orange: 'text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800',
  rose: 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800',
  purple: 'text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800',
  maroon: 'text-red-900 dark:text-red-200 bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-800',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  snapshot,
  loading,
  error,
  standard,
  language,
  profile,
  lowDataMode,
  alertRules,
  alertEvents,
  onRefresh,
  onAckAlert,
  onOpenSettings,
  onAskAssistant,
}) => {
  const copy = UI_COPY[language];
  const [imgError, setImgError] = useState(false);

  const unackedAlerts = useMemo(() => alertEvents.filter((e) => !e.acknowledged), [alertEvents]);

  const hourlyChart = useMemo(() => {
    const pts = snapshot?.hourlyForecast.slice(0, 24) ?? [];
    return {
      labels: pts.map((p) => p.time.slice(11, 16)),
      series: [
        {
          id: 'aqi',
          label: standard === 'EU_EAQI' ? 'EU EAQI' : 'US AQI',
          unit: 'idx',
          color: '#0284C7',
          values: pts.map((p) => (standard === 'EU_EAQI' ? p.euAqi : p.usAqi)),
        },
        {
          id: 'pm25',
          label: 'PM2.5',
          unit: 'µg/m³',
          color: '#D97706',
          values: pts.map((p) => p.pm25),
        },
        {
          id: 'wind',
          label: 'Wind',
          unit: 'km/h',
          color: '#10B981',
          dashed: true,
          values: pts.map((p) => p.windSpeedKmh),
        },
      ],
    };
  }, [snapshot, standard]);

  if (loading && !snapshot) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading air quality dashboard">
        <div className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-6">
        <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">Unable to load environmental telemetry</h2>
        <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-medium text-white dark:text-slate-900 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (!snapshot) return null;

  const cls = snapshot.current.classification;
  const p = snapshot.current.pollutants;
  const w = snapshot.current.weather;
  const standardLabel = standard === 'US_EPA' ? 'US EPA AQI' : standard === 'EU_EAQI' ? 'European EAQI' : 'India NAQI';

  const thresholdBreach = alertRules.some(
    (r) =>
      r.enabled &&
      ((snapshot.current.usAqi ?? 0) >= r.aqiThreshold || (p.pm25 ?? 0) >= r.pm25Threshold)
  );

  return (
    <div className="space-y-8">
      {/* Unacknowledged Alert Events */}
      {(unackedAlerts.length > 0 || thresholdBreach) && (
        <section
          aria-label="Active Air Quality Alerts"
          className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-semibold text-rose-900 dark:text-rose-100">
                {unackedAlerts.length > 0 ? unackedAlerts[0].message : 'Current reading exceeds one of your saved AQI/PM2.5 alert thresholds.'}
              </p>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                Keep windows sealed during peak concentrations and review indoor filtration guidance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unackedAlerts.length > 0 && (
              <button
                type="button"
                onClick={() => onAckAlert(unackedAlerts[0].id)}
                className="rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Acknowledge
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenSettings('alerts')}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Alerts
            </button>
          </div>
        </section>
      )}

      {/* Stale or Unavailable Data Banner */}
      {(snapshot.dataUnavailable || snapshot.stale) && (
        <div
          role="status"
          className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">
              {snapshot.dataUnavailable ? 'Live environmental telemetry unavailable.' : 'Displaying cached telemetry.'}
            </span>{' '}
            <span>
              {snapshot.unavailableReason ||
                `Last verified reading fetched at ${new Date(snapshot.fetchedAt).toLocaleString()}.`}
            </span>
          </div>
        </div>
      )}

      {/* Dominant Focal Anchor: Current Air Quality Readout */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {snapshot.location.name}
                {snapshot.location.country ? `, ${snapshot.location.country}` : ''}
                <span aria-hidden="true"> · </span>
                {standardLabel}
                <span aria-hidden="true"> · </span>
                Source: {snapshot.source}
              </span>
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 hover:underline font-medium cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Updated {new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{copy.currentAirQuality}</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-5xl font-bold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-50">
                    {snapshot.dataUnavailable ? '—' : cls.value}
                  </span>
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                    {standardLabel}
                  </span>
                </div>
              </div>

              <div className={`rounded-lg border px-3.5 py-2 ${SEVERITY_STYLES[cls.colorToken]}`}>
                <div className="text-sm font-semibold">
                  <span aria-hidden="true" className="mr-1.5">
                    {cls.symbol}
                  </span>
                  {snapshot.dataUnavailable ? 'Status Unavailable' : cls.category}
                </div>
                <div className="text-xs mt-0.5 opacity-90">
                  Primary driver: <span className="font-mono font-medium">{cls.dominantPollutant}</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl">
              {cls.shortAdvisory}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Household context: {profile.householdSize} members
              <span aria-hidden="true"> · </span>
              Commute: {profile.primaryCommuteMode.replace('_', ' ')}
              <span aria-hidden="true"> · </span>
              HEPA: {profile.hasHepaPurifier ? 'Available' : 'None listed'}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenSettings('family')}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Adjust Family Routine
              </button>
              <button
                type="button"
                onClick={() =>
                  onAskAssistant(
                    `Given the current air quality in ${snapshot.location.name}, build a practical today routine for our household including school/commute timing and indoor ventilation.`
                  )
                }
                className="rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Get Personalized Daily Plan
              </button>
            </div>
          </div>
        </div>

        {/* Atmospheric Context Visual Panel */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          {!lowDataMode && !imgError ? (
            <div className="relative h-40 lg:h-44 w-full bg-slate-800">
              <img
                src="/src/assets/images/hero_urban_atmosphere_1795179738733.jpg"
                alt="Northern city skyline in crisp morning atmospheric haze with electric light-rail transit"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <p className="text-xs font-medium text-slate-200">Atmospheric Dispersion Brief</p>
              </div>
            </div>
          ) : (
            <div className="px-5 pt-5 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Wind className="w-4 h-4 text-sky-600" aria-hidden="true" />
              <span className="text-sm font-semibold">Atmospheric Dispersion Brief</span>
            </div>
          )}

          <div className="p-5 flex-1 flex flex-col justify-between space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">{copy.inversionRisk}</span>
              <span className="font-mono font-semibold capitalize text-slate-900 dark:text-slate-100">
                {snapshot.current.inversionRisk}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">{copy.trend}</span>
              <span className="font-mono font-semibold capitalize text-slate-900 dark:text-slate-100">
                {snapshot.current.trendDirection}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Mixing Layer Height</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {w.boundaryLayerHeightM !== null ? `${w.boundaryLayerHeightM} m` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Surface Wind</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {w.windSpeedKmh !== null ? `${w.windSpeedKmh} km/h` : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenSettings('alerts')}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              Configure Threshold Alerts ({alertRules.filter((r) => r.enabled).length})
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section aria-label="Primary Pollutant and Weather Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Fine Particulate (PM2.5)</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {p.pm25 !== null ? p.pm25 : '—'}
            <span className="ml-1.5 text-xs font-normal text-slate-400">µg/m³</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">WHO 24h guideline: 15 µg/m³</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Coarse Dust (PM10)</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {p.pm10 !== null ? p.pm10 : '—'}
            <span className="ml-1.5 text-xs font-normal text-slate-400">µg/m³</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">WHO 24h guideline: 45 µg/m³</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Nitrogen Dioxide (NO2)</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {p.no2 !== null ? p.no2 : '—'}
            <span className="ml-1.5 text-xs font-normal text-slate-400">µg/m³</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Traffic & combustion marker</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Weather Conditions</p>
          <p className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {w.temperatureC !== null ? `${w.temperatureC}°C` : '—'}
            <span className="ml-2 text-xs font-normal text-slate-400">
              {w.humidityPct !== null ? `${w.humidityPct}% RH` : ''}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Compass className="w-3 h-3" aria-hidden="true" />
            Pressure {w.pressureHpa !== null ? `${w.pressureHpa} hPa` : '—'}
          </p>
        </div>
      </section>

      {/* Hourly Forecast Chart */}
      <AirQualityChart
        title={copy.hourlyForecast}
        subtitle={`Observed start ${snapshot.current.observedAt.replace('T', ' ')} · Local station/model grid`}
        labels={hourlyChart.labels}
        series={hourlyChart.series}
        lowDataMode={lowDataMode}
      />

      {/* Full Pollutant Telemetry Table + Cross-Standard Reference */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{copy.pollutantBreakdown}</h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            US EPA: {snapshot.current.usAqi ?? '—'} · EU EAQI: {snapshot.current.euAqi ?? '—'} · IN NAQI:{' '}
            {snapshot.current.inNaqi ?? '—'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4 text-left font-medium">Pollutant</th>
                <th className="py-2 px-4 text-right font-medium">Concentration</th>
                <th className="py-2 pl-4 text-left font-medium">Typical Winter-Smog & Urban Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {[
                { name: 'PM2.5', val: p.pm25, unit: 'µg/m³', note: 'Combustion, biomass heating, secondary winter aerosols, tailpipe exhaust' },
                { name: 'PM10', val: p.pm10, unit: 'µg/m³', note: 'Road dust, construction activity, coarse smoke particles' },
                { name: 'NO2', val: p.no2, unit: 'µg/m³', note: 'Diesel & petrol traffic corridors, gas boilers, power generation' },
                { name: 'O3 (Ozone)', val: p.o3, unit: 'µg/m³', note: 'Secondary photochemical oxidant formed under sunlight + NOx/VOCs' },
                { name: 'SO2', val: p.so2, unit: 'µg/m³', note: 'Coal/heavy oil combustion, industrial boilers' },
                { name: 'CO', val: p.co, unit: 'µg/m³', note: 'Incomplete combustion, cold vehicle starts, unvented solid fuels' },
              ].map((row) => (
                <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 pr-4 font-mono font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {row.val !== null ? `${row.val} ${row.unit}` : '—'}
                  </td>
                  <td className="py-2.5 pl-4 text-xs text-slate-600 dark:text-slate-300">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
