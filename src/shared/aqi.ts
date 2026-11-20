import type {
  AqiClassification,
  AqiStandard,
  CadrCalculationResult,
  HistoricalDailyPoint,
  PollutantReadings,
  PollutionEventContext,
  TravelComparisonResult,
  TravelModeId,
} from './types.ts';

interface Breakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

// US EPA 2024 Revised PM2.5 24h Breakpoints (ug/m3)
const PM25_US_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
  { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
  { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
  { cLow: 225.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
];

// US EPA PM10 24h Breakpoints (ug/m3)
const PM10_US_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 },
];

// India NAQI PM2.5 Breakpoints (ug/m3)
const PM25_IN_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50 },
  { cLow: 30.1, cHigh: 60, iLow: 51, iHigh: 100 },
  { cLow: 60.1, cHigh: 90, iLow: 101, iHigh: 200 },
  { cLow: 90.1, cHigh: 120, iLow: 201, iHigh: 300 },
  { cLow: 120.1, cHigh: 250, iLow: 301, iHigh: 400 },
  { cLow: 250.1, cHigh: 500, iLow: 401, iHigh: 500 },
];

function computeSubIndex(concentration: number, breakpoints: Breakpoint[], decimals: number): number {
  const clamped = Math.max(0, Number(concentration.toFixed(decimals)));
  for (const bp of breakpoints) {
    if (clamped >= bp.cLow && clamped <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (clamped - bp.cLow) + bp.iLow);
    }
  }
  const last = breakpoints[breakpoints.length - 1];
  return clamped > last.cHigh ? last.iHigh : 0;
}

export function calculateUsAqiFromPollutants(pollutants: PollutantReadings): {
  aqi: number | null;
  dominantPollutant: string;
} {
  const candidates: Array<{ name: string; value: number }> = [];
  if (pollutants.pm25 !== null && Number.isFinite(pollutants.pm25)) {
    candidates.push({ name: 'PM2.5', value: computeSubIndex(pollutants.pm25, PM25_US_BREAKPOINTS, 1) });
  }
  if (pollutants.pm10 !== null && Number.isFinite(pollutants.pm10)) {
    candidates.push({ name: 'PM10', value: computeSubIndex(pollutants.pm10, PM10_US_BREAKPOINTS, 0) });
  }
  if (pollutants.o3 !== null && Number.isFinite(pollutants.o3)) {
    // Approximate 8h O3 ug/m3 -> ppb (2.0 ug/m3 ~ 1 ppb at 25C)
    const o3Ppb = pollutants.o3 / 1.96;
    const o3Index = o3Ppb <= 54 ? Math.round((50 / 54) * o3Ppb) : Math.min(300, Math.round(50 + (o3Ppb - 54) * 1.8));
    candidates.push({ name: 'O3', value: o3Index });
  }
  if (pollutants.no2 !== null && Number.isFinite(pollutants.no2)) {
    const no2Ppb = pollutants.no2 / 1.88;
    const no2Index = no2Ppb <= 53 ? Math.round((50 / 53) * no2Ppb) : Math.min(250, Math.round(50 + (no2Ppb - 53) * 0.9));
    candidates.push({ name: 'NO2', value: no2Index });
  }

  if (candidates.length === 0) {
    return { aqi: null, dominantPollutant: 'Unknown' };
  }
  candidates.sort((a, b) => b.value - a.value);
  return { aqi: candidates[0].value, dominantPollutant: candidates[0].name };
}

export function calculateIndiaNaqiFromPollutants(pollutants: PollutantReadings): number | null {
  if (pollutants.pm25 === null && pollutants.pm10 === null) return null;
  const values: number[] = [];
  if (pollutants.pm25 !== null) {
    values.push(computeSubIndex(pollutants.pm25, PM25_IN_BREAKPOINTS, 1));
  }
  if (pollutants.pm10 !== null) {
    // Simplified NAQI PM10 linear segments
    const pm10 = Math.max(0, pollutants.pm10);
    if (pm10 <= 50) values.push(Math.round(pm10));
    else if (pm10 <= 100) values.push(Math.round(pm10));
    else if (pm10 <= 250) values.push(Math.round(100 + ((pm10 - 100) / 150) * 100));
    else if (pm10 <= 350) values.push(Math.round(200 + (pm10 - 250)));
    else values.push(Math.min(500, Math.round(300 + ((pm10 - 350) / 80) * 100)));
  }
  return values.length ? Math.max(...values) : null;
}

