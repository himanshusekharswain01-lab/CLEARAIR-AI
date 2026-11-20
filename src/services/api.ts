import type {
  AlertEvent,
  AlertRule,
  AqiStandard,
  AssistantStructuredResponse,
  AuthUser,
  CadrCalculationResult,
  CommunityComment,
  CommunityPost,
  CommunityReport,
  EnvironmentSnapshot,
  FamilyProfile,
  HistoricalAirQualityResponse,
  ImpactLogEntry,
  ImpactSummary,
  LanguageCode,
  LocationOption,
  TravelComparisonResult,
} from '../shared/types.ts';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCookie('clearair_csrf');
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed with status ${res.status}`);
  }
  return payload as T;
}

export const api = {
  getMe: () => apiRequest<{ user: AuthUser | null; csrfToken: string | null }>('/api/auth/me'),

  register: (email: string, displayName: string, password: string) =>
    apiRequest<{ user: AuthUser; csrfToken: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, displayName, password }),
    }),

  login: (email: string, password: string) =>
    apiRequest<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  exportMyData: () => apiRequest<Record<string, unknown>>('/api/auth/data-export'),

  deleteMyData: () => apiRequest<{ deleted: boolean }>('/api/auth/data', { method: 'DELETE' }),

  searchLocations: (q: string) =>
    apiRequest<{ results: LocationOption[]; presets: LocationOption[] }>(
      `/api/locations/search?q=${encodeURIComponent(q)}`
    ),

  getCurrentEnvironment: (loc: LocationOption, standard: AqiStandard) =>
    apiRequest<EnvironmentSnapshot>(
      `/api/environment/current?lat=${loc.latitude}&lon=${loc.longitude}&name=${encodeURIComponent(loc.name)}&country=${encodeURIComponent(loc.country)}&standard=${standard}`
    ),

  getHistoricalAirQuality: (loc: LocationOption, startDate: string, endDate: string) =>
    apiRequest<HistoricalAirQualityResponse>(
      `/api/environment/history?lat=${loc.latitude}&lon=${loc.longitude}&startDate=${startDate}&endDate=${endDate}&name=${encodeURIComponent(loc.name)}&country=${encodeURIComponent(loc.country)}`
    ),

  getProfile: () => apiRequest<{ profile: FamilyProfile; persisted: boolean }>('/api/profile'),

  saveProfile: (profile: FamilyProfile) =>
    apiRequest<{ profile: FamilyProfile; persisted: boolean }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),

  getAlerts: () => apiRequest<{ rules: AlertRule[]; events: AlertEvent[] }>('/api/alerts'),

  createAlert: (rule: Omit<AlertRule, 'id' | 'createdAt'>) =>
    apiRequest<{ rule: AlertRule }>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  toggleAlert: (id: string, enabled: boolean) =>
    apiRequest<{ ok: boolean }>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  deleteAlert: (id: string) => apiRequest<{ deleted: boolean }>(`/api/alerts/${id}`, { method: 'DELETE' }),

  acknowledgeAlertEvent: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/alerts/events/${id}/ack`, { method: 'POST' }),

  evaluateAlerts: () => apiRequest<{ triggered: AlertEvent[] }>('/api/alerts/evaluate', { method: 'POST' }),

  compareTravel: (distanceKm: number, tripsPerWeek: number) =>
    apiRequest<TravelComparisonResult>(`/api/travel/compare?distanceKm=${distanceKm}&tripsPerWeek=${tripsPerWeek}`),

  calculateCadr: (areaM2: number, heightM: number, ach: number) =>
    apiRequest<CadrCalculationResult>(`/api/indoor/cadr?areaM2=${areaM2}&heightM=${heightM}&ach=${ach}`),

  getImpact: () =>
    apiRequest<{
      catalog: Record<
        string,
        {
          category: 'transport' | 'energy' | 'waste' | 'indoor_exposure';
          label: string;
          co2SavedKg: number;
          pm25AvoidedG: number;
          exposureHoursManaged: number;
          assumption: string;
        }
      >;
      entries: ImpactLogEntry[];
      summary: ImpactSummary;
    }>('/api/impact'),

  logImpact: (actionKey: string, notes: string) =>
    apiRequest<{ entry: ImpactLogEntry }>('/api/impact', {
      method: 'POST',
      body: JSON.stringify({ actionKey, notes }),
    }),

  deleteImpact: (id: string) => apiRequest<{ deleted: boolean }>(`/api/impact/${id}`, { method: 'DELETE' }),

  listCommunityPosts: (type: string, city: string) =>
    apiRequest<{ posts: CommunityPost[] }>(
      `/api/community/posts?type=${encodeURIComponent(type)}&city=${encodeURIComponent(city)}`
    ),

  createCommunityPost: (payload: {
    postType: 'observation' | 'initiative';
    category: string;
    title: string;
    body: string;
    areaLabel: string;
    city: string;
  }) =>
    apiRequest<{ post: CommunityPost }>('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCommunityPost: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/community/posts/${id}`, { method: 'DELETE' }),

  togglePostVote: (id: string) =>
    apiRequest<{ upvoteCount: number; viewerHasUpvoted: boolean }>(`/api/community/posts/${id}/vote`, {
      method: 'POST',
    }),

  addPostComment: (id: string, body: string) =>
    apiRequest<{ comment: CommunityComment }>(`/api/community/posts/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  reportPost: (id: string, reason: string, details: string) =>
    apiRequest<{ reportId: string }>(`/api/community/posts/${id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }),

  listModerationReports: () => apiRequest<{ reports: CommunityReport[] }>('/api/moderation/reports'),

  moderateReport: (reportId: string, action: 'approve_post' | 'hide_post' | 'dismiss_report', notes: string) =>
    apiRequest<{ ok: boolean }>(`/api/moderation/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, notes }),
    }),

  queryAssistant: (payload: {
    question: string;
    thinkingMode: 'fast' | 'deep';
    language: LanguageCode;
    location: LocationOption;
    standard: AqiStandard;
    profileOverride?: FamilyProfile;
  }) =>
    apiRequest<{ advice: AssistantStructuredResponse; environmentSource: string; stale: boolean }>(
      '/api/assistant/query',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
};
