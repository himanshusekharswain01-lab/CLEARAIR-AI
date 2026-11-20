import React, { useCallback, useEffect, useState } from 'react';
import { Globe, MapPin, Moon, Search, Sun, Wifi } from 'lucide-react';
import type {
  AlertEvent,
  AlertRule,
  AqiStandard,
  AuthUser,
  EnvironmentSnapshot,
  FamilyProfile,
  LanguageCode,
  LocationOption,
} from './shared/types.ts';
import { LANGUAGE_LABELS, UI_COPY } from './shared/i18n.ts';
import { api } from './services/api.ts';
import { DashboardView } from './components/DashboardView.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { AssistantView } from './components/AssistantView.tsx';
import { PlannersView } from './components/PlannersView.tsx';
import { CommunityView } from './components/CommunityView.tsx';
import { SettingsDrawer } from './components/SettingsDrawer.tsx';
import { OfflineIndicator } from './components/PWAComponents.tsx';

type NavSection = 'dashboard' | 'history' | 'assistant' | 'planners' | 'community';

const DEFAULT_LOCATION: LocationOption = {
  id: 'delhi',
  name: 'New Delhi',
  admin1: 'Delhi',
  country: 'India',
  latitude: 28.6139,
  longitude: 77.209,
  timezone: 'Asia/Kolkata',
};

