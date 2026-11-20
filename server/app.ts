import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import {
  calculateRecommendedCadr,
  compareTravelModes,
  IMPACT_ACTION_CATALOG,
} from '../src/shared/aqi.ts';
import type { AuthUser, ImpactSummary, LocationOption } from '../src/shared/types.ts';
import {
  AlertRuleSchema,
  AssistantQuerySchema,
  CommunityCommentCreateSchema,
  CommunityPostCreateSchema,
  CommunityReportCreateSchema,
  CoordinatesSchema,
  FamilyProfileSchema,
  HistoryQuerySchema,
  ImpactLogCreateSchema,
  LoginSchema,
  ModerationActionSchema,
  RegisterSchema,
  TravelCompareSchema,
  hasPromptInjectionSignals,
  sanitizePlainText,
} from '../src/shared/validation.ts';
import type { AIProvider } from './ai/provider.ts';
import { GeminiProvider } from './ai/geminiProvider.ts';
import { ClearAirRepository, DEFAULT_FAMILY_PROFILE, createDatabase } from './db.ts';
import {
  clearSessionCookies,
  createRateLimiter,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  setSessionCookies,
  verifyPassword,
} from './security.ts';
import {
  PRESET_LOCATIONS,
  getCurrentEnvironment,
  getHistoricalAirQuality,
  searchLocations,
} from './services/environmentService.ts';

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  csrfToken?: string;
  sessionTokenHash?: string;
}

export interface CreateAppOptions {
  dbPath?: string;
  aiProvider?: AIProvider;
}

