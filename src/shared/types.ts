export type AqiStandard = 'US_EPA' | 'EU_EAQI' | 'IN_NAQI';
export type LanguageCode = 'en' | 'es' | 'hi' | 'fr';
export type UserRole = 'member' | 'moderator' | 'admin';

export interface LocationOption {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface PollutantReadings {
  pm25: number | null; // ug/m3
  pm10: number | null; // ug/m3
  no2: number | null; // ug/m3
  o3: number | null; // ug/m3
  so2: number | null; // ug/m3
  co: number | null; // ug/m3
}

export interface WeatherReadings {
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  boundaryLayerHeightM: number | null;
}

export interface AqiClassification {
  standard: AqiStandard;
  value: number;
  category: string;
  symbol: string;
  severityLevel: 1 | 2 | 3 | 4 | 5 | 6;
  colorToken: 'emerald' | 'amber' | 'orange' | 'rose' | 'purple' | 'maroon';
  shortAdvisory: string;
  dominantPollutant: string;
}

export interface HourlyForecastPoint {
  time: string;
  usAqi: number | null;
  euAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  temperatureC: number | null;
  windSpeedKmh: number | null;
}

export interface EnvironmentSnapshot {
  location: LocationOption;
  source: string;
  fetchedAt: string;
  stale: boolean;
  dataUnavailable: boolean;
  unavailableReason?: string;
  current: {
    observedAt: string;
    pollutants: PollutantReadings;
    weather: WeatherReadings;
    usAqi: number | null;
    euAqi: number | null;
    inNaqi: number | null;
    classification: AqiClassification;
    inversionRisk: 'low' | 'moderate' | 'high' | 'unknown';
    trendDirection: 'improving' | 'stable' | 'worsening' | 'unknown';
  };
  hourlyForecast: HourlyForecastPoint[];
}

export interface HistoricalDailyPoint {
  date: string;
  pm25Avg: number | null;
  pm25Max: number | null;
  pm10Avg: number | null;
  no2Avg: number | null;
  o3Avg: number | null;
  so2Avg: number | null;
  coAvg: number | null;
  usAqiMax: number | null;
}

export interface PollutionEventContext {
  id: string;
  startDate: string;
  endDate: string;
  peakDate: string;
  peakPm25: number;
  peakAqi: number;
  severity: 'moderate_elevated' | 'unhealthy_episode' | 'severe_smog';
  title: string;
  explanation: string;
}

export interface HistoricalAirQualityResponse {
  location: LocationOption;
  startDate: string;
  endDate: string;
  source: string;
  fetchedAt: string;
  stale: boolean;
  dataUnavailable: boolean;
  unavailableReason?: string;
  dailySeries: HistoricalDailyPoint[];
  events: PollutionEventContext[];
  weeklySummary: {
    avgPm25: number | null;
    avgPm10: number | null;
    avgNo2: number | null;
    avgO3: number | null;
    exceedanceDays: number;
    cleanDays: number;
    deltaVsPriorWeekPct: number | null;
  };
}

export type HouseholdGroup =
  | 'young_children'
  | 'older_adults'
  | 'outdoor_workers'
  | 'daily_commuters'
  | 'indoor_focused';

export type ExposureConsideration =
  | 'respiratory_sensitivity'
  | 'cardiovascular_caution'
  | 'outdoor_exercise_routine'
  | 'wood_or_biomass_neighborhood'
  | 'high_traffic_corridor';

export interface RoutineSchedule {
  schoolRunTime: string;
  commuteTime: string;
  exerciseWindow: string;
  workSchedule: 'standard_day' | 'early_shift' | 'remote_home' | 'outdoor_field';
}

export interface FamilyProfile {
  householdSize: number;
  memberGroups: HouseholdGroup[];
  exposureConsiderations: ExposureConsideration[];
  primaryCommuteMode: TravelModeId;
  ventilationType: 'natural_windows' | 'mechanical_hvac' | 'mixed';
  hasHepaPurifier: boolean;
  routines: RoutineSchedule;
  language: LanguageCode;
  aqiStandard: AqiStandard;
}

export type TravelModeId =
  | 'walking'
  | 'cycling'
  | 'public_transit'
  | 'carpool'
  | 'ev_car'
  | 'petrol_car'
  | 'diesel_car';

export interface TravelModeComparison {
  mode: TravelModeId;
  label: string;
  co2Kg: number;
  pm25Mg: number;
  noxMg: number;
  savingsVsPetrolPct: number;
  exposureContext: string;
  practicalAlternativeNote: string;
}

export interface TravelComparisonResult {
  distanceKm: number;
  tripsPerWeek: number;
  annualDistanceKm: number;
  modes: TravelModeComparison[];
  methodologyNote: string;
  routeSafetyDisclaimer: string;
}

export interface CadrCalculationResult {
  roomAreaM2: number;
  ceilingHeightM: number;
  roomVolumeM3: number;
  targetAch: number;
  recommendedCadrM3h: number;
  recommendedCadrCfm: number;
  assumptions: string[];
}

export interface ImpactLogEntry {
  id: string;
  category: 'transport' | 'energy' | 'waste' | 'indoor_exposure';
  actionKey: string;
  label: string;
  co2SavedKg: number;
  pm25AvoidedG: number;
  exposureHoursManaged: number;
  notes: string;
  loggedAt: string;
}

export interface ImpactSummary {
  totalCo2SavedKg: number;
  totalPm25AvoidedG: number;
  totalExposureHoursManaged: number;
  entryCount: number;
  distinctionNotice: string;
}

export interface AlertRule {
  id: string;
  locationName: string;
  latitude: number;
  longitude: number;
  aqiThreshold: number;
  pm25Threshold: number;
  notifyWorsening: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  locationName: string;
  observedAqi: number;
  thresholdAqi: number;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export type CommunityPostType = 'observation' | 'initiative' | 'public_bulletin';
export type CommunityPostStatus = 'active' | 'flagged' | 'hidden' | 'verified';

export interface CommunityComment {
  id: string;
  postId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  postType: CommunityPostType;
  category: string;
  title: string;
  body: string;
  areaLabel: string;
  city: string;
  status: CommunityPostStatus;
  isOfficialAqi: false; // User posts are never official AQI data
  sourceLabel: string;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  commentCount: number;
  comments?: CommunityComment[];
  createdAt: string;
}

export interface CommunityReport {
  id: string;
  postId: string;
  postTitle: string;
  postType: CommunityPostType;
  postStatus: CommunityPostStatus;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface AssistantRecommendation {
  title: string;
  category: 'daily_routine' | 'indoor_air' | 'travel' | 'lifestyle' | 'exposure_reduction';
  whyRelevant: string;
  actionSteps: string[];
  expectedBenefit: string;
  confidenceBasis: string;
}

export interface AssistantStructuredResponse {
  modelUsed: string;
  thinkingMode: 'fast' | 'deep';
  answerSummary: string;
  recommendations: AssistantRecommendation[];
  safetyNotice: string;
  dataLimitations: string;
  sourcesUsed: string[];
  generatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}
