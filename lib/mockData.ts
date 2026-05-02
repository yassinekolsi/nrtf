// Mock data for EnergyOS - Kilani Group Adwya Site

export interface SensorReading {
  timestamp: string;
  sensor_id: string;
  value: number;
  unit: string;
  site_id: string;
}

export interface Document {
  id: string;
  upload_date: string;
  doc_type: "Relevé STEG" | "Facture SONEDE" | "Rapport Interne";
  period: string;
  extracted_json: Record<string, unknown>;
  status: "Traité" | "En cours";
  main_value?: string;
}

export interface Alarm {
  id: string;
  timestamp: string;
  equipment: string;
  description: string;
  severity: "Critique" | "Moyen" | "Info";
  status: "En cours" | "Acquitté";
  acknowledged_at?: string;
}

// Current KPIs
export const currentKPIs = {
  puissanceMoteur: 1195, // kW
  temperature: 28.4, // °C
  importSTEG: -407, // kW (negative = selling)
  facteurPuissance: 0.97,
  eauGlaceeTT01: 6.2, // °C
  eauChaudeTT03: 101, // °C
  heuresMoteur: 19279, // h
  absorptionPuissanceMesuree: 261, // kW
  absorptionPuissanceNominale: 802, // kW
};

// Generate hourly data for last 24 hours
export const last24HoursData: SensorReading[] = (() => {
  const data: SensorReading[] = [];
  const now = new Date();
  
  for (let i = 23; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = timestamp.getHours();
    
    // Engine power - steady around 1180-1210 kW
    const enginePower = 1180 + Math.random() * 30;
    
    // STEG import - fluctuating between -420 and +50 kW
    // More negative during peak hours (engine produces more than needed)
    let stegImport: number;
    if (hour >= 8 && hour <= 18) {
      stegImport = -350 - Math.random() * 70; // Selling during day
    } else {
      stegImport = -100 + Math.random() * 150; // Less selling at night
    }
    
    data.push({
      timestamp: timestamp.toISOString(),
      sensor_id: "ENGINE_POWER",
      value: Math.round(enginePower),
      unit: "kW",
      site_id: "ADWYA"
    });
    
    data.push({
      timestamp: timestamp.toISOString(),
      sensor_id: "STEG_IMPORT",
      value: Math.round(stegImport),
      unit: "kW",
      site_id: "ADWYA"
    });
  }
  
  return data;
})();

