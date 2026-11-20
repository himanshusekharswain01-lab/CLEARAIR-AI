# ClearAir AI

ClearAir AI is a full-stack, security-hardened environmental intelligence platform built to turn real-time and historical air-quality telemetry into practical everyday decisions for households and communities.

## Architecture Overview

- **Frontend (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 (PWA-enabled via `vite-plugin-pwa`).
  - `DashboardView`: Current AQI (US EPA, EU EAQI, India NAQI), PM2.5, PM10, NO2, O3, SO2, CO, weather & atmospheric mixing-layer dispersion risk, 24-hour forecast SVG line chart, and alert threshold triggers.
  - `HistoryView`: Custom date-range historical trends (up to 90 days) for PM2.5, PM10, NO2, O3, SO2, and CO, weekly summary deltas, day-over-day comparison, and automated detection of past exceedance/inversion episodes.
  - `AssistantView`: Modular GenAI environmental assistant supporting Fast Guidance (`ThinkingLevel.LOW`) and Deep Reasoning (`ThinkingLevel.HIGH`) grounded strictly in verified telemetry and non-sensitive household preferences.
  - `PlannersView`: Indoor Air Quality Guide (ventilation advisor, room-specific recommendations, deterministic CADR HEPA sizer, safe cleaning notices), Smart Travel Planner (deterministic CO2e / PM2.5 / NOx comparison), and Personal Impact Tracker (separating personal emission reductions, personal exposure-management hours, and city-wide air-quality disclaimers).
  - `CommunityView`: Neighborhood observations and clean-air initiatives clearly labeled as **User-Generated Observation · Not Official AQI Data**, with upvoting, commenting, flagging/reporting, and a Moderator Queue for `moderator` / `admin` roles.
- **Backend (`server/`)**: Node.js + Express + built-in SQLite (`node:sqlite`).
  - `server/ai/`: Modular `AIProvider` interface + `GeminiProvider` using `@google/genai` server-side only (`GEMINI_API_KEY` never exposed to browser).
  - `server/services/environmentService.ts`: Live & historical data integration with Open-Meteo Air Quality, Weather, and Geocoding APIs, with SQLite TTL caching (`env_cache`) and stale-cache fallback.
  - `server/security.ts`: Salted `scrypt` password hashing (`timingSafeEqual`), SHA-256 session tokens in `HttpOnly` `SameSite=Lax` cookies, session-bound `X-CSRF-Token` verification, sliding-window rate limiting, and HTTPS/host-allowlisted SSRF guards.
  - `server/db.ts`: Normalized SQLite schema with foreign-key cascades for Right-to-Delete (`DELETE /api/auth/data`) and Right-to-Export (`GET /api/auth/data-export`).

## Environment Variables

Copy `.env.example` to `.env` for local runs outside AI Studio:

- `GEMINI_API_KEY`: Server-side Gemini API key (automatically injected in AI Studio Secrets).
- `GEMINI_MODEL`: Optional override for fast mode (defaults to `gemini-4-hydrogen`).
- `GEMINI_THINKING_MODEL`: Optional override for deep reasoning mode (defaults to `gemini-4-hydrogen`).
- `CLEARAIR_DB_PATH`: SQLite file path (defaults to `./data/clearair.db`).
- `PORT`: Server port (defaults to `3000`).

## External APIs

- **Open-Meteo Air Quality & Weather APIs** (`air-quality-api.open-meteo.com`, `api.open-meteo.com`, `geocoding-api.open-meteo.com`): No API key required for non-commercial open environmental telemetry.
- **Google Gemini API (`@google/genai`)**: Requires `GEMINI_API_KEY` configured server-side.

## Setup & Local Development

```bash
npm install
npm run dev
```

The server listens on `http://localhost:3000`, serving API endpoints under `/api/*` and the Vite React frontend.

## Testing & Verification

Run TypeScript check, unit tests, integration tests, and production build:

```bash
npm run lint
npm test
npm run build
```

## Production Deployment

```bash
npm run build
npm run start
```

Set `NODE_ENV=production` and configure `GEMINI_API_KEY` and `CLEARAIR_DB_PATH` on your host.
