import React, { useState } from 'react';
import { Bell, Download, LogOut, Trash2, Users, X } from 'lucide-react';
import type {
  AlertRule,
  AuthUser,
  ExposureConsideration,
  FamilyProfile,
  HouseholdGroup,
  LanguageCode,
  LocationOption,
} from '../shared/types.ts';
import { LANGUAGE_LABELS } from '../shared/i18n.ts';
import { api } from '../services/api.ts';
import { PWAInstallButton } from './PWAComponents.tsx';

interface SettingsDrawerProps {
  open: boolean;
  initialTab: 'account' | 'family' | 'alerts';
  onClose: () => void;
  user: AuthUser | null;
  profile: FamilyProfile;
  location: LocationOption;
  alertRules: AlertRule[];
  darkMode: boolean;
  lowDataMode: boolean;
  onToggleDark: () => void;
  onToggleLowData: () => void;
  onUpdateProfile: (p: FamilyProfile) => Promise<void>;
  onAuthChanged: () => void;
  onAlertsChanged: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  initialTab,
  onClose,
  user,
  profile,
  location,
  alertRules,
  darkMode,
  lowDataMode,
  onToggleDark,
  onToggleLowData,
  onUpdateProfile,
  onAuthChanged,
  onAlertsChanged,
}) => {
  const [tab, setTab] = useState<'account' | 'family' | 'alerts'>(initialTab);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draftProfile, setDraftProfile] = useState<FamilyProfile>(profile);
  const [aqiThreshold, setAqiThreshold] = useState(125);
  const [pm25Threshold, setPm25Threshold] = useState(35);
  const [notifyWorsening, setNotifyWorsening] = useState(true);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setDraftProfile(profile);
      setErrorMsg(null);
      setStatusMsg(null);
    }
  }, [open, initialTab, profile]);

  if (!open) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      if (authMode === 'login') {
        await api.login(email, password);
      } else {
        await api.register(email, displayName, password);
      }
      setPassword('');
      onAuthChanged();
      setStatusMsg('Signed in securely.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    onAuthChanged();
    setStatusMsg('Signed out.');
  };

  const handleExport = async () => {
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clearair-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.deleteMyData();
      onAuthChanged();
      setStatusMsg('Your account and stored records have been permanently deleted.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Deletion failed.');
    }
  };

  const toggleGroup = (g: HouseholdGroup) => {
    setDraftProfile((p) => ({
      ...p,
      memberGroups: p.memberGroups.includes(g) ? p.memberGroups.filter((x) => x !== g) : [...p.memberGroups, g],
    }));
  };

  const toggleConsideration = (c: ExposureConsideration) => {
    setDraftProfile((p) => ({
      ...p,
      exposureConsiderations: p.exposureConsiderations.includes(c)
        ? p.exposureConsiderations.filter((x) => x !== c)
        : [...p.exposureConsiderations, c],
    }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await onUpdateProfile(draftProfile);
      setStatusMsg(user ? 'Household profile saved to your account.' : 'Household profile applied for this session.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    }
  };

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setTab('account');
      setErrorMsg('Please sign in first to persist pollution alert thresholds.');
      return;
    }
    try {
      await api.createAlert({
        locationName: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        aqiThreshold,
        pm25Threshold,
        notifyWorsening,
        enabled: true,
      });
      await api.evaluateAlerts();
      onAlertsChanged();
      setStatusMsg(`Alert threshold saved for ${location.name}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create alert rule.');
    }
  };

  const handleBrowserNotifyPermission = async () => {
    if (!('Notification' in window)) {
      setErrorMsg('Browser notifications are not supported on this device.');
      return;
    }
    const perm = await Notification.requestPermission();
    setStatusMsg(`Browser notification permission: ${perm}.`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Household, Alerts, and Account Settings"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full overflow-y-auto p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Household & Settings</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings drawer"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {[
              { id: 'family' as const, label: 'Family Profile' },
              { id: 'alerts' as const, label: 'Alerts' },
              { id: 'account' as const, label: 'Account & Privacy' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  tab === t.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="mt-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              {statusMsg}
            </div>
          )}

          {/* FAMILY PROFILE TAB */}
          {tab === 'family' && (
            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                No sensitive medical diagnoses or street addresses required. Preferences tailor AI routines and ventilation advice.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-slate-700 dark:text-slate-300">
                  Household Size
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={draftProfile.householdSize}
                    onChange={(e) =>
                      setDraftProfile((p) => ({ ...p, householdSize: Number(e.target.value) || 1 }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="text-slate-700 dark:text-slate-300">
                  Primary Commute
                  <select
                    value={draftProfile.primaryCommuteMode}
                    onChange={(e) =>
                      setDraftProfile((p) => ({
                        ...p,
                        primaryCommuteMode: e.target.value as FamilyProfile['primaryCommuteMode'],
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    <option value="walking">Walking</option>
                    <option value="cycling">Cycling</option>
                    <option value="public_transit">Public Transit</option>
                    <option value="carpool">Carpool</option>
                    <option value="ev_car">Electric Car</option>
                    <option value="petrol_car">Petrol Car</option>
                    <option value="diesel_car">Diesel Car</option>
                  </select>
                </label>
              </div>

              <div>
                <span className="block text-slate-700 dark:text-slate-300 mb-1.5">Household Member Groups</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['young_children', 'Young children'],
                      ['older_adults', 'Older adults'],
                      ['outdoor_workers', 'Outdoor workers'],
                      ['daily_commuters', 'Daily commuters'],
                      ['indoor_focused', 'Indoor-focused'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <label key={val} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftProfile.memberGroups.includes(val)}
                        onChange={() => toggleGroup(val)}
                      />
                      <span>{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-slate-700 dark:text-slate-300 mb-1.5">General Exposure Considerations</span>
                <div className="space-y-1.5">
                  {(
                    [
                      ['respiratory_sensitivity', 'Sensitive airways / breathing comfort'],
                      ['cardiovascular_caution', 'Cardiovascular caution during haze'],
                      ['outdoor_exercise_routine', 'Regular outdoor exercise routine'],
                      ['wood_or_biomass_neighborhood', 'Nearby wood or biomass heating'],
                      ['high_traffic_corridor', 'Lives near busy roadway corridor'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <label key={val} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftProfile.exposureConsiderations.includes(val)}
                        onChange={() => toggleConsideration(val)}
                      />
                      <span>{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-slate-700 dark:text-slate-300">
                  School Run Time
                  <input
                    type="time"
                    value={draftProfile.routines.schoolRunTime}
                    onChange={(e) =>
                      setDraftProfile((p) => ({
                        ...p,
                        routines: { ...p.routines, schoolRunTime: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="text-slate-700 dark:text-slate-300">
                  Commute Time
                  <input
                    type="time"
                    value={draftProfile.routines.commuteTime}
                    onChange={(e) =>
                      setDraftProfile((p) => ({
                        ...p,
                        routines: { ...p.routines, commuteTime: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftProfile.hasHepaPurifier}
                  onChange={(e) => setDraftProfile((p) => ({ ...p, hasHepaPurifier: e.target.checked }))}
                />
                <span>Household has a True HEPA indoor air purifier</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-slate-700 dark:text-slate-300">
                  Language
                  <select
                    value={draftProfile.language}
                    onChange={(e) =>
                      setDraftProfile((p) => ({ ...p, language: e.target.value as LanguageCode }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-slate-700 dark:text-slate-300">
                  AQI Standard
                  <select
                    value={draftProfile.aqiStandard}
                    onChange={(e) =>
                      setDraftProfile((p) => ({
                        ...p,
                        aqiStandard: e.target.value as FamilyProfile['aqiStandard'],
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    <option value="US_EPA">US EPA AQI</option>
                    <option value="EU_EAQI">European EAQI</option>
                    <option value="IN_NAQI">India NAQI</option>
                  </select>
                </label>
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 py-2.5 text-xs font-medium text-white cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                Save Household Preferences
              </button>
            </form>
          )}

          {/* ALERTS TAB */}
          {tab === 'alerts' && (
            <div className="mt-5 space-y-5 text-xs">
              <form onSubmit={handleAddAlert} className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  New Threshold Alert ({location.name})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-slate-700 dark:text-slate-300">
                    US AQI Threshold
                    <input
                      type="number"
                      min={25}
                      max={400}
                      value={aqiThreshold}
                      onChange={(e) => setAqiThreshold(Number(e.target.value) || 100)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="text-slate-700 dark:text-slate-300">
                    PM2.5 Threshold (µg/m³)
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={pm25Threshold}
                      onChange={(e) => setPm25Threshold(Number(e.target.value) || 35)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 font-mono text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyWorsening}
                    onChange={(e) => setNotifyWorsening(e.target.checked)}
                  />
                  <span>Alert on worsening 6-hour forecast trend</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-2 font-medium text-white cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                    Save Alert Rule
                  </button>
                  <button
                    type="button"
                    onClick={handleBrowserNotifyPermission}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Enable Browser Alerts
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Configured Rules</h4>
                {alertRules.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">
                    {user ? 'No alert rules configured yet.' : 'Sign in to manage persistent threshold alert rules.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {alertRules.map((r) => (
                      <li key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{r.locationName}</p>
                          <p className="font-mono text-slate-500 dark:text-slate-400">
                            AQI ≥ {r.aqiThreshold} · PM2.5 ≥ {r.pm25Threshold} µg/m³
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.toggleAlert(r.id, !r.enabled);
                              onAlertsChanged();
                            }}
                            className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            {r.enabled ? 'Pause' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.deleteAlert(r.id);
                              onAlertsChanged();
                            }}
                            aria-label={`Delete alert rule for ${r.locationName}`}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ACCOUNT & PRIVACY TAB */}
          {tab === 'account' && (
            <div className="mt-5 space-y-5 text-xs">
              {user ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.displayName}</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      {user.email} · Role: {user.role}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleExport}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Export My Data (JSON)
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      Sign Out
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-2 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete Account & All Stored Data
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className={`py-1.5 rounded-md font-medium cursor-pointer ${
                        authMode === 'login' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100' : 'text-slate-500'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className={`py-1.5 rounded-md font-medium cursor-pointer ${
                        authMode === 'register' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100' : 'text-slate-500'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  {authMode === 'register' && (
                    <label className="block text-slate-700 dark:text-slate-300">
                      Display Name (public community name)
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </label>
                  )}

                  <label className="block text-slate-700 dark:text-slate-300">
                    Email
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <label className="block text-slate-700 dark:text-slate-300">
                    Password (min 8 chars)
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 py-2.5 font-medium text-white cursor-pointer"
                  >
                    {authMode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>

                  {authMode === 'login' && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <p className="text-slate-500 dark:text-slate-400">Evaluation accounts (for testing roles):</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEmail('family@clearair.example');
                            setPassword('ClearAirFamily2026!');
                          }}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Fill Demo Member
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEmail('moderator@clearair.example');
                            setPassword('ClearAirMod2026!');
                          }}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Fill Demo Moderator
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Bottom Display & PWA Controls */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">Theme</span>
            <button
              type="button"
              onClick={onToggleDark}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              {darkMode ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">Low-Data Mode</span>
            <button
              type="button"
              onClick={onToggleLowData}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              {lowDataMode ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">Install ClearAir AI</span>
            <PWAInstallButton />
          </div>
        </div>
      </div>
    </div>
  );
};
