import { z } from 'zod';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*prompt/i,
  /reveal\s+(your\s+)?(instructions|api\s*key|secrets?)/i,
  /you\s+are\s+now\s+(dan|jailbreak|unrestricted)/i,
  /<\/?(system|developer|tool_call|function_call)>/i,
];

export function hasPromptInjectionSignals(input: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(input));
}

export function sanitizePlainText(input: string, maxLength = 2000): string {
  // Strip control characters except newlines/tabs, trim, bound length
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export const CoordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  name: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(80).optional(),
  standard: z.enum(['US_EPA', 'EU_EAQI', 'IN_NAQI']).optional(),
});

export const HistoryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(80).optional(),
});

export const RegisterSchema = z.object({
  email: z.string().trim().email().max(160),
  displayName: z.string().trim().min(2).max(60),
  password: z.string().min(8).max(128),
});

export const LoginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(128),
});

export const FamilyProfileSchema = z.object({
  householdSize: z.number().int().min(1).max(15),
  memberGroups: z
    .array(z.enum(['young_children', 'older_adults', 'outdoor_workers', 'daily_commuters', 'indoor_focused']))
    .max(5),
  exposureConsiderations: z
    .array(
      z.enum([
        'respiratory_sensitivity',
        'cardiovascular_caution',
        'outdoor_exercise_routine',
        'wood_or_biomass_neighborhood',
        'high_traffic_corridor',
      ])
    )
    .max(5),
  primaryCommuteMode: z.enum([
    'walking',
    'cycling',
    'public_transit',
    'carpool',
    'ev_car',
    'petrol_car',
    'diesel_car',
  ]),
  ventilationType: z.enum(['natural_windows', 'mechanical_hvac', 'mixed']),
  hasHepaPurifier: z.boolean(),
  routines: z.object({
    schoolRunTime: z.string().regex(/^\d{2}:\d{2}$/),
    commuteTime: z.string().regex(/^\d{2}:\d{2}$/),
    exerciseWindow: z.string().trim().min(2).max(40),
    workSchedule: z.enum(['standard_day', 'early_shift', 'remote_home', 'outdoor_field']),
  }),
  language: z.enum(['en', 'es', 'hi', 'fr']),
  aqiStandard: z.enum(['US_EPA', 'EU_EAQI', 'IN_NAQI']),
});

export const AlertRuleSchema = z.object({
  locationName: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  aqiThreshold: z.number().int().min(25).max(400),
  pm25Threshold: z.number().min(5).max(300),
  notifyWorsening: z.boolean(),
  enabled: z.boolean().default(true),
});

export const ImpactLogCreateSchema = z.object({
  actionKey: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(240).optional().default(''),
});

export const TravelCompareSchema = z.object({
  distanceKm: z.coerce.number().min(0.5).max(300),
  tripsPerWeek: z.coerce.number().int().min(1).max(28),
});

export const CommunityPostCreateSchema = z.object({
  postType: z.enum(['observation', 'initiative']),
  category: z.enum([
    'visible_smoke',
    'unusual_odor',
    'construction_dust',
    'traffic_idling',
    'clean_air_zone',
    'tree_planting',
    'filter_drive',
    'carpool_network',
  ]),
  title: z.string().trim().min(5).max(120),
  body: z.string().trim().min(15).max(1200),
  areaLabel: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
});

export const CommunityCommentCreateSchema = z.object({
  body: z.string().trim().min(2).max(500),
});

export const CommunityReportCreateSchema = z.object({
  reason: z.enum(['misinformation', 'personal_info_pii', 'spam_or_abuse', 'medical_claim', 'off_topic']),
  details: z.string().trim().max(400).optional().default(''),
});

export const ModerationActionSchema = z.object({
  action: z.enum(['approve_post', 'hide_post', 'dismiss_report']),
  notes: z.string().trim().max(300).optional().default(''),
});

export const AssistantQuerySchema = z.object({
  question: z.string().trim().min(3).max(800),
  thinkingMode: z.enum(['fast', 'deep']).default('fast'),
  language: z.enum(['en', 'es', 'hi', 'fr']).default('en'),
  location: z.object({
    name: z.string().trim().min(1).max(120),
    country: z.string().trim().max(80).default(''),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  standard: z.enum(['US_EPA', 'EU_EAQI', 'IN_NAQI']).default('US_EPA'),
  profileOverride: FamilyProfileSchema.optional(),
});
