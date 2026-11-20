import type { LanguageCode } from './types.ts';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  es: 'Español',
  hi: 'हिन्दी',
  fr: 'Français',
};

export const UI_COPY: Record<
  LanguageCode,
  {
    navDashboard: string;
    navHistory: string;
    navAssistant: string;
    navPlanners: string;
    navCommunity: string;
    householdSettings: string;
    searchLocationPlaceholder: string;
    useMyLocation: string;
    revokeLocation: string;
    currentAirQuality: string;
    inversionRisk: string;
    trend: string;
    pollutantBreakdown: string;
    hourlyForecast: string;
    historicalTrends: string;
    askAssistantTitle: string;
    deepThinkingLabel: string;
    fastModeLabel: string;
    indoorGuideTitle: string;
    travelPlannerTitle: string;
    impactDashboardTitle: string;
    communityTitle: string;
    userGeneratedWarning: string;
    lowDataMode: string;
    darkMode: string;
    lightMode: string;
  }
> = {
  en: {
    navDashboard: 'Dashboard',
    navHistory: 'History',
    navAssistant: 'Assistant',
    navPlanners: 'Planners',
    navCommunity: 'Community',
    householdSettings: 'Household & Settings',
    searchLocationPlaceholder: 'Search city or district (e.g., Delhi, Oslo, London)...',
    useMyLocation: 'Use GPS',
    revokeLocation: 'Revoke GPS',
    currentAirQuality: 'Current Air Quality',
    inversionRisk: 'Inversion Risk',
    trend: '6h Trend',
    pollutantBreakdown: 'Pollutant Telemetry',
    hourlyForecast: '24-Hour Air Quality & Wind Outlook',
    historicalTrends: 'Historical Air Quality & Pollution Episodes',
    askAssistantTitle: 'ClearAir Intelligence Assistant',
    deepThinkingLabel: 'Deep Reasoning (High Thinking)',
    fastModeLabel: 'Fast Guidance',
    indoorGuideTitle: 'Indoor Air Quality & Filtration Guide',
    travelPlannerTitle: 'Smart Travel & Emission Planner',
    impactDashboardTitle: 'Personal Impact & Sustainable Lifestyle',
    communityTitle: 'Neighborhood Observations & Clean-Air Initiatives',
    userGeneratedWarning: 'User-Generated Observation · Not Official AQI Data',
    lowDataMode: 'Low-Data Mode',
    darkMode: 'Dark Theme',
    lightMode: 'Light Theme',
  },
  es: {
    navDashboard: 'Panel',
    navHistory: 'Historial',
    navAssistant: 'Asistente',
    navPlanners: 'Planificadores',
    navCommunity: 'Comunidad',
    householdSettings: 'Hogar y Ajustes',
    searchLocationPlaceholder: 'Buscar ciudad o distrito (ej. Madrid, Bogotá, Oslo)...',
    useMyLocation: 'Usar GPS',
    revokeLocation: 'Revocar GPS',
    currentAirQuality: 'Calidad del Aire Actual',
    inversionRisk: 'Riesgo de Inversión',
    trend: 'Tendencia 6h',
    pollutantBreakdown: 'Telemetría de Contaminantes',
    hourlyForecast: 'Pronóstico de Aire y Viento (24h)',
    historicalTrends: 'Historial de Calidad del Aire y Episodios',
    askAssistantTitle: 'Asistente Inteligente ClearAir',
    deepThinkingLabel: 'Razonamiento Profundo',
    fastModeLabel: 'Guía Rápida',
    indoorGuideTitle: 'Guía de Aire Interior y Filtración',
    travelPlannerTitle: 'Planificador de Viaje Sostenible',
    impactDashboardTitle: 'Impacto Personal y Estilo de Vida',
    communityTitle: 'Observaciones Locales e Iniciativas Comunitarias',
    userGeneratedWarning: 'Observación de Usuario · No es Dato Oficial de ICA',
    lowDataMode: 'Modo Bajo Consumo',
    darkMode: 'Modo Oscuro',
    lightMode: 'Modo Claro',
  },
  hi: {
    navDashboard: 'डैशबोर्ड',
    navHistory: 'इतिहास',
    navAssistant: 'सहायक',
    navPlanners: 'योजनाकार',
    navCommunity: 'समुदाय',
    householdSettings: 'परिवार और सेटिंग्स',
    searchLocationPlaceholder: 'शहर खोजें (जैसे दिल्ली, लाहौर, लंदन)...',
    useMyLocation: 'जीपीएस उपयोग करें',
    revokeLocation: 'जीपीएस हटाएं',
    currentAirQuality: 'वर्तमान वायु गुणवत्ता',
    inversionRisk: 'इनवर्जन जोखिम',
    trend: '6 घंटे का रुझान',
    pollutantBreakdown: 'प्रदूषक माप',
    hourlyForecast: '24-घंटे वायु व हवा पूर्वानुमान',
    historicalTrends: 'ऐतिहासिक वायु गुणवत्ता और प्रदूषण घटनाएं',
    askAssistantTitle: 'ClearAir इंटेलिजेंस सहायक',
    deepThinkingLabel: 'गहन विश्लेषण मोड',
    fastModeLabel: 'त्वरित सलाह',
    indoorGuideTitle: 'इनडोर वायु गुणवत्ता और फिल्ट्रेशन गाइड',
    travelPlannerTitle: 'स्मार्ट यात्रा और उत्सर्जन योजनाकार',
    impactDashboardTitle: 'व्यक्तिगत प्रभाव और टिकाऊ जीवनशैली',
    communityTitle: 'स्थानीय अवलोकन और स्वच्छ वायु पहल',
    userGeneratedWarning: 'उपयोगकर्ता-जनित अवलोकन · आधिकारिक AQI डेटा नहीं',
    lowDataMode: 'लो-डेटा मोड',
    darkMode: 'डार्क थीम',
    lightMode: 'लाइट थीम',
  },
  fr: {
    navDashboard: 'Tableau',
    navHistory: 'Historique',
    navAssistant: 'Assistant',
    navPlanners: 'Planificateurs',
    navCommunity: 'Communauté',
    householdSettings: 'Foyer & Paramètres',
    searchLocationPlaceholder: 'Rechercher une ville (ex. Paris, Lyon, Oslo)...',
    useMyLocation: 'Utiliser GPS',
    revokeLocation: 'Révoquer GPS',
    currentAirQuality: 'Qualité de l’Air Actuelle',
    inversionRisk: 'Risque d’Inversion',
    trend: 'Tendance 6h',
    pollutantBreakdown: 'Télémétrie des Polluants',
    hourlyForecast: 'Prévisions Air & Vent (24h)',
    historicalTrends: 'Historique de l’Air et Épisodes',
    askAssistantTitle: 'Assistant Intelligent ClearAir',
    deepThinkingLabel: 'Raisonnement Approfondi',
    fastModeLabel: 'Conseil Rapide',
    indoorGuideTitle: 'Guide Air Intérieur & Filtration',
    travelPlannerTitle: 'Planificateur de Trajet Durable',
    impactDashboardTitle: 'Impact Personnel & Mode de Vie',
    communityTitle: 'Observations Locales & Initiatives Citoyennes',
    userGeneratedWarning: 'Observation Citoyenne · Donnée Non Officielle',
    lowDataMode: 'Mode Bas Débit',
    darkMode: 'Thème Sombre',
    lightMode: 'Thème Clair',
  },
};
