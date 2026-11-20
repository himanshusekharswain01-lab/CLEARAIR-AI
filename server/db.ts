import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './security.ts';
import type {
  AlertEvent,
  AlertRule,
  AuthUser,
  CommunityComment,
  CommunityPost,
  CommunityReport,
  FamilyProfile,
  ImpactLogEntry,
  UserRole,
} from '../src/shared/types.ts';

export const DEFAULT_FAMILY_PROFILE: FamilyProfile = {
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

export interface DbInstance {
  raw: DatabaseSync;
  close: () => void;
}

export function createDatabase(dbPath?: string): DbInstance {
  const resolvedPath = dbPath ?? process.env.CLEARAIR_DB_PATH ?? path.resolve(process.cwd(), 'data', 'clearair.db');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('member', 'moderator', 'admin')) DEFAULT 'member',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS family_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      aqi_threshold INTEGER NOT NULL,
      pm25_threshold REAL NOT NULL,
      notify_worsening INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      location_name TEXT NOT NULL,
      observed_aqi INTEGER NOT NULL,
      threshold_aqi INTEGER NOT NULL,
      message TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alert_events_user ON alert_events(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS impact_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      action_key TEXT NOT NULL,
      label TEXT NOT NULL,
      co2_saved_kg REAL NOT NULL,
      pm25_avoided_g REAL NOT NULL,
      exposure_hours_managed REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      logged_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_impact_logs_user ON impact_logs(user_id, logged_at DESC);

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_display_name TEXT NOT NULL,
      post_type TEXT NOT NULL CHECK(post_type IN ('observation', 'initiative', 'public_bulletin')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      area_label TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'flagged', 'hidden', 'verified')) DEFAULT 'active',
      source_label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_community_posts_city_status ON community_posts(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_votes (
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_display_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS community_reports (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('open', 'resolved', 'dismissed')) DEFAULT 'open',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS moderation_logs (
      id TEXT PRIMARY KEY,
      moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      action TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS env_cache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  seedInitialData(db);

  return {
    raw: db,
    close: () => db.close(),
  };
}

function seedInitialData(db: DatabaseSync): void {
  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  if (existingUser) return;

  const now = new Date().toISOString();
  const memberId = 'usr-member-seed-1';
  const modId = 'usr-mod-seed-1';

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertUser.run(memberId, 'family@clearair.example', 'Asha Patel', hashPassword('ClearAirFamily2026!'), 'member', now);
  insertUser.run(modId, 'moderator@clearair.example', 'Civic Air Moderator', hashPassword('ClearAirMod2026!'), 'moderator', now);

  db.prepare('INSERT INTO family_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)').run(
    memberId,
    JSON.stringify(DEFAULT_FAMILY_PROFILE),
    now
  );

  const insertPost = db.prepare(
    `INSERT INTO community_posts
      (id, author_id, author_display_name, post_type, category, title, body, area_label, city, status, source_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertPost.run(
    'post-seed-1',
    memberId,
    'Asha Patel',
    'observation',
    'visible_smoke',
    'Heavy morning haze & wood-smoke odor near Riverfront Park',
    'Noticed thick ground-level smoke settling between 06:30 and 08:15 near the riverside walking path. Keeping our morning school walk indoors until wind picks up.',
    'Riverfront District',
    'New Delhi',
    'active',
    'User-Generated Observation · Not Official AQI Data',
    new Date(Date.now() - 1000 * 60 * 95).toISOString()
  );

  insertPost.run(
    'post-seed-2',
    memberId,
    'Neighborhood Green Council',
    'initiative',
    'clean_air_zone',
    'School Drop-Off No-Idling Corridor (3-month update)',
    'Parents and teachers organized a 200m engine-off zone outside Oakridge Primary. Morning drop-off queue waiting times dropped and 42 families joined our walking-bus carpool.',
    'Oakridge Ward',
    'London',
    'verified',
    'User-Generated Community Initiative · Not Official AQI Data',
    new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString()
  );

  insertPost.run(
    'post-seed-3',
    modId,
    'Civic Air Moderator',
    'public_bulletin',
    'clean_air_zone',
    'Winter Inversion Advisory: Verified Public Transit Fee Waiver Hours',
    'Municipal authorities announce off-peak electric tram & metro fare discounts on days when regional PM2.5 exceeds 55 µg/m³. Verify local transit schedules before commuting.',
    'Metropolitan Transit Area',
    'Oslo',
    'verified',
    'Verified Public Information Bulletin',
    new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString()
  );

  insertPost.run(
    'post-seed-4',
    memberId,
    'Marcus Lind',
    'observation',
    'construction_dust',
    'Uncovered demolition dust cloud along North Ring Road',
    'Dry wind gusts are lifting fine concrete dust from the utility trench near Gate 4. Cyclists may prefer the canal path or wear a sealed particulate mask.',
    'North Ring Corridor',
    'New Delhi',
    'active',
    'User-Generated Observation · Not Official AQI Data',
    new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
  );

  db.prepare(
    'INSERT INTO community_comments (id, post_id, author_id, author_display_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    'cmt-seed-1',
    'post-seed-2',
    modId,
    'Civic Air Moderator',
    'Thank you for sharing measurable participation numbers! Remember not to post student names or exact home streets.',
    new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString()
  );
}

export class ClearAirRepository {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  createUser(email: string, displayName: string, passwordHash: string, role: UserRole = 'member'): AuthUser {
    const id = `usr-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO users (id, email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email.toLowerCase(), displayName, passwordHash, role, createdAt);

    this.db
      .prepare('INSERT INTO family_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(DEFAULT_FAMILY_PROFILE), createdAt);

    return { id, email: email.toLowerCase(), displayName, role, createdAt };
  }

  findUserCredentialsByEmail(email: string): { user: AuthUser; passwordHash: string } | null {
    const row = this.db
      .prepare('SELECT id, email, display_name, password_hash, role, created_at FROM users WHERE email = ?')
      .get(email.toLowerCase()) as
      | { id: string; email: string; display_name: string; password_hash: string; role: UserRole; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        createdAt: row.created_at,
      },
      passwordHash: row.password_hash,
    };
  }

  createSession(tokenHash: string, userId: string, csrfToken: string, expiresAt: string): void {
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tokenHash, userId, csrfToken, expiresAt, new Date().toISOString());
  }

  findSession(tokenHash: string): { user: AuthUser; csrfToken: string; expiresAt: string } | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.role, u.created_at, s.csrf_token, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as
      | {
          id: string;
          email: string;
          display_name: string;
          role: UserRole;
          created_at: string;
          csrf_token: string;
          expires_at: string;
        }
      | undefined;

    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }

    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        createdAt: row.created_at,
      },
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  deleteUserAndData(userId: string): void {
    // Foreign keys with ON DELETE CASCADE remove sessions, profiles, alerts, logs, votes, comments, posts, reports
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  exportUserData(userId: string) {
    const user = this.db
      .prepare('SELECT id, email, display_name, role, created_at FROM users WHERE id = ?')
      .get(userId);
    const profile = this.getFamilyProfile(userId);
    const alerts = this.listAlertRules(userId);
    const alertEvents = this.listAlertEvents(userId);
    const impactLogs = this.listImpactLogs(userId);
    const posts = this.db
      .prepare('SELECT id, post_type, category, title, body, area_label, city, status, created_at FROM community_posts WHERE author_id = ?')
      .all(userId);
    return { exportedAt: new Date().toISOString(), user, profile, alerts, alertEvents, impactLogs, posts };
  }

  getFamilyProfile(userId: string): FamilyProfile {
    const row = this.db.prepare('SELECT profile_json FROM family_profiles WHERE user_id = ?').get(userId) as
      | { profile_json: string }
      | undefined;
    if (!row) return DEFAULT_FAMILY_PROFILE;
    try {
      return JSON.parse(row.profile_json) as FamilyProfile;
    } catch {
      return DEFAULT_FAMILY_PROFILE;
    }
  }

  saveFamilyProfile(userId: string, profile: FamilyProfile): FamilyProfile {
    this.db
      .prepare(
        `INSERT INTO family_profiles (user_id, profile_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`
      )
      .run(userId, JSON.stringify(profile), new Date().toISOString());
    return profile;
  }

  listAlertRules(userId: string): AlertRule[] {
    const rows = this.db
      .prepare('SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      location_name: string;
      latitude: number;
      longitude: number;
      aqi_threshold: number;
      pm25_threshold: number;
      notify_worsening: number;
      enabled: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      locationName: r.location_name,
      latitude: r.latitude,
      longitude: r.longitude,
      aqiThreshold: r.aqi_threshold,
      pm25Threshold: r.pm25_threshold,
      notifyWorsening: Boolean(r.notify_worsening),
      enabled: Boolean(r.enabled),
      createdAt: r.created_at,
    }));
  }

  createAlertRule(userId: string, input: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule {
    const id = `alr-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO alert_rules
         (id, user_id, location_name, latitude, longitude, aqi_threshold, pm25_threshold, notify_worsening, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        input.locationName,
        input.latitude,
        input.longitude,
        input.aqiThreshold,
        input.pm25Threshold,
        input.notifyWorsening ? 1 : 0,
        input.enabled ? 1 : 0,
        createdAt
      );
    return { id, ...input, createdAt };
  }

  toggleAlertRule(userId: string, ruleId: string, enabled: boolean): boolean {
    const result = this.db
      .prepare('UPDATE alert_rules SET enabled = ? WHERE id = ? AND user_id = ?')
      .run(enabled ? 1 : 0, ruleId, userId);
    return result.changes > 0;
  }

  deleteAlertRule(userId: string, ruleId: string): boolean {
    const result = this.db.prepare('DELETE FROM alert_rules WHERE id = ? AND user_id = ?').run(ruleId, userId);
    return result.changes > 0;
  }

  listAlertEvents(userId: string): AlertEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(userId) as Array<{
      id: string;
      location_name: string;
      observed_aqi: number;
      threshold_aqi: number;
      message: string;
      acknowledged: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      locationName: r.location_name,
      observedAqi: r.observed_aqi,
      thresholdAqi: r.threshold_aqi,
      message: r.message,
      acknowledged: Boolean(r.acknowledged),
      createdAt: r.created_at,
    }));
  }

  recordAlertEvent(userId: string, locationName: string, observedAqi: number, thresholdAqi: number, message: string): AlertEvent {
    const id = `aev-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO alert_events (id, user_id, location_name, observed_aqi, threshold_aqi, message, acknowledged, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(id, userId, locationName, observedAqi, thresholdAqi, message, createdAt);
    return { id, locationName, observedAqi, thresholdAqi, message, acknowledged: false, createdAt };
  }

  acknowledgeAlertEvent(userId: string, eventId: string): boolean {
    const res = this.db
      .prepare('UPDATE alert_events SET acknowledged = 1 WHERE id = ? AND user_id = ?')
      .run(eventId, userId);
    return res.changes > 0;
  }

  listImpactLogs(userId: string): ImpactLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM impact_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 50')
      .all(userId) as Array<{
      id: string;
      category: ImpactLogEntry['category'];
      action_key: string;
      label: string;
      co2_saved_kg: number;
      pm25_avoided_g: number;
      exposure_hours_managed: number;
      notes: string;
      logged_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      actionKey: r.action_key,
      label: r.label,
      co2SavedKg: r.co2_saved_kg,
      pm25AvoidedG: r.pm25_avoided_g,
      exposureHoursManaged: r.exposure_hours_managed,
      notes: r.notes,
      loggedAt: r.logged_at,
    }));
  }

  createImpactLog(
    userId: string,
    entry: Omit<ImpactLogEntry, 'id' | 'loggedAt'>
  ): ImpactLogEntry {
    const id = `imp-${crypto.randomUUID()}`;
    const loggedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO impact_logs
         (id, user_id, category, action_key, label, co2_saved_kg, pm25_avoided_g, exposure_hours_managed, notes, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        entry.category,
        entry.actionKey,
        entry.label,
        entry.co2SavedKg,
        entry.pm25AvoidedG,
        entry.exposureHoursManaged,
        entry.notes,
        loggedAt
      );
    return { id, ...entry, loggedAt };
  }

  deleteImpactLog(userId: string, id: string): boolean {
    const res = this.db.prepare('DELETE FROM impact_logs WHERE id = ? AND user_id = ?').run(id, userId);
    return res.changes > 0;
  }

  listCommunityPosts(options: {
    viewerUserId?: string;
    postType?: string;
    city?: string;
    includeHidden?: boolean;
    limit?: number;
    offset?: number;
  }): CommunityPost[] {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (!options.includeHidden) {
      where.push("p.status != 'hidden'");
    }
    if (options.postType && options.postType !== 'all') {
      where.push('p.post_type = ?');
      params.push(options.postType);
    }
    if (options.city && options.city.trim().length > 0) {
      where.push('LOWER(p.city) LIKE ?');
      params.push(`%${options.city.trim().toLowerCase()}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);

    const rows = this.db
      .prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM community_votes v WHERE v.post_id = p.id) AS upvote_count,
          (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id) AS comment_count
         FROM community_posts p
         ${whereSql}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{
      id: string;
      author_id: string;
      author_display_name: string;
      post_type: CommunityPost['postType'];
      category: string;
      title: string;
      body: string;
      area_label: string;
      city: string;
      status: CommunityPost['status'];
      source_label: string;
      upvote_count: number;
      comment_count: number;
      created_at: string;
    }>;

    const viewerVotes = new Set<string>();
    if (options.viewerUserId) {
      const voteRows = this.db
        .prepare('SELECT post_id FROM community_votes WHERE user_id = ?')
        .all(options.viewerUserId) as Array<{ post_id: string }>;
      for (const vr of voteRows) viewerVotes.add(vr.post_id);
    }

    return rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorDisplayName: r.author_display_name,
      postType: r.post_type,
      category: r.category,
      title: r.title,
      body: r.body,
      areaLabel: r.area_label,
      city: r.city,
      status: r.status,
      isOfficialAqi: false,
      sourceLabel: r.source_label,
      upvoteCount: Number(r.upvote_count),
      viewerHasUpvoted: viewerVotes.has(r.id),
      commentCount: Number(r.comment_count),
      comments: this.listPostComments(r.id),
      createdAt: r.created_at,
    }));
  }

  listPostComments(postId: string): CommunityComment[] {
    const rows = this.db
      .prepare('SELECT id, post_id, author_display_name, body, created_at FROM community_comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 30')
      .all(postId) as Array<{
      id: string;
      post_id: string;
      author_display_name: string;
      body: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      authorDisplayName: r.author_display_name,
      body: r.body,
      createdAt: r.created_at,
    }));
  }

  createCommunityPost(
    author: AuthUser,
    input: { postType: 'observation' | 'initiative'; category: string; title: string; body: string; areaLabel: string; city: string }
  ): CommunityPost {
    const id = `post-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const sourceLabel =
      input.postType === 'observation'
        ? 'User-Generated Observation · Not Official AQI Data'
        : 'User-Generated Community Initiative · Not Official AQI Data';

    this.db
      .prepare(
        `INSERT INTO community_posts
          (id, author_id, author_display_name, post_type, category, title, body, area_label, city, status, source_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        id,
        author.id,
        author.displayName,
        input.postType,
        input.category,
        input.title,
        input.body,
        input.areaLabel,
        input.city,
        sourceLabel,
        createdAt
      );

    return {
      id,
      authorId: author.id,
      authorDisplayName: author.displayName,
      postType: input.postType,
      category: input.category,
      title: input.title,
      body: input.body,
      areaLabel: input.areaLabel,
      city: input.city,
      status: 'active',
      isOfficialAqi: false,
      sourceLabel,
      upvoteCount: 0,
      viewerHasUpvoted: false,
      commentCount: 0,
      comments: [],
      createdAt,
    };
  }

  deleteCommunityPost(postId: string, actor: AuthUser): 'deleted' | 'forbidden' | 'not_found' {
    const row = this.db.prepare('SELECT author_id FROM community_posts WHERE id = ?').get(postId) as
      | { author_id: string }
      | undefined;
    if (!row) return 'not_found';
    if (row.author_id !== actor.id && actor.role === 'member') return 'forbidden';
    this.db.prepare('DELETE FROM community_posts WHERE id = ?').run(postId);
    return 'deleted';
  }

  togglePostVote(postId: string, userId: string): { upvoteCount: number; viewerHasUpvoted: boolean } | null {
    const exists = this.db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId);
    if (!exists) return null;

    const existingVote = this.db
      .prepare('SELECT 1 FROM community_votes WHERE post_id = ? AND user_id = ?')
      .get(postId, userId);

    if (existingVote) {
      this.db.prepare('DELETE FROM community_votes WHERE post_id = ? AND user_id = ?').run(postId, userId);
    } else {
      this.db
        .prepare('INSERT INTO community_votes (post_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(postId, userId, new Date().toISOString());
    }

    const countRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM community_votes WHERE post_id = ?')
      .get(postId) as { cnt: number };

    return {
      upvoteCount: Number(countRow.cnt),
      viewerHasUpvoted: !existingVote,
    };
  }

  addPostComment(postId: string, author: AuthUser, body: string): CommunityComment | null {
    const exists = this.db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId);
    if (!exists) return null;

    const id = `cmt-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO community_comments (id, post_id, author_id, author_display_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, postId, author.id, author.displayName, body, createdAt);

    return {
      id,
      postId,
      authorDisplayName: author.displayName,
      body,
      createdAt,
    };
  }

  reportPost(postId: string, reporterId: string, reason: string, details: string): { id: string } | null {
    const post = this.db.prepare('SELECT id, status FROM community_posts WHERE id = ?').get(postId) as
      | { id: string; status: string }
      | undefined;
    if (!post) return null;

    const id = `rep-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO community_reports (id, post_id, reporter_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, postId, reporterId, reason, details, 'open', now);

    if (post.status === 'active') {
      this.db.prepare("UPDATE community_posts SET status = 'flagged' WHERE id = ?").run(postId);
    }
    return { id };
  }

  listOpenReports(): CommunityReport[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.post_id, p.title AS post_title, p.post_type, p.status AS post_status,
                r.reason, r.details, r.status, r.created_at
         FROM community_reports r
         JOIN community_posts p ON p.id = r.post_id
         ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 50`
      )
      .all() as Array<{
      id: string;
      post_id: string;
      post_title: string;
      post_type: CommunityReport['postType'];
      post_status: CommunityReport['postStatus'];
      reason: string;
      details: string;
      status: CommunityReport['status'];
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      postTitle: r.post_title,
      postType: r.post_type,
      postStatus: r.post_status,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  applyModerationAction(
    moderatorId: string,
    reportId: string,
    action: 'approve_post' | 'hide_post' | 'dismiss_report',
    notes: string
  ): boolean {
    const report = this.db.prepare('SELECT id, post_id FROM community_reports WHERE id = ?').get(reportId) as
      | { id: string; post_id: string }
      | undefined;
    if (!report) return false;

    const now = new Date().toISOString();
    if (action === 'hide_post') {
      this.db.prepare("UPDATE community_posts SET status = 'hidden' WHERE id = ?").run(report.post_id);
      this.db.prepare("UPDATE community_reports SET status = 'resolved' WHERE post_id = ? AND status = 'open'").run(report.post_id);
    } else if (action === 'approve_post') {
      this.db.prepare("UPDATE community_posts SET status = 'active' WHERE id = ?").run(report.post_id);
      this.db.prepare("UPDATE community_reports SET status = 'resolved' WHERE post_id = ? AND status = 'open'").run(report.post_id);
    } else {
      this.db.prepare("UPDATE community_reports SET status = 'dismissed' WHERE id = ?").run(reportId);
    }

    this.db
      .prepare(
        'INSERT INTO moderation_logs (id, moderator_id, target_type, target_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(`mod-${crypto.randomUUID()}`, moderatorId, 'report', reportId, action, notes, now);

    return true;
  }

  getCache<T>(cacheKey: string): { payload: T; fetchedAt: string; expired: boolean } | null {
    const row = this.db
      .prepare('SELECT payload_json, fetched_at, expires_at FROM env_cache WHERE cache_key = ?')
      .get(cacheKey) as { payload_json: string; fetched_at: string; expires_at: string } | undefined;
    if (!row) return null;
    try {
      const payload = JSON.parse(row.payload_json) as T;
      const expired = new Date(row.expires_at).getTime() <= Date.now();
      return { payload, fetchedAt: row.fetched_at, expired };
    } catch {
      return null;
    }
  }

  setCache<T>(cacheKey: string, payload: T, ttlMs: number): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    this.db
      .prepare(
        `INSERT INTO env_cache (cache_key, payload_json, fetched_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload_json = excluded.payload_json,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`
      )
      .run(cacheKey, JSON.stringify(payload), now.toISOString(), expiresAt.toISOString());
  }
}