export function createClearAirApp(options: CreateAppOptions = {}) {
  const dbInstance = createDatabase(options.dbPath);
  const repo = new ClearAirRepository(dbInstance.raw);
  const aiProvider: AIProvider = options.aiProvider ?? new GeminiProvider();

  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      frameguard: false, // Allow AI Studio preview iframe embedding
      contentSecurityPolicy: false,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 25, name: 'auth' });
  const aiLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20, name: 'ai' });
  const writeLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 60, name: 'write' });

  // Attach optional session user
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const rawToken = req.cookies?.clearair_session;
    if (typeof rawToken === 'string' && rawToken.length >= 16) {
      const tokenHash = hashToken(rawToken);
      const session = repo.findSession(tokenHash);
      if (session) {
        req.authUser = session.user;
        req.csrfToken = session.csrfToken;
        req.sessionTokenHash = tokenHash;
      }
    }
    next();
  });

  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required. Please sign in to perform this action.' });
      return;
    }
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const headerCsrf = req.headers['x-csrf-token'];
      if (typeof headerCsrf !== 'string' || headerCsrf !== req.csrfToken) {
        res.status(403).json({ error: 'Invalid or missing CSRF token.' });
        return;
      }
    }
    next();
  }

  function requireModerator(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.authUser.role !== 'moderator' && req.authUser.role !== 'admin') {
      res.status(403).json({ error: 'Moderator permissions required.' });
      return;
    }
    next();
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // --- Auth & Account Lifecycle ---
  app.post('/api/auth/register', authLimiter, (req: Request, res: Response) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration fields.', details: parsed.error.flatten() });
      return;
    }
    const existing = repo.findUserCredentialsByEmail(parsed.data.email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const user = repo.createUser(
      parsed.data.email,
      sanitizePlainText(parsed.data.displayName, 60),
      hashPassword(parsed.data.password),
      'member'
    );

    const sessionToken = generateOpaqueToken(32);
    const csrfToken = generateOpaqueToken(24);
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    repo.createSession(hashToken(sessionToken), user.id, csrfToken, new Date(Date.now() + maxAgeMs).toISOString());
    setSessionCookies(res, sessionToken, csrfToken, maxAgeMs);

    res.status(201).json({ user, csrfToken });
  });

  app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password format.' });
      return;
    }
    const found = repo.findUserCredentialsByEmail(parsed.data.email);
    if (!found || !verifyPassword(parsed.data.password, found.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const sessionToken = generateOpaqueToken(32);
    const csrfToken = generateOpaqueToken(24);
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    repo.createSession(hashToken(sessionToken), found.user.id, csrfToken, new Date(Date.now() + maxAgeMs).toISOString());
    setSessionCookies(res, sessionToken, csrfToken, maxAgeMs);

    res.json({ user: found.user, csrfToken });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (req.sessionTokenHash) {
      repo.deleteSession(req.sessionTokenHash);
    }
    clearSessionCookies(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
    if (!req.authUser) {
      res.json({ user: null, csrfToken: null });
      return;
    }
    res.json({ user: req.authUser, csrfToken: req.csrfToken ?? null });
  });

  app.get('/api/auth/data-export', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const data = repo.exportUserData(req.authUser!.id);
    res.json(data);
  });

  app.delete('/api/auth/data', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    repo.deleteUserAndData(req.authUser!.id);
    clearSessionCookies(res);
    res.json({ deleted: true });
  });

  // --- Environmental Telemetry & Locations ---
  app.get('/api/locations/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? sanitizePlainText(req.query.q, 80) : '';
    const results = await searchLocations(q);
    res.json({ results, presets: PRESET_LOCATIONS });
  });

  app.get('/api/environment/current', async (req: Request, res: Response) => {
    const parsed = CoordinatesSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
      return;
    }
    const location: LocationOption = {
      id: `${parsed.data.lat.toFixed(2)},${parsed.data.lon.toFixed(2)}`,
      name: parsed.data.name || `${parsed.data.lat.toFixed(2)}, ${parsed.data.lon.toFixed(2)}`,
      country: parsed.data.country || '',
      latitude: parsed.data.lat,
      longitude: parsed.data.lon,
    };
    const snapshot = await getCurrentEnvironment(repo, location, parsed.data.standard ?? 'US_EPA');
    res.json(snapshot);
  });

  app.get('/api/environment/history', async (req: Request, res: Response) => {
    const parsed = HistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid coordinates and YYYY-MM-DD startDate/endDate are required.' });
      return;
    }

    const startMs = Date.parse(parsed.data.startDate);
    const endMs = Date.parse(parsed.data.endDate);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
      res.status(400).json({ error: 'startDate must be on or before endDate.' });
      return;
    }
    const spanDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
    if (spanDays > 92) {
      res.status(400).json({ error: 'Date range cannot exceed 92 days per query.' });
      return;
    }

    const location: LocationOption = {
      id: `${parsed.data.lat.toFixed(2)},${parsed.data.lon.toFixed(2)}`,
      name: parsed.data.name || `${parsed.data.lat.toFixed(2)}, ${parsed.data.lon.toFixed(2)}`,
      country: parsed.data.country || '',
      latitude: parsed.data.lat,
      longitude: parsed.data.lon,
    };

    const history = await getHistoricalAirQuality(repo, location, parsed.data.startDate, parsed.data.endDate);
    res.json(history);
  });

  // --- Family Profile ---
  app.get('/api/profile', (req: AuthenticatedRequest, res: Response) => {
    if (!req.authUser) {
      res.json({ profile: DEFAULT_FAMILY_PROFILE, persisted: false });
      return;
    }
    res.json({ profile: repo.getFamilyProfile(req.authUser.id), persisted: true });
  });

  app.put('/api/profile', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = FamilyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid household profile configuration.', details: parsed.error.flatten() });
      return;
    }
    const saved = repo.saveFamilyProfile(req.authUser!.id, parsed.data);
    res.json({ profile: saved, persisted: true });
  });

  // --- Alerts & Thresholds ---
  app.get('/api/alerts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      rules: repo.listAlertRules(req.authUser!.id),
      events: repo.listAlertEvents(req.authUser!.id),
    });
  });

  app.post('/api/alerts', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = AlertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid alert threshold parameters.', details: parsed.error.flatten() });
      return;
    }
    const rule = repo.createAlertRule(req.authUser!.id, parsed.data);
    res.status(201).json({ rule });
  });

  app.patch('/api/alerts/:id', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    const updated = repo.toggleAlertRule(req.authUser!.id, req.params.id, enabled);
    if (!updated) {
      res.status(404).json({ error: 'Alert rule not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/alerts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const deleted = repo.deleteAlertRule(req.authUser!.id, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Alert rule not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/alerts/events/:id/ack', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const ok = repo.acknowledgeAlertEvent(req.authUser!.id, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Alert event not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/alerts/evaluate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rules = repo.listAlertRules(req.authUser!.id).filter((r) => r.enabled);
    const triggered = [];
    for (const rule of rules.slice(0, 5)) {
      const env = await getCurrentEnvironment(
        repo,
        { id: rule.id, name: rule.locationName, country: '', latitude: rule.latitude, longitude: rule.longitude },
        'US_EPA'
      );
      if (env.dataUnavailable) continue;
      const aqi = env.current.usAqi ?? 0;
      const pm25 = env.current.pollutants.pm25 ?? 0;
      if (aqi >= rule.aqiThreshold || pm25 >= rule.pm25Threshold) {
        const msg = `${rule.locationName}: US AQI ${aqi} (PM2.5 ${pm25} µg/m³) exceeded your threshold (AQI ≥ ${rule.aqiThreshold} or PM2.5 ≥ ${rule.pm25Threshold}).`;
        triggered.push(repo.recordAlertEvent(req.authUser!.id, rule.locationName, aqi, rule.aqiThreshold, msg));
      } else if (rule.notifyWorsening && env.current.trendDirection === 'worsening') {
        const msg = `${rule.locationName}: 6-hour forecast indicates worsening air quality (current AQI ${aqi}).`;
        triggered.push(repo.recordAlertEvent(req.authUser!.id, rule.locationName, aqi, rule.aqiThreshold, msg));
      }
    }
    res.json({ triggered });
  });

  // --- Deterministic Calculators: Travel, CADR, Personal Impact ---
  app.get('/api/travel/compare', (req: Request, res: Response) => {
    const parsed = TravelCompareSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide distanceKm (0.5-300) and tripsPerWeek (1-28).' });
      return;
    }
    res.json(compareTravelModes(parsed.data.distanceKm, parsed.data.tripsPerWeek));
  });

  app.get('/api/indoor/cadr', (req: Request, res: Response) => {
    const area = Number(req.query.areaM2 ?? 25);
    const height = Number(req.query.heightM ?? 2.7);
    const ach = Number(req.query.ach ?? 4);
    if (!Number.isFinite(area) || !Number.isFinite(height) || !Number.isFinite(ach)) {
      res.status(400).json({ error: 'Numeric areaM2, heightM, and ach required.' });
      return;
    }
    res.json(calculateRecommendedCadr(area, height, ach));
  });

  app.get('/api/impact', (req: AuthenticatedRequest, res: Response) => {
    const entries = req.authUser ? repo.listImpactLogs(req.authUser.id) : [];
    const summary: ImpactSummary = {
      totalCo2SavedKg: Number(entries.reduce((s, e) => s + e.co2SavedKg, 0).toFixed(2)),
      totalPm25AvoidedG: Number(entries.reduce((s, e) => s + e.pm25AvoidedG, 0).toFixed(2)),
      totalExposureHoursManaged: Number(entries.reduce((s, e) => s + e.exposureHoursManaged, 0).toFixed(1)),
      entryCount: entries.length,
      distinctionNotice:
        'Estimated personal emission reductions reflect avoided tailpipe/combustion output using standard emission factors. Exposure-managed hours reflect indoor protection only. Neither metric represents proven reductions in city-wide ambient AQI.',
    };
    res.json({ catalog: IMPACT_ACTION_CATALOG, entries, summary });
  });

  app.post('/api/impact', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = ImpactLogCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid impact action submission.' });
      return;
    }
    const spec = IMPACT_ACTION_CATALOG[parsed.data.actionKey];
    if (!spec) {
      res.status(400).json({ error: 'Unknown impact action key.' });
      return;
    }
    const entry = repo.createImpactLog(req.authUser!.id, {
      category: spec.category,
      actionKey: parsed.data.actionKey,
      label: spec.label,
      co2SavedKg: spec.co2SavedKg,
      pm25AvoidedG: spec.pm25AvoidedG,
      exposureHoursManaged: spec.exposureHoursManaged,
      notes: sanitizePlainText(parsed.data.notes, 240),
    });
    res.status(201).json({ entry });
  });

  app.delete('/api/impact/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const ok = repo.deleteImpactLog(req.authUser!.id, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Impact entry not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // --- Community Observations, Clean-Air Initiatives & Moderation ---
  app.get('/api/community/posts', (req: AuthenticatedRequest, res: Response) => {
    const postType = typeof req.query.type === 'string' ? req.query.type : 'all';
    const city = typeof req.query.city === 'string' ? sanitizePlainText(req.query.city, 60) : '';
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);

    const posts = repo.listCommunityPosts({
      viewerUserId: req.authUser?.id,
      postType,
      city,
      includeHidden: req.authUser?.role === 'moderator' || req.authUser?.role === 'admin',
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    res.json({ posts });
  });

  app.post('/api/community/posts', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = CommunityPostCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid community post fields.', details: parsed.error.flatten() });
      return;
    }
    const title = sanitizePlainText(parsed.data.title, 120);
    const body = sanitizePlainText(parsed.data.body, 1200);
    if (hasPromptInjectionSignals(title) || hasPromptInjectionSignals(body)) {
      res.status(400).json({ error: 'Post content rejected by safety filter.' });
      return;
    }
    const post = repo.createCommunityPost(req.authUser!, {
      postType: parsed.data.postType,
      category: parsed.data.category,
      title,
      body,
      areaLabel: sanitizePlainText(parsed.data.areaLabel, 80),
      city: sanitizePlainText(parsed.data.city, 80),
    });
    res.status(201).json({ post });
  });

  app.delete('/api/community/posts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const outcome = repo.deleteCommunityPost(req.params.id, req.authUser!);
    if (outcome === 'not_found') {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    if (outcome === 'forbidden') {
      res.status(403).json({ error: 'You may only delete your own community posts.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/community/posts/:id/vote', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const result = repo.togglePostVote(req.params.id, req.authUser!.id);
    if (!result) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    res.json(result);
  });

  app.post('/api/community/posts/:id/comments', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = CommunityCommentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Comment must be 2 to 500 characters.' });
      return;
    }
    const comment = repo.addPostComment(req.params.id, req.authUser!, sanitizePlainText(parsed.data.body, 500));
    if (!comment) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    res.status(201).json({ comment });
  });

  app.post('/api/community/posts/:id/report', requireAuth, writeLimiter, (req: AuthenticatedRequest, res: Response) => {
    const parsed = CommunityReportCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid report reason required.' });
      return;
    }
    const created = repo.reportPost(
      req.params.id,
      req.authUser!.id,
      parsed.data.reason,
      sanitizePlainText(parsed.data.details, 400)
    );
    if (!created) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    res.status(201).json({ reportId: created.id });
  });

  app.get('/api/moderation/reports', requireAuth, requireModerator, (_req: AuthenticatedRequest, res: Response) => {
    res.json({ reports: repo.listOpenReports() });
  });

  app.patch('/api/moderation/reports/:id', requireAuth, requireModerator, (req: AuthenticatedRequest, res: Response) => {
    const parsed = ModerationActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid moderation action.' });
      return;
    }
    const ok = repo.applyModerationAction(
      req.authUser!.id,
      req.params.id,
      parsed.data.action,
      sanitizePlainText(parsed.data.notes, 300)
    );
    if (!ok) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- Grounded GenAI Assistant ---
  app.post('/api/assistant/query', aiLimiter, async (req: AuthenticatedRequest, res: Response) => {
    const parsed = AssistantQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid assistant request payload.', details: parsed.error.flatten() });
      return;
    }

    if (hasPromptInjectionSignals(parsed.data.question)) {
      res.status(400).json({
        error: 'Your query triggered our prompt-safety filter. Please ask a direct question about air quality, indoor air, or travel.',
      });
      return;
    }

    const location: LocationOption = {
      id: `${parsed.data.location.latitude.toFixed(2)},${parsed.data.location.longitude.toFixed(2)}`,
      name: parsed.data.location.name,
      country: parsed.data.location.country,
      latitude: parsed.data.location.latitude,
      longitude: parsed.data.location.longitude,
    };

    const environment = await getCurrentEnvironment(repo, location, parsed.data.standard);
    const profile = req.authUser
      ? repo.getFamilyProfile(req.authUser.id)
      : parsed.data.profileOverride ?? DEFAULT_FAMILY_PROFILE;

    try {
      const advice = await aiProvider.generateAdvice({
        question: parsed.data.question,
        thinkingMode: parsed.data.thinkingMode,
        language: parsed.data.language,
        environment,
        profile,
      });
      res.json({ advice, environmentSource: environment.source, stale: environment.stale });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI assistant failed to generate guidance.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : message.includes('disallowed') ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  // Global error handler (no stack leaks)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[ClearAir Server Error]', err.message);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return { app, repo, dbInstance };
}
