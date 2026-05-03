"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "fr";

interface Translations {
  // Navigation
  dashboard: string;
  energy: string;
  trigeneration: string;
  documents: string;
  alerts: string;
  recovery: string;
  
  // Top bar
  siteName: string;
  
  // Dashboard
  enginePower: string;
  gasConsumption: string;
  stegImport: string;
  powerFactor: string;
  activeAlarms: string;
  acknowledge: string;
  last24Hours: string;
  
  // Energy page
  consumption: string;
  stegBilling: string;
  month: string;
  gas: string;
  autoproduction: string;
  co2Avoided: string;
  timeSlot: string;
  code: string;
  oldIndex: string;
  newIndex: string;
  consumptionKWh: string;
  totalAmount: string;
  importReading: string;
  
  // Tri-generation
  activePower: string;
  chilledWater: string;
  hotWater: string;
  engineHours: string;
  dailyElectricalProduction: string;
  chilledWaterTemp: string;
  absorptionMachine: string;
  measuredCoolingPower: string;
  nominalPower: string;
  utilization: string;
  
  // Documents
  uploadZone: string;
  uploadZoneDesc: string;
  date: string;
  type: string;
  period: string;
  mainValue: string;
  status: string;
  processed: string;
  inProgress: string;
  
  // Alerts
  dateTime: string;
  equipment: string;
  description: string;
  severity: string;
  critical: string;
  medium: string;
  info: string;
  ongoing: string;
  acknowledged: string;
  allEquipment: string;
  allSeverities: string;
  filterByDate: string;
  
  // Common
  kw: string;
  kwh: string;
  celsius: string;
  hours: string;
}

const translations: Record<Language, Translations> = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    energy: "Energy & Billing",
    trigeneration: "Tri-generation",
    documents: "Documents",
    alerts: "Alerts & History",
    recovery: "Waste Heat",
    
    // Top bar
    siteName: "Kilani Group — Adwya Site",
    
    // Dashboard
    enginePower: "Engine Power",
    gasConsumption: "Gas Consumption",
    stegImport: "STEG Import",
    powerFactor: "Power Factor",
    activeAlarms: "Active Alarms",
    acknowledge: "Acknowledge",
    last24Hours: "Last 24 Hours",
    
    // Energy page
    consumption: "Consumption",
    stegBilling: "STEG Billing",
    month: "Month",
    gas: "Gas",
    autoproduction: "Autoproduction",
    co2Avoided: "CO₂ Avoided",
    timeSlot: "Time Slot",
    code: "Code",
    oldIndex: "Old Index",
    newIndex: "New Index",
    consumptionKWh: "Consumption (kWh)",
    totalAmount: "Total Amount",
    importReading: "Import Reading",
    
    // Tri-generation
    activePower: "Active Power",
    chilledWater: "Chilled Water TT01",
    hotWater: "Hot Water TT03",
    engineHours: "Engine Hours",
    dailyElectricalProduction: "Daily Electrical Production",
    chilledWaterTemp: "Chilled Water Temperature TT01",
    absorptionMachine: "Absorption Machine",
    measuredCoolingPower: "Measured Cooling Power",
    nominalPower: "Nominal Power",
    utilization: "Utilization",
    
    // Documents
    uploadZone: "Upload Documents",
    uploadZoneDesc: "Drag & drop PDF or XLSX files here, or click to browse",
    date: "Date",
    type: "Type",
    period: "Period",
    mainValue: "Main Value",
    status: "Status",
    processed: "Processed",
    inProgress: "In Progress",
    
    // Alerts
    dateTime: "Date/Time",
    equipment: "Equipment",
    description: "Description",
    severity: "Severity",
    critical: "Critical",
    medium: "Medium",
    info: "Info",
    ongoing: "Ongoing",
    acknowledged: "Acknowledged",
    allEquipment: "All Equipment",
    allSeverities: "All Severities",
    filterByDate: "Filter by Date",
    
    // Common
    kw: "kW",
    kwh: "kWh",
    celsius: "°C",
    hours: "h",
  },
  fr: {
    // Navigation
    dashboard: "Tableau de Bord",
    energy: "Énergie & Facturation",
    trigeneration: "Tri-génération",
    documents: "Documents",
    alerts: "Alertes & Historique",
    recovery: "Chaleur Fatale",
    
    // Top bar
    siteName: "Kilani Group — Site Adwya",
    
    // Dashboard
    enginePower: "Puissance Moteur",
    gasConsumption: "Consommation Gaz",
    stegImport: "Import STEG",
    powerFactor: "Facteur de Puissance",
    activeAlarms: "Alarmes Actives",
    acknowledge: "Acquitter",
    last24Hours: "Dernières 24 Heures",
    
    // Energy page
    consumption: "Consommation",
    stegBilling: "Facturation STEG",
    month: "Mois",
    gas: "Gaz",
    autoproduction: "Autoproduction",
    co2Avoided: "CO₂ Évité",
    timeSlot: "Tranche Horaire",
    code: "Code",
    oldIndex: "Ancien Index",
    newIndex: "Nouvel Index",
    consumptionKWh: "Consommation (kWh)",
    totalAmount: "Montant Total",
    importReading: "Importer un relevé",
    
    // Tri-generation
    activePower: "Puissance Active",
    chilledWater: "Eau Glacée TT01",
    hotWater: "Eau Chaude TT03",
    engineHours: "Heures Moteur",
    dailyElectricalProduction: "Production Électrique Journalière",
    chilledWaterTemp: "Température Eau Glacée TT01",
    absorptionMachine: "Machine à Absorption",
    measuredCoolingPower: "Puissance Frigorifique Mesurée",
    nominalPower: "Puissance Nominale",
    utilization: "Utilisation",
    
    // Documents
    uploadZone: "Télécharger des Documents",
    uploadZoneDesc: "Glissez-déposez des fichiers PDF ou XLSX ici, ou cliquez pour parcourir",
    date: "Date",
    type: "Type",
    period: "Période",
    mainValue: "Valeur Principale",
    status: "Statut",
    processed: "Traité",
    inProgress: "En cours",
    
    // Alerts
    dateTime: "Date/Heure",
    equipment: "Équipement",
    description: "Description",
    severity: "Sévérité",
    critical: "Critique",
    medium: "Moyen",
    info: "Info",
    ongoing: "En cours",
    acknowledged: "Acquitté",
    allEquipment: "Tous les Équipements",
    allSeverities: "Toutes les Sévérités",
    filterByDate: "Filtrer par Date",
    
    // Common
    kw: "kW",
    kwh: "kWh",
    celsius: "°C",
    hours: "h",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  
  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
      t: translations[language] 
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