export function classifyAqi(
  standard: AqiStandard,
  usAqi: number | null,
  euAqi: number | null,
  inNaqi: number | null,
  dominantPollutant: string
): AqiClassification {
  if (standard === 'EU_EAQI') {
    const val = euAqi ?? 0;
    if (val <= 20) {
      return {
        standard,
        value: val,
        category: 'Good',
        symbol: '●',
        severityLevel: 1,
        colorToken: 'emerald',
        shortAdvisory: 'Air quality is clean across standard European thresholds; outdoor activity is broadly favorable.',
        dominantPollutant,
      };
    }
    if (val <= 40) {
      return {
        standard,
        value: val,
        category: 'Fair',
        symbol: '◐',
        severityLevel: 2,
        colorToken: 'amber',
        shortAdvisory: 'Acceptable air quality; unusually sensitive individuals may monitor prolonged exertion near busy roads.',
        dominantPollutant,
      };
    }
    if (val <= 60) {
      return {
        standard,
        value: val,
        category: 'Moderate',
        symbol: '▲',
        severityLevel: 3,
        colorToken: 'orange',
        shortAdvisory: 'Consider reducing prolonged vigorous outdoor exertion if you experience irritation; keep indoor air filtered.',
        dominantPollutant,
      };
    }
    if (val <= 80) {
      return {
        standard,
        value: val,
        category: 'Poor',
        symbol: '◆',
        severityLevel: 4,
        colorToken: 'rose',
        shortAdvisory: 'Sensitive groups should move intense outdoor activity indoors and limit window ventilation during peak hours.',
        dominantPollutant,
      };
    }
    if (val <= 100) {
      return {
        standard,
        value: val,
        category: 'Very Poor',
        symbol: '■',
        severityLevel: 5,
        colorToken: 'purple',
        shortAdvisory: 'Reduce outdoor physical exertion, wear a well-fitting N95/FFP2 respirator outdoors if needed, and run HEPA filtration.',
        dominantPollutant,
      };
    }
    return {
      standard,
      value: val,
      category: 'Extremely Poor',
      symbol: '✖',
      severityLevel: 6,
      colorToken: 'maroon',
      shortAdvisory: 'Avoid unnecessary outdoor exertion, seal drafts, run indoor air filtration continuously, and follow local health advisories.',
      dominantPollutant,
    };
  }

  if (standard === 'IN_NAQI') {
    const val = inNaqi ?? 0;
    if (val <= 50) {
      return {
        standard,
        value: val,
        category: 'Good',
        symbol: '●',
        severityLevel: 1,
        colorToken: 'emerald',
        shortAdvisory: 'Minimal impact; suitable for normal outdoor routines and natural cross-ventilation.',
        dominantPollutant,
      };
    }
    if (val <= 100) {
      return {
        standard,
        value: val,
        category: 'Satisfactory',
        symbol: '◐',
        severityLevel: 2,
        colorToken: 'amber',
        shortAdvisory: 'Minor discomfort possible for sensitive individuals; prefer midday ventilation away from traffic peaks.',
        dominantPollutant,
      };
    }
    if (val <= 200) {
      return {
        standard,
        value: val,
        category: 'Moderate',
        symbol: '▲',
        severityLevel: 3,
        colorToken: 'orange',
        shortAdvisory: 'Breathing discomfort possible for children, older adults, and sensitive groups during sustained outdoor exertion.',
        dominantPollutant,
      };
    }
    if (val <= 300) {
      return {
        standard,
        value: val,
        category: 'Poor',
        symbol: '◆',
        severityLevel: 4,
        colorToken: 'rose',
        shortAdvisory: 'Avoid morning/evening smog peaks outdoors; use mechanical HEPA filtration indoors and close roadside windows.',
        dominantPollutant,
      };
    }
    if (val <= 400) {
      return {
        standard,
        value: val,
        category: 'Very Poor',
        symbol: '■',
        severityLevel: 5,
        colorToken: 'purple',
        shortAdvisory: 'High smog burden; keep outdoor exposure brief, use certified N95/FFP2 protection outdoors, and filter indoor rooms.',
        dominantPollutant,
      };
    }
    return {
      standard,
      value: val,
      category: 'Severe',
      symbol: '✖',
      severityLevel: 6,
      colorToken: 'maroon',
      shortAdvisory: 'Severe pollution episode; remain indoors with filtration where possible and consult clinicians if symptoms occur.',
      dominantPollutant,
    };
  }

  // Default US EPA AQI
  const val = usAqi ?? 0;
  if (val <= 50) {
    return {
      standard,
      value: val,
      category: 'Good',
      symbol: '●',
      severityLevel: 1,
      colorToken: 'emerald',
      shortAdvisory: 'Clean air; favorable for outdoor exercise, school walks, and natural window ventilation.',
      dominantPollutant,
    };
  }
  if (val <= 100) {
    return {
      standard,
      value: val,
      category: 'Moderate',
      symbol: '◐',
      severityLevel: 2,
      colorToken: 'amber',
      shortAdvisory: 'Acceptable for most people; unusually sensitive groups should consider shorter high-intensity outdoor sessions.',
      dominantPollutant,
    };
  }
  if (val <= 150) {
    return {
      standard,
      value: val,
      category: 'Unhealthy for Sensitive Groups',
      symbol: '▲',
      severityLevel: 3,
      colorToken: 'orange',
      shortAdvisory: 'Children, older adults, and people with respiratory sensitivities should reduce prolonged outdoor exertion.',
      dominantPollutant,
    };
  }
  if (val <= 200) {
    return {
      standard,
      value: val,
      category: 'Unhealthy',
      symbol: '◆',
      severityLevel: 4,
      colorToken: 'rose',
      shortAdvisory: 'Everyone should limit prolonged outdoor exertion; shift workouts indoors and run HEPA filtration.',
      dominantPollutant,
    };
  }
  if (val <= 300) {
    return {
      standard,
      value: val,
      category: 'Very Unhealthy',
      symbol: '■',
      severityLevel: 5,
      colorToken: 'purple',
      shortAdvisory: 'Avoid outdoor exercise; keep windows closed during inversion peaks and use a well-fitted N95/FFP2 outdoors.',
      dominantPollutant,
    };
  }
  return {
    standard,
    value: val,
    category: 'Hazardous',
    symbol: '✖',
    severityLevel: 6,
    colorToken: 'maroon',
    shortAdvisory: 'Health warning of emergency conditions; stay indoors with filtered air and follow local public health guidance.',
    dominantPollutant,
  };
}

