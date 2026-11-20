import React, { useEffect, useMemo, useState } from 'react';
import { Check, Home, Leaf, Navigation, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { calculateRecommendedCadr, compareTravelModes, IMPACT_ACTION_CATALOG } from '../shared/aqi.ts';
import type {
  AuthUser,
  EnvironmentSnapshot,
  ImpactLogEntry,
  ImpactSummary,
  LanguageCode,
} from '../shared/types.ts';
import { UI_COPY } from '../shared/i18n.ts';
import { api } from '../services/api.ts';

interface PlannersViewProps {
  snapshot: EnvironmentSnapshot | null;
  language: LanguageCode;
  lowDataMode: boolean;
  user: AuthUser | null;
  onOpenAuth: () => void;
}

type PlannerTab = 'indoor' | 'travel' | 'impact';

const ROOM_GUIDES = [
  {
    room: 'Kitchen & Dining',
    guidance:
      'Run an externally vented range hood during cooking (especially gas stoves or high-heat frying) and for 15 minutes afterward to exhaust NO2 and ultrafine particles.',
  },
  {
    room: 'Bedrooms & Nursery',
    guidance:
      'Position a True HEPA (H13/H14) purifier away from drapes or corners; keep doors partially closed at night during winter smog episodes to maintain clean air volume.',
  },
  {
    room: 'Living Area & Study',
    guidance:
      'Damp-dust hard surfaces weekly with microfiber cloths rather than dry sweeping, and avoid burning candles, incense, or unvented wood fires indoors.',
  },
  {
    room: 'Entryway & Mudroom',
    guidance:
      'Use a doormat and remove outdoor shoes at the threshold to reduce tracked road dust, heavy metals, and coarse PM10 resuspension inside living spaces.',
  },
];

export const PlannersView: React.FC<PlannersViewProps> = ({
  snapshot,
  language,
  lowDataMode,
  user,
  onOpenAuth,
}) => {
  const copy = UI_COPY[language];
  const [tab, setTab] = useState<PlannerTab>('indoor');
  const [indoorImgError, setIndoorImgError] = useState(false);
  const [travelImgError, setTravelImgError] = useState(false);

  // CADR Calculator state
  const [roomAreaM2, setRoomAreaM2] = useState(28);
  const [ceilingHeightM, setCeilingHeightM] = useState(2.7);
  const [targetAch, setTargetAch] = useState(4);
  const cadr = useMemo(
    () => calculateRecommendedCadr(roomAreaM2, ceilingHeightM, targetAch),
    [roomAreaM2, ceilingHeightM, targetAch]
  );

  // Travel Planner state
  const [distanceKm, setDistanceKm] = useState(12);
  const [tripsPerWeek, setTripsPerWeek] = useState(10);
  const travelComparison = useMemo(
    () => compareTravelModes(distanceKm, tripsPerWeek),
    [distanceKm, tripsPerWeek]
  );

  // Impact Tracker state
  const [entries, setEntries] = useState<ImpactLogEntry[]>([]);
  const [summary, setSummary] = useState<ImpactSummary | null>(null);
  const [selectedAction, setSelectedAction] = useState('transit_switch_10km');
  const [actionNotes, setActionNotes] = useState('');
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactMsg, setImpactMsg] = useState<string | null>(null);

  const loadImpact = () => {
    api
      .getImpact()
      .then((res) => {
        setEntries(res.entries);
        setSummary(res.summary);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadImpact();
  }, [user?.id]);

  const handleLogImpact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setImpactBusy(true);
    setImpactMsg(null);
    try {
      await api.logImpact(selectedAction, actionNotes);
      setActionNotes('');
      setImpactMsg('Action logged to your personal impact tracker.');
      loadImpact();
    } catch (err) {
      setImpactMsg(err instanceof Error ? err.message : 'Unable to save entry.');
    } finally {
      setImpactBusy(false);
    }
  };

  const handleDeleteImpact = async (id: string) => {
    try {
      await api.deleteImpact(id);
      loadImpact();
    } catch {}
  };

  const outdoorPm25 = snapshot?.current.pollutants.pm25 ?? null;
  const outdoorUsAqi = snapshot?.current.usAqi ?? null;
  const ventilationAdvice = useMemo(() => {
    if (snapshot?.dataUnavailable || outdoorPm25 === null) {
      return {
        status: 'Verify Outdoor Conditions First',
        detail:
          'Live outdoor telemetry is unavailable. Prefer brief midday cross-ventilation only when no local smoke or traffic odor is present, and use filtered air otherwise.',
      };
    }
    if (outdoorPm25 <= 12 && (outdoorUsAqi ?? 0) <= 50) {
      return {
        status: 'Favorable for Natural Cross-Ventilation',
        detail: `Outdoor PM2.5 is ${outdoorPm25} µg/m³. Opening opposite windows for 15–20 minutes refreshes indoor CO2 and reduces cooking/cleaning buildup.`,
      };
    }
    if (outdoorPm25 <= 35.4) {
      return {
        status: 'Selective Midday Ventilation Only',
        detail: `Outdoor PM2.5 is ${outdoorPm25} µg/m³. Keep roadside windows closed during rush hours; ventilate briefly during higher afternoon wind dispersion.`,
      };
    }
    return {
      status: 'Keep Windows Closed · Use Mechanical / HEPA Filtration',
      detail: `Outdoor PM2.5 is elevated (${outdoorPm25} µg/m³). Seal window drafts, set HVAC to recirculate with MERV-13+ media if compatible, and run True HEPA units indoors.`,
    };
  }, [snapshot, outdoorPm25, outdoorUsAqi]);

  return (
    <div className="space-y-6">
      {/* Segmented Planner Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('indoor')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'indoor'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            Indoor Air Guide
          </button>
          <button
            type="button"
            onClick={() => setTab('travel')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'travel'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
            Smart Travel Planner
          </button>
          <button
            type="button"
            onClick={() => setTab('impact')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'impact'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Leaf className="w-3.5 h-3.5" aria-hidden="true" />
            Personal Impact & Lifestyle
          </button>
        </div>
      </div>

      {/* TAB 1: INDOOR AIR QUALITY GUIDE */}
      {tab === 'indoor' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{copy.indoorGuideTitle}</h2>
                <div className="mt-4 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-4">
                  <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
                    Current Ventilation Decision · {snapshot?.location.name ?? 'Selected Location'}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {ventilationAdvice.status}
                  </p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {ventilationAdvice.detail}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ROOM_GUIDES.map((g) => (
                    <div key={g.room} className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{g.room}</h3>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{g.guidance}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Safe Cleaning & Filtration Notice:</strong> Use fragrance-free, low-VOC cleaners and avoid mixing bleach with ammonia or acids. Never operate ozone generators, ionizers that emit ozone, or unverified DIY chemical air sprays in occupied rooms. This guidance is informational and not medical advice.
                </span>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
              {!lowDataMode && !indoorImgError && (
                <div className="h-44 w-full bg-slate-200 dark:bg-slate-800">
                  <img
                    src="/src/assets/images/indoor_clean_room_1795179739255.jpg"
                    alt="Sunlit living room with sealed windows and cylindrical HEPA air purifier"
                    referrerPolicy="no-referrer"
                    onError={() => setIndoorImgError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    HEPA Air Purifier CADR Calculator
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Deterministic room-sizing formula for clean air delivery rate.
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      Area (m²)
                      <input
                        type="number"
                        min={4}
                        max={250}
                        value={roomAreaM2}
                        onChange={(e) => setRoomAreaM2(Number(e.target.value) || 10)}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      Ceiling (m)
                      <input
                        type="number"
                        step={0.1}
                        min={2}
                        max={6}
                        value={ceilingHeightM}
                        onChange={(e) => setCeilingHeightM(Number(e.target.value) || 2.5)}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      Target ACH
                      <select
                        value={targetAch}
                        onChange={(e) => setTargetAch(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-900 dark:text-slate-100"
                      >
                        <option value={3}>3 ACH</option>
                        <option value={4}>4 ACH</option>
                        <option value={5}>5 ACH</option>
                        <option value={6}>6 ACH</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex items-baseline justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Minimum Smoke CADR</p>
                      <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {cadr.recommendedCadrM3h} <span className="text-xs font-normal text-slate-500">m³/h</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Imperial Equivalent</p>
                      <p className="text-lg font-semibold font-mono tabular-nums text-sky-700 dark:text-sky-400">
                        {cadr.recommendedCadrCfm} CFM
                      </p>
                    </div>
                  </div>
                </div>

                <ul className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400 list-disc pl-4">
                  {cadr.assumptions.slice(0, 2).map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: SMART TRAVEL PLANNER */}
      {tab === 'travel' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{copy.travelPlannerTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {travelComparison.methodologyNote}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  One-Way Trip Distance (km)
                  <input
                    type="number"
                    min={0.5}
                    max={300}
                    step={0.5}
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(Math.max(0.5, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Trips per Week
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={tripsPerWeek}
                    onChange={(e) => setTripsPerWeek(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100"
                  />
                </label>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Annualized Distance</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {travelComparison.annualDistanceKm.toLocaleString()} km/yr
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 text-left font-medium">Mode</th>
                      <th className="py-2 px-3 text-right font-medium">CO2e / Trip</th>
                      <th className="py-2 px-3 text-right font-medium">PM2.5 / Trip</th>
                      <th className="py-2 px-3 text-right font-medium">NOx / Trip</th>
                      <th className="py-2 px-3 text-right font-medium">vs Solo Petrol</th>
                      <th className="py-2 pl-3 text-left font-medium">Exposure & Practical Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {travelComparison.modes.map((m) => (
                      <tr key={m.mode} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {m.label}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {m.co2Kg.toFixed(2)} kg
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {m.pm25Mg} mg
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {m.noxMg} mg
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                          {m.savingsVsPetrolPct > 0 ? `-${m.savingsVsPetrolPct}%` : 'Baseline'}
                        </td>
                        <td className="py-2.5 pl-3 text-slate-600 dark:text-slate-300 leading-snug">
                          {m.exposureContext}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                <strong>Transparency Note:</strong> {travelComparison.routeSafetyDisclaimer}
              </p>
            </div>

            <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
              {!lowDataMode && !travelImgError && (
                <div className="h-44 w-full bg-slate-200 dark:bg-slate-800">
                  <img
                    src="/src/assets/images/clean_commute_transit_1795179738809.jpg"
                    alt="Tree-lined city avenue with protected bicycle lane and electric tram"
                    referrerPolicy="no-referrer"
                    onError={() => setTravelImgError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-6 space-y-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Smog-Aware Commute Tips
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  When {snapshot?.location.name ?? 'local'} AQI exceeds 100, enclosed electric rail or carpooling with cabin recirculation limits inhaled particulate dose compared to vigorous open-roadway exertion.
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  On clean days (AQI ≤ 50), shifting trips under 3 km to walking or cycling eliminates cold-start tailpipe emissions that disproportionately drive winter urban smog.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: PERSONAL IMPACT & SUSTAINABLE LIFESTYLE */}
      {tab === 'impact' && (
        <div className="space-y-6">
          {/* Distinction Banner */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{copy.impactDashboardTitle}</h2>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {summary?.distinctionNotice ??
                'Estimated emission reductions reflect avoided tailpipe/combustion output. Exposure-managed hours reflect personal indoor protection. Neither metric is presented as proven reduction in city-wide ambient AQI.'}
            </p>
          </div>

          {/* 3 Separated Impact Categories */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">1. Est. Emission Reduction (Carbon)</p>
              <p className="mt-1.5 text-3xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                {summary?.totalCo2SavedKg ?? 0} <span className="text-xs font-normal">kg CO2e</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Modeled from logged transport, heating, and waste swaps
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">2. Est. Local PM2.5 Avoided</p>
              <p className="mt-1.5 text-3xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-300">
                {summary?.totalPm25AvoidedG ?? 0} <span className="text-xs font-normal">g PM2.5</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Prevented source output; does not equate to measurable city AQI shift
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">3. Personal Exposure-Management</p>
              <p className="mt-1.5 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {summary?.totalExposureHoursManaged ?? 0} <span className="text-xs font-normal">hrs</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Hours protected indoors via filtration or peak-smog schedule shifts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Log Action Form */}
            <form
              onSubmit={handleLogImpact}
              className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Log Sustainable Action</h3>
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                Action Type
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {Object.entries(IMPACT_ACTION_CATALOG).map(([key, spec]) => (
                    <option key={key} value={key}>
                      {spec.label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong>Assumption:</strong> {IMPACT_ACTION_CATALOG[selectedAction]?.assumption}
              </p>

              <label className="block text-xs text-slate-600 dark:text-slate-300">
                Optional Context Note
                <input
                  type="text"
                  maxLength={240}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g., Morning commute during haze advisory"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </label>

              {impactMsg && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {impactMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={impactBusy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {user ? 'Log Action' : 'Sign In to Save Impact Log'}
              </button>
            </form>

            {/* Logged Entries Table */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Logged Actions</h3>
              {entries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                  {user
                    ? 'No actions logged yet. Select an everyday swap on the left to begin tracking.'
                    : 'Sign in via Household & Settings to save and review your personal environmental impact log.'}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.map((e) => (
                    <li key={e.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{e.label}</p>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          -{e.co2SavedKg} kg CO2e · -{e.pm25AvoidedG} g PM2.5 · {e.exposureHoursManaged}h exposure managed ·{' '}
                          {new Date(e.loggedAt).toLocaleDateString()}
                        </p>
                        {e.notes && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{e.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteImpact(e.id)}
                        aria-label={`Delete ${e.label}`}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