// Chart data formatted for Recharts
export const powerChartData = (() => {
  const engineData = last24HoursData.filter(d => d.sensor_id === "ENGINE_POWER");
  const stegData = last24HoursData.filter(d => d.sensor_id === "STEG_IMPORT");
  
  return engineData.map((eng, i) => ({
    time: new Date(eng.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    puissanceMoteur: eng.value,
    importSTEG: stegData[i]?.value || 0
  }));
})();

// Active Alarms
export const activeAlarms: Alarm[] = [
  {
    id: "ALM001",
    timestamp: "2026-04-13T11:21:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "En cours"
  },
  {
    id: "ALM002",
    timestamp: "2026-04-08T10:04:00",
    equipment: "Chiller Beta-2",
    description: "HW_DP_SWITCH_TRIP",
    severity: "Moyen",
    status: "En cours"
  },
  {
    id: "ALM003",
    timestamp: "2026-04-05T08:30:00",
    equipment: "Machine à Absorption",
    description: "ABSO_PUMP_NOT_RESPOND",
    severity: "Moyen",
    status: "En cours"
  }
];

// All alarms (historical)
export const allAlarms: Alarm[] = [
  ...activeAlarms,
  // Additional historical alarms - OVERFLOW_TEMP_HIGH repeating
  {
    id: "ALM004",
    timestamp: "2026-04-13T10:15:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "Acquitté",
    acknowledged_at: "2026-04-13T10:45:00"
  },
  {
    id: "ALM005",
    timestamp: "2026-04-13T09:02:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "Acquitté",
    acknowledged_at: "2026-04-13T09:30:00"
  },
  {
    id: "ALM006",
    timestamp: "2026-04-12T14:33:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "Acquitté",
    acknowledged_at: "2026-04-12T15:00:00"
  },
  {
    id: "ALM007",
    timestamp: "2026-04-12T13:45:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "Acquitté",
    acknowledged_at: "2026-04-12T14:10:00"
  },
  {
    id: "ALM008",
    timestamp: "2026-04-10T16:20:00",
    equipment: "CAT Engine",
    description: "ENGINE_PARALLEL_MODE_EVENT",
    severity: "Info",
    status: "Acquitté",
    acknowledged_at: "2026-04-10T16:25:00"
  },
  {
    id: "ALM009",
    timestamp: "2026-04-09T11:00:00",
    equipment: "Chiller Gamma-1",
    description: "COLLECTIVE_FAULT",
    severity: "Moyen",
    status: "Acquitté",
    acknowledged_at: "2026-04-09T11:30:00"
  },
  {
    id: "ALM010",
    timestamp: "2026-04-08T09:15:00",
    equipment: "Chiller Alpha-1",
    description: "OVERFLOW_TEMP_HIGH",
    severity: "Critique",
    status: "Acquitté",
    acknowledged_at: "2026-04-08T09:45:00"
  },
  {
    id: "ALM011",
    timestamp: "2026-04-07T15:30:00",
    equipment: "CAT Engine",
    description: "ENGINE_PARALLEL_MODE_EVENT",
    severity: "Info",
    status: "Acquitté",
    acknowledged_at: "2026-04-07T15:35:00"
  },
  {
    id: "ALM012",
    timestamp: "2026-04-06T10:45:00",
    equipment: "Boiler 1",
    description: "STEAM_PRESSURE_LOW",
    severity: "Moyen",
    status: "Acquitté",
    acknowledged_at: "2026-04-06T11:00:00"
  }
];

// Monthly consumption data (last 6 months)
export const monthlyConsumptionData = [
  { month: "Nov 2025", monthKey: "2025-11", gazNm3: 196560, gazKWh: 196800, autoproductionKWh: 864000, importSTEGKWh: 45200, co2Evite: 432 },
  { month: "Dec 2025", monthKey: "2025-12", gazNm3: 201240, gazKWh: 201400, autoproductionKWh: 878400, importSTEGKWh: 38600, co2Evite: 439 },
  { month: "Jan 2026", monthKey: "2026-01", gazNm3: 198900, gazKWh: 199100, autoproductionKWh: 870000, importSTEGKWh: 42100, co2Evite: 435 },
  { month: "Feb 2026", monthKey: "2026-02", gazNm3: 179280, gazKWh: 179500, autoproductionKWh: 784000, importSTEGKWh: 51200, co2Evite: 392 },
  { month: "Mar 2026", monthKey: "2026-03", gazNm3: 195120, gazKWh: 195300, autoproductionKWh: 856800, importSTEGKWh: 39800, co2Evite: 428 },
  { month: "Apr 2026", monthKey: "2026-04", gazNm3: 189000, gazKWh: 189200, autoproductionKWh: 828000, importSTEGKWh: 48500, co2Evite: 414 }
];

// STEG billing data (November 2025)
export const stegBillingData = [
  { trancheHoraire: "Jour", code: "1.8.3", ancienIndex: 1245678, nouvelIndex: 1267890, consommationKWh: 22212 },
  { trancheHoraire: "Pointe", code: "2.8.3", ancienIndex: 345678, nouvelIndex: 356789, consommationKWh: 11111 },
  { trancheHoraire: "Nuit", code: "2.8.2", ancienIndex: 567890, nouvelIndex: 578901, consommationKWh: 11011 },
  { trancheHoraire: "Soir", code: "2.8.4", ancienIndex: 234567, nouvelIndex: 245678, consommationKWh: 11111 },
  { trancheHoraire: "Jointe", code: "1.8.2", ancienIndex: 123456, nouvelIndex: 134567, consommationKWh: 11111 },
  { trancheHoraire: "Réactive", code: "1.8.4", ancienIndex: 89012, nouvelIndex: 95678, consommationKWh: 6666 }
];

export const stegTotalAmount = "47 250 DT TTC";

// Documents
export const documents: Document[] = [
  {
    id: "DOC001",
    upload_date: "2025-12-01",
    doc_type: "Relevé STEG",
    period: "Novembre 2025",
    extracted_json: {
      totalConsommation: "73 222 kWh",
      montantTTC: "47 250 DT"
    },
    status: "Traité"
  },
  {
    id: "DOC002",
    upload_date: "2024-12-15",
    doc_type: "Facture SONEDE",
    period: "Novembre 2024",
    extracted_json: {
      volumeM3: "4 261 m³",
      montantTTC: "19 140 DT"
    },
    status: "Traité",
    main_value: "4 261 m³ / 19 140 DT"
  },
  {
    id: "DOC003",
    upload_date: "2025-06-20",
    doc_type: "Rapport Interne",
    period: "2024-2025",
    extracted_json: {
      titre: "Rapport Audit Adwya",
      auteur: "Direction Technique"
    },
    status: "Traité"
  }
];

// 30 days daily data for tri-generation charts
export const last30DaysProduction = (() => {
  const data = [];
  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    
    // Production électrique journalière around 28000-29000 kWh/day
    const production = 28000 + Math.random() * 1000;
    
    // Temperature TT01 mostly 6-7°C with some spikes
    let tempTT01: number;
    const isSpike = [5, 12, 18, 25].includes(i); // 4 spike days
    if (isSpike) {
      tempTT01 = 15 + Math.random() * 3; // Spike to 15-18°C
    } else {
      tempTT01 = 6 + Math.random() * 1; // Normal 6-7°C
    }
    
    data.push({
      date: dayStr,
      productionKWh: Math.round(production),
      tempTT01: Math.round(tempTT01 * 10) / 10,
      isAnomaly: isSpike
    });
  }
  
  return data;
})();

// Equipment list for filters
export const equipmentList = [
  "Chiller Alpha-1",
  "Chiller Alpha-2",
  "Chiller Beta-1",
  "Chiller Beta-2",
  "Chiller Gamma-1",
  "Chiller Gamma-2",
  "CAT Engine",
  "Machine à Absorption",
  "Boiler 1",
  "Boiler 2"
];

// Alarm counts
export const alarmCounts = {
  enCours: 33,
  total: 109
};
