import {
  calculateIndiaNaqiFromPollutants,
  calculateUsAqiFromPollutants,
  classifyAqi,
  detectPollutionEvents,
  estimateInversionRisk,
} from '../../src/shared/aqi.ts';
import type {
  AqiStandard,
  EnvironmentSnapshot,
  HistoricalAirQualityResponse,
  HistoricalDailyPoint,
  HourlyForecastPoint,
  LocationOption,
  PollutantReadings,
} from '../../src/shared/types.ts';
import type { ClearAirRepository } from '../db.ts';
import { assertSafeExternalUrl } from '../security.ts';

export const PRESET_LOCATIONS: LocationOption[] = [
  { id: 'delhi', name: 'New Delhi', admin1: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' },
  { id: 'lahore', name: 'Lahore', admin1: 'Punjab', country: 'Pakistan', latitude: 31.5204, longitude: 74.3587, timezone: 'Asia/Karachi' },
  { id: 'london', name: 'London', admin1: 'Greater London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276, timezone: 'Europe/London' },
  { id: 'oslo', name: 'Oslo', admin1: 'Oslo', country: 'Norway', latitude: 59.9139, longitude: 10.7522, timezone: 'Europe/Oslo' },
  { id: 'sf', name: 'San Francisco', admin1: 'California', country: 'United States', latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
  { id: 'beijing', name: 'Beijing', admin1: 'Beijing', country: 'China', latitude: 39.9042, longitude: 116.4074, timezone: 'Asia/Shanghai' },
];

async function fetchJsonWithTimeout<T>(rawUrl: string, timeoutMs = 8000): Promise<T> {
  const safeUrl = assertSafeExternalUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(safeUrl.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Upstream API returned HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchLocations(query: string): Promise<LocationOption[]> {
  const clean = query.trim();
  if (clean.length < 2) {
    return PRESET_LOCATIONS;
  }

  const matchesPreset = PRESET_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(clean.toLowerCase()) ||
      loc.country.toLowerCase().includes(clean.toLowerCase())
  );

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=8&language=en&format=json`;
    const data = await fetchJsonWithTimeout<{
      results?: Array<{
        id: number;
        name: string;
        admin1?: string;
        country?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }>;
    }>(url, 6000);

    if (!data.results || data.results.length === 0) {
      return matchesPreset;
    }

    return data.results.map((r) => ({
      id: String(r.id),
      name: r.name,
      admin1: r.admin1,
      country: r.country ?? '',
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
  } catch {
    // Fallback to curated city directory when geocoding service is unreachable
    return matchesPreset;
  }
}

interface OpenMeteoAirQualityPayload {
  timezone?: string;
  current?: {
    time: string;
    us_aqi?: number | null;
    european_aqi?: number | null;
    pm10?: number | null;
    pm2_5?: number | null;
    carbon_monoxide?: number | null;
    nitrogen_dioxide?: number | null;
    sulphur_dioxide?: number | null;
    ozone?: number | null;
  };
  hourly?: {
    time: string[];
    pm10?: Array<number | null>;
    pm2_5?: Array<number | null>;
    carbon_monoxide?: Array<number | null>;
    nitrogen_dioxide?: Array<number | null>;
    sulphur_dioxide?: Array<number | null>;
    ozone?: Array<number | null>;
    us_aqi?: Array<number | null>;
    european_aqi?: Array<number | null>;
  };
}

interface OpenMeteoWeatherPayload {
  current?: {
    time: string;
    temperature_2m?: number | null;
    relative_humidity_2m?: number | null;
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
    surface_pressure?: number | null;
  };
  hourly?: {
    time: string[];
    temperature_2m?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    boundary_layer_height?: Array<number | null>;
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(1)) : null;
}

export async function getCurrentEnvironment(
  repo: ClearAirRepository,
  location: LocationOption,
  standard: AqiStandard
): Promise<EnvironmentSnapshot> {
  const latKey = location.latitude.toFixed(2);
  const lonKey = location.longitude.toFixed(2);
  const cacheKey = `current:${latKey}:${lonKey}`;
  const cached = repo.getCache<Omit<EnvironmentSnapshot, 'stale' | 'location'>>(cacheKey);

  if (cached && !cached.expired) {
    const snapshot = reclassifySnapshot(cached.payload, location, standard, false);
    return snapshot;
  }

  try {
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
      `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi` +
      `&forecast_days=2&timezone=auto`;

    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure` +
      `&hourly=temperature_2m,wind_speed_10m,boundary_layer_height` +
      `&forecast_days=2&timezone=auto`;

    const [aq, wx] = await Promise.all([
      fetchJsonWithTimeout<OpenMeteoAirQualityPayload>(aqUrl, 8000),
      fetchJsonWithTimeout<OpenMeteoWeatherPayload>(wxUrl, 8000),
    ]);

    const pollutants: PollutantReadings = {
      pm25: numOrNull(aq.current?.pm2_5),
      pm10: numOrNull(aq.current?.pm10),
      no2: numOrNull(aq.current?.nitrogen_dioxide),
      o3: numOrNull(aq.current?.ozone),
      so2: numOrNull(aq.current?.sulphur_dioxide),
      co: numOrNull(aq.current?.carbon_monoxide),
    };

    const computedUs = calculateUsAqiFromPollutants(pollutants);
    const usAqi = numOrNull(aq.current?.us_aqi) ?? computedUs.aqi;
    const euAqi = numOrNull(aq.current?.european_aqi);
    const inNaqi = calculateIndiaNaqiFromPollutants(pollutants);

    const hourlyTimes = aq.hourly?.time ?? [];
    const nowTime = aq.current?.time ?? new Date().toISOString();
    const currentHourIdx = Math.max(
      0,
      hourlyTimes.findIndex((t) => t >= nowTime.slice(0, 13))
    );

    const hourlyForecast: HourlyForecastPoint[] = [];
    for (let i = currentHourIdx; i < Math.min(hourlyTimes.length, currentHourIdx + 24); i++) {
      hourlyForecast.push({
        time: hourlyTimes[i],
        usAqi: numOrNull(aq.hourly?.us_aqi?.[i]),
        euAqi: numOrNull(aq.hourly?.european_aqi?.[i]),
        pm25: numOrNull(aq.hourly?.pm2_5?.[i]),
        pm10: numOrNull(aq.hourly?.pm10?.[i]),
        no2: numOrNull(aq.hourly?.nitrogen_dioxide?.[i]),
        o3: numOrNull(aq.hourly?.ozone?.[i]),
        temperatureC: numOrNull(wx.hourly?.temperature_2m?.[i]),
        windSpeedKmh: numOrNull(wx.hourly?.wind_speed_10m?.[i]),
      });
    }

    const blhCurrent = numOrNull(wx.hourly?.boundary_layer_height?.[currentHourIdx]);
    const windCurrent = numOrNull(wx.current?.wind_speed_10m);

    let trendDirection: 'improving' | 'stable' | 'worsening' | 'unknown' = 'unknown';
    if (hourlyForecast.length >= 6 && hourlyForecast[0].usAqi !== null && hourlyForecast[5].usAqi !== null) {
      const delta = hourlyForecast[5].usAqi - hourlyForecast[0].usAqi;
      if (delta >= 12) trendDirection = 'worsening';
      else if (delta <= -12) trendDirection = 'improving';
      else trendDirection = 'stable';
    }

    const basePayload: Omit<EnvironmentSnapshot, 'stale' | 'location'> = {
      source: 'Open-Meteo CAMS / ECMWF Atmospheric Model',
      fetchedAt: new Date().toISOString(),
      dataUnavailable: false,
      current: {
        observedAt: aq.current?.time ?? new Date().toISOString(),
        pollutants,
        weather: {
          temperatureC: numOrNull(wx.current?.temperature_2m),
          humidityPct: numOrNull(wx.current?.relative_humidity_2m),
          windSpeedKmh: windCurrent,
          windDirectionDeg: numOrNull(wx.current?.wind_direction_10m),
          pressureHpa: numOrNull(wx.current?.surface_pressure),
          boundaryLayerHeightM: blhCurrent,
        },
        usAqi,
        euAqi,
        inNaqi,
        classification: classifyAqi(standard, usAqi, euAqi, inNaqi, computedUs.dominantPollutant),
        inversionRisk: estimateInversionRisk(windCurrent, blhCurrent, pollutants.pm25),
        trendDirection,
      },
      hourlyForecast,
    };

    repo.setCache(cacheKey, basePayload, 15 * 60 * 1000); // 15m TTL
    return { ...basePayload, location, stale: false };
  } catch (err) {
    if (cached) {
      return reclassifySnapshot(cached.payload, location, standard, true);
    }

    return {
      location,
      source: 'Open-Meteo CAMS / ECMWF (Unavailable)',
      fetchedAt: new Date().toISOString(),
      stale: true,
      dataUnavailable: true,
      unavailableReason:
        err instanceof Error
          ? `Live environmental service temporarily unreachable (${err.message}). Showing general guidance without live local measurements.`
          : 'Live environmental service temporarily unreachable.',
      current: {
        observedAt: new Date().toISOString(),
        pollutants: { pm25: null, pm10: null, no2: null, o3: null, so2: null, co: null },
        weather: {
          temperatureC: null,
          humidityPct: null,
          windSpeedKmh: null,
          windDirectionDeg: null,
          pressureHpa: null,
          boundaryLayerHeightM: null,
        },
        usAqi: null,
        euAqi: null,
        inNaqi: null,
        classification: classifyAqi(standard, 0, 0, 0, 'Unavailable'),
        inversionRisk: 'unknown',
        trendDirection: 'unknown',
      },
      hourlyForecast: [],
    };
  }
}

function reclassifySnapshot(
  base: Omit<EnvironmentSnapshot, 'stale' | 'location'>,
  location: LocationOption,
  standard: AqiStandard,
  stale: boolean
): EnvironmentSnapshot {
  const computed = calculateUsAqiFromPollutants(base.current.pollutants);
  return {
    ...base,
    location,
    stale,
    current: {
      ...base.current,
      classification: classifyAqi(
        standard,
        base.current.usAqi,
        base.current.euAqi,
        base.current.inNaqi,
        computed.dominantPollutant
      ),
    },
  };
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
}

export async function getHistoricalAirQuality(
  repo: ClearAirRepository,
  location: LocationOption,
  startDate: string,
  endDate: string
): Promise<HistoricalAirQualityResponse> {
  const cacheKey = `hist:${location.latitude.toFixed(2)}:${location.longitude.toFixed(2)}:${startDate}:${endDate}`;
  const cached = repo.getCache<Omit<HistoricalAirQualityResponse, 'stale' | 'location'>>(cacheKey);
  if (cached && !cached.expired) {
    return { ...cached.payload, location, stale: false };
  }

  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi` +
      `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&timezone=auto`;

    const data = await fetchJsonWithTimeout<OpenMeteoAirQualityPayload>(url, 10000);
    const times = data.hourly?.time ?? [];
    const byDate = new Map<
      string,
      { pm25: number[]; pm10: number[]; no2: number[]; o3: number[]; so2: number[]; co: number[]; aqi: number[] }
    >();

    for (let i = 0; i < times.length; i++) {
      const date = times[i].slice(0, 10);
      let bucket = byDate.get(date);
      if (!bucket) {
        bucket = { pm25: [], pm10: [], no2: [], o3: [], so2: [], co: [], aqi: [] };
        byDate.set(date, bucket);
      }
      const p25 = data.hourly?.pm2_5?.[i];
      const p10 = data.hourly?.pm10?.[i];
      const no2 = data.hourly?.nitrogen_dioxide?.[i];
      const o3 = data.hourly?.ozone?.[i];
      const so2 = data.hourly?.sulphur_dioxide?.[i];
      const co = data.hourly?.carbon_monoxide?.[i];
      const aqi = data.hourly?.us_aqi?.[i];
      if (typeof p25 === 'number' && Number.isFinite(p25)) bucket.pm25.push(p25);
      if (typeof p10 === 'number' && Number.isFinite(p10)) bucket.pm10.push(p10);
      if (typeof no2 === 'number' && Number.isFinite(no2)) bucket.no2.push(no2);
      if (typeof o3 === 'number' && Number.isFinite(o3)) bucket.o3.push(o3);
      if (typeof so2 === 'number' && Number.isFinite(so2)) bucket.so2.push(so2);
      if (typeof co === 'number' && Number.isFinite(co)) bucket.co.push(co);
      if (typeof aqi === 'number' && Number.isFinite(aqi)) bucket.aqi.push(aqi);
    }

    const dailySeries: HistoricalDailyPoint[] = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, b]) => ({
        date,
        pm25Avg: avg(b.pm25),
        pm25Max: b.pm25.length ? Number(Math.max(...b.pm25).toFixed(1)) : null,
        pm10Avg: avg(b.pm10),
        no2Avg: avg(b.no2),
        o3Avg: avg(b.o3),
        so2Avg: avg(b.so2),
        coAvg: avg(b.co),
        usAqiMax: b.aqi.length ? Math.round(Math.max(...b.aqi)) : null,
      }));

    const events = detectPollutionEvents(dailySeries);
    const last7 = dailySeries.slice(-7);
    const prior7 = dailySeries.slice(-14, -7);

    const last7Pm25 = avg(last7.map((d) => d.pm25Avg).filter((v): v is number => v !== null));
    const prior7Pm25 = avg(prior7.map((d) => d.pm25Avg).filter((v): v is number => v !== null));
    const deltaPct =
      last7Pm25 !== null && prior7Pm25 !== null && prior7Pm25 > 0
        ? Number((((last7Pm25 - prior7Pm25) / prior7Pm25) * 100).toFixed(1))
        : null;

    const payload: Omit<HistoricalAirQualityResponse, 'stale' | 'location'> = {
      startDate,
      endDate,
      source: 'Open-Meteo Historical Air Quality Archive (CAMS)',
      fetchedAt: new Date().toISOString(),
      dataUnavailable: false,
      dailySeries,
      events,
      weeklySummary: {
        avgPm25: last7Pm25,
        avgPm10: avg(last7.map((d) => d.pm10Avg).filter((v): v is number => v !== null)),
        avgNo2: avg(last7.map((d) => d.no2Avg).filter((v): v is number => v !== null)),
        avgO3: avg(last7.map((d) => d.o3Avg).filter((v): v is number => v !== null)),
        exceedanceDays: dailySeries.filter((d) => (d.usAqiMax ?? 0) > 100 || (d.pm25Avg ?? 0) > 35.4).length,
        cleanDays: dailySeries.filter((d) => (d.usAqiMax ?? 999) <= 50).length,
        deltaVsPriorWeekPct: deltaPct,
      },
    };

    repo.setCache(cacheKey, payload, 6 * 60 * 60 * 1000); // 6h TTL
    return { ...payload, location, stale: false };
  } catch (err) {
    if (cached) {
      return { ...cached.payload, location, stale: true };
    }
    return {
      location,
      startDate,
      endDate,
      source: 'Open-Meteo Historical Air Quality Archive (Unavailable)',
      fetchedAt: new Date().toISOString(),
      stale: true,
      dataUnavailable: true,
      unavailableReason:
        err instanceof Error
          ? `Historical air quality data unavailable (${err.message}).`
          : 'Historical air quality data unavailable.',
      dailySeries: [],
      events: [],
      weeklySummary: {
        avgPm25: null,
        avgPm10: null,
        avgNo2: null,
        avgO3: null,
        exceedanceDays: 0,
        cleanDays: 0,
        deltaVsPriorWeekPct: null,
      },
    };
  }
}