export function estimateInversionRisk(
  windSpeedKmh: number | null,
  boundaryLayerHeightM: number | null,
  pm25: number | null
): 'low' | 'moderate' | 'high' | 'unknown' {
  if (windSpeedKmh === null && boundaryLayerHeightM === null) return 'unknown';
  const lowWind = windSpeedKmh !== null && windSpeedKmh < 8;
  const shallowBlh = boundaryLayerHeightM !== null && boundaryLayerHeightM < 350;
  const elevatedPm = pm25 !== null && pm25 >= 35;

  if ((lowWind && shallowBlh) || (shallowBlh && elevatedPm)) return 'high';
  if (lowWind || shallowBlh || elevatedPm) return 'moderate';
  return 'low';
}

// Deterministic CADR formula: CADR (m3/h) = Room Volume (m3) * Target Air Changes per Hour (ACH)
export function calculateRecommendedCadr(
  roomAreaM2: number,
  ceilingHeightM: number,
  targetAch: number
): CadrCalculationResult {
  const safeArea = Math.max(4, Math.min(250, roomAreaM2));
  const safeHeight = Math.max(2.0, Math.min(6.0, ceilingHeightM));
  const safeAch = Math.max(2, Math.min(8, targetAch));

  const roomVolumeM3 = Number((safeArea * safeHeight).toFixed(1));
  const recommendedCadrM3h = Math.round(roomVolumeM3 * safeAch);
  const recommendedCadrCfm = Math.round(recommendedCadrM3h / 1.699);

  return {
    roomAreaM2: safeArea,
    ceilingHeightM: safeHeight,
    roomVolumeM3,
    targetAch: safeAch,
    recommendedCadrM3h,
    recommendedCadrCfm,
    assumptions: [
      `Formula: CADR (m³/h) = Room Area (${safeArea} m²) × Ceiling Height (${safeHeight} m) × ${safeAch} Air Changes/Hour.`,
      'Conversion: 1 CFM ≈ 1.699 m³/h based on standard HVAC volumetric airflow conversion.',
      'Assumes doors and windows remain mostly closed during high-smog episodes with unobstructed purifier intake.',
      'Select certified True HEPA (H13/H14) or MERV-13+ media; avoid ionizers or ozone-generating devices.',
    ],
  };
}