const QUICK_LOCATIONS: LocationOption[] = [
  DEFAULT_LOCATION,
  { id: 'london', name: 'London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276 },
  { id: 'oslo', name: 'Oslo', country: 'Norway', latitude: 59.9139, longitude: 10.7522 },
  { id: 'sf', name: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 },
];

const INITIAL_PROFILE: FamilyProfile = {
  householdSize: 3,
  memberGroups: ['young_children', 'daily_commuters'],
  exposureConsiderations: ['outdoor_exercise_routine'],
  primaryCommuteMode: 'public_transit',
  ventilationType: 'mixed',
  hasHepaPurifier: true,
  routines: {
    schoolRunTime: '08:00',
    commuteTime: '08:30',
    exerciseWindow: '17:30-18:30',
    workSchedule: 'standard_day',
  },
  language: 'en',
  aqiStandard: 'US_EPA',
};

export default function App() {
  const [section, setSection] = useState<NavSection>('dashboard');
  const [location, setLocation] = useState<LocationOption>(() => {
    try {
      const saved = localStorage.getItem('clearair_location');
      return saved ? (JSON.parse(saved) as LocationOption) : DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  });
  const [gpsEnabled, setGpsEnabled] = useState(false);

  const [standard, setStandard] = useState<AqiStandard>('US_EPA');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('clearair_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [lowDataMode, setLowDataMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('clearair_low_data') === 'true';
    } catch {
      return false;
    }
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<FamilyProfile>(INITIAL_PROFILE);
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot | null>(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);

  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);

  // Location Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationOption[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Drawer & Assistant handoff
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'account' | 'family' | 'alerts'>('family');
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);

  const copy = UI_COPY[language];

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('clearair_theme', darkMode ? 'dark' : 'light');
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('clearair_low_data', String(lowDataMode));
    } catch {}
  }, [lowDataMode]);

  useEffect(() => {
    try {
      localStorage.setItem('clearair_location', JSON.stringify(location));
    } catch {}
  }, [location]);

  const loadSessionAndProfile = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me.user);
      const profRes = await api.getProfile();
      setProfile(profRes.profile);
      setLanguage(profRes.profile.language);
      setStandard(profRes.profile.aqiStandard);
      if (me.user) {
        const alr = await api.getAlerts();
        setAlertRules(alr.rules);
        setAlertEvents(alr.events);
      } else {
        setAlertRules([]);
        setAlertEvents([]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadSessionAndProfile();
  }, [loadSessionAndProfile]);

  const fetchEnvironment = useCallback(async () => {
    setEnvLoading(true);
    setEnvError(null);
    try {
      const data = await api.getCurrentEnvironment(location, standard);
      setSnapshot(data);
      try {
        localStorage.setItem('clearair_last_snapshot', JSON.stringify(data));
      } catch {}
    } catch (err) {
      try {
        const cachedRaw = localStorage.getItem('clearair_last_snapshot');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw) as EnvironmentSnapshot;
          setSnapshot({ ...parsed, stale: true });
          setEnvLoading(false);
          return;
        }
      } catch {}
      setEnvError(err instanceof Error ? err.message : 'Unable to fetch air quality data.');
    } finally {
      setEnvLoading(false);
    }
  }, [location, standard]);

  useEffect(() => {
    fetchEnvironment();
  }, [fetchEnvironment]);

  const handleSearchLocations = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    try {
      const res = await api.searchLocations(q);
      setSearchResults(res.results);
      setShowSearchDropdown(true);
    } catch {}
  };

  const handleSelectLocation = (loc: LocationOption) => {
    setLocation(loc);
    setSearchQuery('');
    setShowSearchDropdown(false);
    setGpsEnabled(false);
  };

  const handleUseGps = () => {
    if (gpsEnabled) {
      setGpsEnabled(false);
      setLocation(DEFAULT_LOCATION);
      return;
    }
    if (!('geolocation' in navigator)) {
      setEnvError('Geolocation is unavailable in this browser. Please select a city manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsEnabled(true);
        setLocation({
          id: 'gps-current',
          name: 'Current Location',
          country: '',
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
        });
      },
      () => {
        setEnvError('Location permission declined. You can search or pick a city manually.');
      },
      { enableHighAccuracy: false, timeout: 7000 }
    );
  };

  const handleUpdateProfile = async (nextProfile: FamilyProfile) => {
    setProfile(nextProfile);
    setLanguage(nextProfile.language);
    setStandard(nextProfile.aqiStandard);
    if (user) {
      await api.saveProfile(nextProfile);
    }
  };

  const navItems: Array<{ id: NavSection; label: string }> = [
    { id: 'dashboard', label: copy.navDashboard },
    { id: 'history', label: copy.navHistory },
    { id: 'assistant', label: copy.navAssistant },
    { id: 'planners', label: copy.navPlanners },
    { id: 'community', label: copy.navCommunity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-sky-600 focus:px-3 focus:py-2 focus:text-xs focus:text-white"
      >
        Skip to main content
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setSection('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            ClearAir AI
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-sky-600 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('family');
                setDrawerOpen(true);
              }}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-medium text-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copy.householdSettings}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip (Compact, < 10% viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 flex items-center gap-2 overflow-x-auto"
      >
        {navItems.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Workspace Control Strip (Location Search, GPS, AQI Standard, Language, Theme, Low-Data) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Location Search & Quick Presets */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-64">
            <div className="relative flex-1 max-w-xs">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchLocations(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder={copy.searchLocationPlaceholder}
                aria-label="Search city or location"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
                >
                  {searchResults.map((loc) => (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectLocation(loc)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
                      >
                        <span className="font-medium">{loc.name}</span>
                        {loc.admin1 ? `, ${loc.admin1}` : ''}
                        {loc.country ? ` · ${loc.country}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={handleUseGps}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                gpsEnabled
                  ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {gpsEnabled ? copy.revokeLocation : copy.useMyLocation}
            </button>

            <div className="hidden lg:flex items-center gap-1.5">
              {QUICK_LOCATIONS.map((ql) => (
                <button
                  key={ql.id}
                  type="button"
                  onClick={() => handleSelectLocation(ql)}
                  className={`px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                    location.name === ql.name
                      ? 'bg-slate-200 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {ql.name}
                </button>
              ))}
            </div>
          </div>

          {/* Standard, Language, Theme & Low-Data Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="aqi-standard-select">
              AQI Standard
            </label>
            <select
              id="aqi-standard-select"
              value={standard}
              onChange={(e) => setStandard(e.target.value as AqiStandard)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
            >
              <option value="US_EPA">US EPA</option>
              <option value="EU_EAQI">EU EAQI</option>
              <option value="IN_NAQI">IN NAQI</option>
            </select>

            <label className="sr-only" htmlFor="language-select">
              Language
            </label>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                {Object.entries(LANGUAGE_LABELS).map(([code, lbl]) => (
                  <option key={code} value={code} className="bg-white dark:bg-slate-900">
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setLowDataMode((v) => !v)}
              aria-pressed={lowDataMode}
              title={copy.lowDataMode}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                lowDataMode
                  ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{copy.lowDataMode}</span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              aria-label={darkMode ? copy.lightMode : copy.darkMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {section === 'dashboard' && (
          <DashboardView
            snapshot={snapshot}
            loading={envLoading}
            error={envError}
            standard={standard}
            language={language}
            profile={profile}
            lowDataMode={lowDataMode}
            alertRules={alertRules}
            alertEvents={alertEvents}
            onRefresh={fetchEnvironment}
            onAckAlert={async (id) => {
              await api.acknowledgeAlertEvent(id);
              loadSessionAndProfile();
            }}
            onOpenSettings={(tab) => {
              setDrawerTab(tab);
              setDrawerOpen(true);
            }}
            onAskAssistant={(prompt) => {
              setPendingAssistantPrompt(prompt);
              setSection('assistant');
            }}
          />
        )}

        {section === 'history' && (
          <HistoryView location={location} language={language} lowDataMode={lowDataMode} />
        )}

        {section === 'assistant' && (
          <AssistantView
            location={location}
            standard={standard}
            language={language}
            profile={profile}
            snapshot={snapshot}
            pendingPrompt={pendingAssistantPrompt}
            onConsumePendingPrompt={() => setPendingAssistantPrompt(null)}
          />
        )}

        {section === 'planners' && (
          <PlannersView
            snapshot={snapshot}
            language={language}
            lowDataMode={lowDataMode}
            user={user}
            onOpenAuth={() => {
              setDrawerTab('account');
              setDrawerOpen(true);
            }}
          />
        )}

        {section === 'community' && (
          <CommunityView
            location={location}
            language={language}
            user={user}
            onOpenAuth={() => {
              setDrawerTab('account');
              setDrawerOpen(true);
            }}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>ClearAir AI · Environmental Intelligence Platform · Telemetry via Open-Meteo CAMS</span>
          <span>Informational guidance only — not a substitute for clinical care or emergency services.</span>
        </div>
      </footer>

      <SettingsDrawer
        open={drawerOpen}
        initialTab={drawerTab}
        onClose={() => setDrawerOpen(false)}
        user={user}
        profile={profile}
        location={location}
        alertRules={alertRules}
        darkMode={darkMode}
        lowDataMode={lowDataMode}
        onToggleDark={() => setDarkMode((v) => !v)}
        onToggleLowData={() => setLowDataMode((v) => !v)}
        onUpdateProfile={handleUpdateProfile}
        onAuthChanged={loadSessionAndProfile}
        onAlertsChanged={loadSessionAndProfile}
      />

      <OfflineIndicator />
    </div>
  );
}