// Documented transport emission factors (per passenger-km, UK DESNZ / EEA 2024 passenger factors)
const TRAVEL_FACTORS: Record<
  TravelModeId,
  { label: string; co2KgPerKm: number; pm25MgPerKm: number; noxMgPerKm: number; exposureContext: string; note: string }
> = {
  walking: {
    label: 'Walking',
    co2KgPerKm: 0,
    pm25MgPerKm: 0,
    noxMgPerKm: 0,
    exposureContext: 'Direct ambient exposure; higher breathing rate than resting. Check current AQI before long walks near arterial roads.',
    note: 'Zero tailpipe or brake-wear emissions; practical for trips under 2.5 km when AQI is Good or Moderate.',
  },
  cycling: {
    label: 'Cycling / E-Bike',
    co2KgPerKm: 0.005,
    pm25MgPerKm: 1,
    noxMgPerKm: 0,
    exposureContext: 'Elevated ventilation rate increases inhaled dose during smog peaks; consider N95/FFP2 or shifting timing when AQI > 100.',
    note: 'Minimal lifecycle footprint (0.005 kg CO2e/km for e-bike charging); avoids congested exhaust plumes when separated lanes exist.',
  },
  public_transit: {
    label: 'Metro / Light Rail / Bus',
    co2KgPerKm: 0.055,
    pm25MgPerKm: 12,
    noxMgPerKm: 95,
    exposureContext: 'Brief platform/stop exposure; enclosed cabins typically reduce roadside spike exposure compared with open cycling.',
    note: 'Blended urban rail + bus passenger factor (~55 g CO2e/pkm). Substantially lowers per-person road dust and tailpipe emissions.',
  },
  carpool: {
    label: 'Carpool (3 occupants)',
    co2KgPerKm: 0.058,
    pm25MgPerKm: 14,
    noxMgPerKm: 70,
    exposureContext: 'Cabin recirculation mode lowers acute particle peaks on congested corridors; keep cabin filters serviced.',
    note: 'Splits a standard passenger car footprint across 3 riders (~58 g CO2e/pkm), reducing vehicle volume during morning inversions.',
  },
  ev_car: {
    label: 'Battery Electric Car (Grid avg)',
    co2KgPerKm: 0.048,
    pm25MgPerKm: 24,
    noxMgPerKm: 0,
    exposureContext: 'Cabin filtration controls interior exposure; zero tailpipe exhaust, though tire and road wear PM2.5 remains non-zero.',
    note: 'Zero tailpipe NOx; includes grid-average charging (~48 g CO2e/km) and non-exhaust tire/brake PM (~24 mg/km).',
  },
  petrol_car: {
    label: 'Private Petrol Car (Solo)',
    co2KgPerKm: 0.171,
    pm25MgPerKm: 32,
    noxMgPerKm: 210,
    exposureContext: 'In-cabin recirculation lowers PM peaks vs idling with windows open, yet cold winter starts emit elevated hydrocarbons.',
    note: 'Baseline solo petrol passenger car (~171 g CO2e/km, ~32 mg exhaust + brake/tire PM2.5/km).',
  },
  diesel_car: {
    label: 'Private Diesel Car (Solo)',
    co2KgPerKm: 0.168,
    pm25MgPerKm: 42,
    noxMgPerKm: 490,
    exposureContext: 'Similar cabin exposure to petrol, but contributes higher per-km NOx and fine particulate emissions to street canyons.',
    note: 'Solo diesel passenger car (~168 g CO2e/km, ~490 mg NOx/km), a major contributor to winter NO2 episodes.',
  },
};

export function compareTravelModes(distanceKm: number, tripsPerWeek: number): TravelComparisonResult {
  const safeDist = Math.max(0.5, Math.min(300, distanceKm));
  const safeTrips = Math.max(1, Math.min(28, tripsPerWeek));
  const annualDistanceKm = Number((safeDist * safeTrips * 52).toFixed(1));
  const petrolBaselineCo2 = safeDist * TRAVEL_FACTORS.petrol_car.co2KgPerKm;

  const modes = (Object.keys(TRAVEL_FACTORS) as TravelModeId[]).map((mode) => {
    const f = TRAVEL_FACTORS[mode];
    const co2Kg = Number((safeDist * f.co2KgPerKm).toFixed(2));
    const pm25Mg = Math.round(safeDist * f.pm25MgPerKm);
    const noxMg = Math.round(safeDist * f.noxMgPerKm);
    const savingsVsPetrolPct =
      petrolBaselineCo2 > 0 ? Math.round(((petrolBaselineCo2 - co2Kg) / petrolBaselineCo2) * 100) : 0;

    return {
      mode,
      label: f.label,
      co2Kg,
      pm25Mg,
      noxMg,
      savingsVsPetrolPct,
      exposureContext: f.exposureContext,
      practicalAlternativeNote: f.note,
    };
  });

  return {
    distanceKm: safeDist,
    tripsPerWeek: safeTrips,
    annualDistanceKm,
    modes,
    methodologyNote:
      'Calculations use per-passenger-km average emission factors (UK DESNZ / EEA 2024 reference tables), including estimated non-exhaust tire/brake PM2.5 for vehicles.',
    routeSafetyDisclaimer:
      'ClearAir AI compares transport emission footprints and general mode exposure mechanics. It does NOT claim any specific street or route is cleaner without verified hyperlocal sensor coverage along that corridor.',
  };
}

export const IMPACT_ACTION_CATALOG: Record<
  string,
  {
    category: 'transport' | 'energy' | 'waste' | 'indoor_exposure';
    label: string;
    co2SavedKg: number;
    pm25AvoidedG: number;
    exposureHoursManaged: number;
    assumption: string;
  }
> = {
  transit_switch_10km: {
    category: 'transport',
    label: 'Switched 10 km solo car trip to metro/bus',
    co2SavedKg: 1.16,
    pm25AvoidedG: 0.2,
    exposureHoursManaged: 0,
    assumption: '10 km × (0.171 − 0.055) kg CO2e/km and ~20 mg/km PM2.5 reduction.',
  },
  active_commute_5km: {
    category: 'transport',
    label: 'Walked or cycled 5 km instead of driving',
    co2SavedKg: 0.85,
    pm25AvoidedG: 0.16,
    exposureHoursManaged: 0,
    assumption: '5 km × 0.171 kg CO2e/km solo petrol baseline avoided.',
  },
  no_wood_fireplace_evening: {
    category: 'energy',
    label: 'Avoided wood/biomass fireplace for 1 winter evening',
    co2SavedKg: 4.2,
    pm25AvoidedG: 45.0,
    exposureHoursManaged: 4,
    assumption: 'Typical residential wood burn (~3 kg dry wood) emits ~15 g PM2.5/kg; switching to electric heat avoids local smoke.',
  },
  no_yard_waste_burn: {
    category: 'waste',
    label: 'Composted yard/leaf waste instead of open burning',
    co2SavedKg: 6.5,
    pm25AvoidedG: 65.0,
    exposureHoursManaged: 2,
    assumption: 'Prevents ~5 kg dry biomass open combustion (~13 g PM2.5/kg).',
  },
  hepa_peak_smog_shift: {
    category: 'indoor_exposure',
    label: 'Ran HEPA purifier & closed windows during 4h smog peak',
    co2SavedKg: 0,
    pm25AvoidedG: 0,
    exposureHoursManaged: 4,
    assumption: 'Personal exposure-management benefit only (does not reduce outdoor community emissions).',
  },
  thermostat_setback_day: {
    category: 'energy',
    label: 'Lowered fossil heating setpoint by 2 °C for 24h',
    co2SavedKg: 1.8,
    pm25AvoidedG: 0.08,
    exposureHoursManaged: 0,
    assumption: 'Estimated ~8 kWh natural-gas heating savings (~0.22 kg CO2e/kWh).',
  },
};

export function detectPollutionEvents(series: HistoricalDailyPoint[]): PollutionEventContext[] {
  const events: PollutionEventContext[] = [];
  let currentRun: HistoricalDailyPoint[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;
    let peak = currentRun[0];
    for (const pt of currentRun) {
      if ((pt.pm25Avg ?? 0) > (peak.pm25Avg ?? 0)) {
        peak = pt;
      }
    }
    const peakPm25 = Number((peak.pm25Avg ?? 0).toFixed(1));
    const peakAqi = peak.usAqiMax ?? calculateUsAqiFromPollutants({
      pm25: peakPm25,
      pm10: peak.pm10Avg,
      no2: peak.no2Avg,
      o3: peak.o3Avg,
      so2: peak.so2Avg,
      co: peak.coAvg,
    }).aqi ?? 0;

    if (peakPm25 >= 25 || peakAqi >= 100) {
      const severity =
        peakPm25 >= 55 || peakAqi >= 151
          ? 'severe_smog'
          : peakPm25 >= 35.5 || peakAqi >= 101
          ? 'unhealthy_episode'
          : 'moderate_elevated';

      const start = currentRun[0].date;
      const end = currentRun[currentRun.length - 1].date;
      const duration = currentRun.length;
      const month = Number(peak.date.slice(5, 7));
      const seasonalNote =
        month === 11 || month === 12 || month === 1 || month === 2
          ? 'Cool-season meteorological stagnation and shallow nocturnal boundary layers often trap local heating and traffic emissions near ground level.'
          : 'Regional particulate transport, stagnant winds, or photochemical buildup coincided with elevated hourly readings.';

      events.push({
        id: `evt-${start}-${end}`,
        startDate: start,
        endDate: end,
        peakDate: peak.date,
        peakPm25,
        peakAqi,
        severity,
        title:
          severity === 'severe_smog'
            ? `Severe particulate episode (${duration}d)`
            : severity === 'unhealthy_episode'
            ? `Unhealthy smog window (${duration}d)`
            : `Elevated PM2.5 accumulation (${duration}d)`,
        explanation: `Daily mean PM2.5 peaked at ${peakPm25} µg/m³ (max US AQI ${peakAqi}) on ${peak.date}. ${seasonalNote}`,
      });
    }
    currentRun = [];
  };

  for (const day of series) {
    if ((day.pm25Avg ?? 0) >= 22 || (day.usAqiMax ?? 0) >= 95) {
      currentRun.push(day);
    } else {
      flushRun();
    }
  }
  flushRun();

  return events.slice(0, 6);
}
