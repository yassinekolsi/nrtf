"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";

import { KPICard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DocumentBatchUploadResponse,
  DocumentRecord,
  DocumentsSummary,
  ReviewStatus,
  fetchDocuments,
  fetchDocumentsSummary,
  getDocumentSourceUrl,
  getDocumentsApiBaseUrl,
  reviewDocument,
  uploadDocumentsBatch,
  uploadExcelDocuments,
} from "@/lib/documents-api";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

const AUTO_OPTION = "AUTO";
const DOC_TYPE_OPTIONS = [
  "STEG_ELECTRICITY_BILL",
  "STEG_GAS_BILL",
  "SONEDE_WATER_BILL",
  "STEG_METER_READING",
  "STEG_PURCHASE_SALE_READING",
  "OTHER",
];
const SUPPLIER_OPTIONS = ["STEG", "SONEDE", "OTHER"];
const ENERGY_TYPE_OPTIONS = [
  "electricity",
  "natural_gas",
  "water",
  "fuel_oil",
  "coal",
  "other",
];

type ReviewFormState = {
  docType: string;
  supplier: string;
  billingMonth: string;
  documentDate: string;
  invoiceNumber: string;
  referenceNumber: string;
  siteName: string;
  clientName: string;
  energyType: string;
  rawValue: string;
  rawUnit: string;
  pciFactor: string;
  amountTtc: string;
  indexAncien: string;
  indexNouveau: string;
  subscribedPower: string;
};

function getDefaultMonthInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthForApi(monthInput: string) {
  if (!monthInput.includes("-")) {
    return monthInput;
  }

  const [year, month] = monthInput.split("-");
  return `${month}/${year}`;
}

function formatMonthForInput(billingMonth: string | null | undefined) {
  if (!billingMonth) {
    return "";
  }

  const match = /^(\d{2})\/(\d{4})$/.exec(billingMonth);
  if (!match) {
    return "";
  }

  return `${match[2]}-${match[1]}`;
}

function formatNumber(value: unknown, maximumFractionDigits = 2) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits,
  }).format(numericValue);
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const absoluteDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function parseDateValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatAbsoluteDateTime(value: Date | null) {
  return value ? absoluteDateTimeFormatter.format(value) : "—";
}

function formatRelativeTime(value: Date | null, nowMs: number) {
  if (!value) {
    return "—";
  }

  const diffMs = value.getTime() - nowMs;
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs < 45_000) {
    return "just now";
  }

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (absDiffMs < hourMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / minuteMs), "minute");
  }
  if (absDiffMs < dayMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / hourMs), "hour");
  }
  if (absDiffMs < weekMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / dayMs), "day");
  }
  if (absDiffMs < monthMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / weekMs), "week");
  }
  if (absDiffMs < yearMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / monthMs), "month");
  }

  return relativeTimeFormatter.format(Math.round(diffMs / yearMs), "year");
}

function getRawObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type MeterRegisterRow = {
  register: string;
  registerId: string | null;
  readingName: string | null;
  side: string | null;
  registerRole: string | null;
  flowDirection: string | null;
  tariffPeriod: string | null;
  quantityType: string | null;
  unit: string | null;
  label: string | null;
  code: string | null;
  ancien: number | null;
  nouveau: number | null;
  delta: number | null;
};

type MeterRegister = {
  registerLabel: string;
  registerId: string | null;
  readingName: string | null;
  side: string | null;
  registerRole: string | null;
  flowDirection: string | null;
  rows: MeterRegisterRow[];
};

function getStringField(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumberField(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeMeterRow(
  value: unknown,
  fallbackRegister: string,
  fallbackRegisterId: string | null,
  fallbackReadingName: string | null
): MeterRegisterRow | null {
  const record = getRawObject(value);
  if (!record) {
    return null;
  }

  const label = getStringField(record, "label");
  const code = getStringField(record, "code");
  const side = getStringField(record, "side");
  const registerRole = getStringField(record, "register_role");
  const flowDirection = getStringField(record, "flow_direction");
  const tariffPeriod = getStringField(record, "tariff_period");
  const quantityType = getStringField(record, "quantity_type");
  const unit = getStringField(record, "unit");
  const ancien = getNumberField(record, "ancien");
  const nouveau = getNumberField(record, "nouveau");
  const delta =
    getNumberField(record, "delta") ??
    (ancien != null && nouveau != null ? nouveau - ancien : null);

  if (label == null && code == null && ancien == null && nouveau == null) {
    return null;
  }

  return {
    register: fallbackRegister,
    registerId: fallbackRegisterId,
    readingName: fallbackReadingName,
    side,
    registerRole,
    flowDirection,
    tariffPeriod,
    quantityType,
    unit,
    label,
    code,
    ancien,
    nouveau,
    delta,
  };
}

function getMeterRegisters(docSpecific: Record<string, unknown> | null) {
  if (!docSpecific) {
    return [] as MeterRegister[];
  }

  const groupedRegisters = docSpecific.registers;
  if (Array.isArray(groupedRegisters)) {
    const normalized = groupedRegisters
      .map((value) => {
        const record = getRawObject(value);
        if (!record) {
          return null;
        }

        const registerLabel =
          getStringField(record, "register_label", "register", "type") ?? "Register";
        const registerId = getStringField(record, "register_id");
        const readingName = getStringField(record, "reading_name");
        const side = getStringField(record, "side");
        const registerRole = getStringField(record, "register_role");
        const flowDirection = getStringField(record, "flow_direction");
        const rowsSource = record.rows;
        const rows = Array.isArray(rowsSource)
          ? rowsSource
              .map((rowValue) =>
                normalizeMeterRow(rowValue, registerLabel, registerId, readingName)
              )
              .filter((row): row is MeterRegisterRow => row !== null)
          : [];

        if (rows.length === 0) {
          return null;
        }

        return {
          registerLabel,
          registerId,
          readingName,
          side: side ?? rows[0]?.side ?? null,
          registerRole: registerRole ?? rows[0]?.registerRole ?? null,
          flowDirection: flowDirection ?? rows[0]?.flowDirection ?? null,
          rows,
        } satisfies MeterRegister;
      })
      .filter((value): value is MeterRegister => value !== null);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  const flatRows = docSpecific.register_rows;
  if (!Array.isArray(flatRows)) {
    return [] as MeterRegister[];
  }

  const grouped = new Map<string, MeterRegister>();
  for (const value of flatRows) {
    const record = getRawObject(value);
    if (!record) {
      continue;
    }

    const registerLabel =
      getStringField(record, "register_label", "register", "type") ?? "Register";
    const registerId = getStringField(record, "register_id");
    const readingName = getStringField(record, "reading_name");
    const side = getStringField(record, "side");
    const registerRole = getStringField(record, "register_role");
    const flowDirection = getStringField(record, "flow_direction");
    const key = `${registerLabel}::${registerId ?? ""}::${readingName ?? ""}`;

    let group = grouped.get(key);
    if (!group) {
      group = {
        registerLabel,
        registerId,
        readingName,
        side,
        registerRole,
        flowDirection,
        rows: [],
      };
      grouped.set(key, group);
    }

    const row = normalizeMeterRow(value, registerLabel, registerId, readingName);
    if (row) {
      group.side = group.side ?? row.side;
      group.registerRole = group.registerRole ?? row.registerRole;
      group.flowDirection = group.flowDirection ?? row.flowDirection;
      group.rows.push(row);
    }
  }

  return Array.from(grouped.values()).filter((group) => group.rows.length > 0);
}

function formatStructuredLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const labels: Record<string, string> = {
    consumption: "Consumption Side",
    injection: "Injection Side",
    production: "Production Side",
    grid_consumption: "Grid Consumption",
    injection_principal: "Injection Principal",
    injection_redressee: "Injection Redressee",
    production_ctr: "Production CTR",
    active_energy: "Active Energy",
    reactive_energy: "Reactive Energy",
    demand: "Demand",
    import: "Import",
    export: "Export",
    produced: "Produced",
  };
  if (labels[value]) {
    return labels[value];
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isBlankMeterValue(value: number | null) {
  return value == null || value === 0;
}

function isBlankMeterRow(row: MeterRegisterRow) {
  return (
    isBlankMeterValue(row.ancien) &&
    isBlankMeterValue(row.nouveau) &&
    isBlankMeterValue(row.delta)
  );
}

function getVisibleMeterRows(register: MeterRegister) {
  if (register.rows.length === 0) {
    return [];
  }

  if (register.rows.every(isBlankMeterRow)) {
    return register.rows;
  }

  return register.rows.filter((row) => !isBlankMeterRow(row));
}

function getCanonical(doc: DocumentRecord) {
  const canonical = getRawObject(doc.raw_json?.canonical);
  return canonical ?? {};
}

function getWarnings(doc: DocumentRecord) {
  const warnings = doc.raw_json?.warnings;
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings
    .map((warning) => (typeof warning === "string" ? warning.trim() : ""))
    .filter(Boolean);
}

function getSourceContentType(doc: DocumentRecord) {
  const sourceContentType = doc.raw_json?.source_content_type;
  if (typeof sourceContentType === "string" && sourceContentType.trim()) {
    return sourceContentType;
  }

  const filename = doc.filename.toLowerCase();
  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (filename.endsWith(".png")) {
    return "image/png";
  }
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

function isImageContentType(contentType: string | null) {
  return typeof contentType === "string" && contentType.startsWith("image/");
}

function isPdfContentType(contentType: string | null) {
  return contentType === "application/pdf";
}

function getReviewStatus(doc: DocumentRecord) {
  return doc.review_status;
}

function getOverallConfidence(doc: DocumentRecord) {
  if (typeof doc.overall_confidence === "number") {
    return doc.overall_confidence;
  }

  const fromPayload = doc.raw_json?.overall_confidence;
  return typeof fromPayload === "number" ? fromPayload : null;
}

function getDocumentCreatedAt(doc: DocumentRecord) {
  return parseDateValue(doc.created_at);
}

function getDocumentSortTimestamp(doc: DocumentRecord) {
  return getDocumentCreatedAt(doc)?.getTime() ?? 0;
}

function sortDocumentsNewestFirst(items: DocumentRecord[]) {
  return [...items].sort((left, right) => {
    const timestampDiff = getDocumentSortTimestamp(right) - getDocumentSortTimestamp(left);
    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return right.id.localeCompare(left.id);
  });
}

function getDocumentUploadedLabel(doc: DocumentRecord) {
  return formatAbsoluteDateTime(getDocumentCreatedAt(doc));
}

function getDocumentUploadedRelativeLabel(doc: DocumentRecord, nowMs: number) {
  return formatRelativeTime(getDocumentCreatedAt(doc), nowMs);
}

function getDisplayDate(doc: DocumentRecord) {
  const canonical = getCanonical(doc);
  const documentDate = canonical.document_date;
  if (typeof documentDate === "string" && documentDate.trim()) {
    return documentDate;
  }

  return doc.billing_month ?? "—";
}

function getMeterRowKey(
  register: MeterRegister,
  row: MeterRegisterRow,
  rowIndex: number
) {
  return [
    register.registerLabel,
    register.registerId ?? "none",
    register.readingName ?? "none",
    register.side ?? "none",
    row.label ?? "none",
    row.code ?? "none",
    row.ancien ?? "none",
    row.nouveau ?? "none",
    row.delta ?? "none",
    rowIndex,
  ].join("::");
}

function getDisplayMainValue(doc: DocumentRecord) {
  const canonical = getCanonical(doc);
  const rawValue = canonical.raw_value;
  const rawUnit = canonical.raw_unit;
  const docSpecific = getRawObject(doc.raw_json?.doc_specific);
  const meterRegisters = getMeterRegisters(docSpecific);

  if (
    (doc.doc_type === "STEG_METER_READING" ||
      doc.doc_type === "STEG_PURCHASE_SALE_READING") &&
    meterRegisters.length > 0
  ) {
    if (doc.doc_type === "STEG_PURCHASE_SALE_READING") {
      return "Purchase / sale registers";
    }
    return meterRegisters.length > 1 ? "Multiple registers" : "Meter register";
  }

  if (typeof rawValue === "number" && typeof rawUnit === "string") {
    return `${formatNumber(rawValue)} ${rawUnit}`;
  }

  if (typeof doc.normalized_kwh === "number") {
    return `${formatNumber(doc.normalized_kwh)} kWh`;
  }

  return "—";
}

function getStatusLabel(status: ReviewStatus) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "requires_review":
      return "Requires Review";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

function getStatusBadgeClass(status: ReviewStatus) {
  switch (status) {
    case "accepted":
      return "bg-energy-green text-energy-green-foreground";
    case "requires_review":
      return "bg-warning-amber text-warning-amber-foreground";
    case "failed":
      return "bg-alarm-red text-alarm-red-foreground";
    default:
      return "bg-muted text-foreground";
  }
}

function formatDocType(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const labels: Record<string, string> = {
    STEG_PURCHASE_SALE_READING: "STEG Purchase / Sale Reading",
    STEG_METER_READING: "STEG Meter Reading",
    STEG_ELECTRICITY_BILL: "STEG Electricity Bill",
    STEG_GAS_BILL: "STEG Gas Bill",
    SONEDE_WATER_BILL: "SONEDE Water Bill",
  };
  if (labels[value]) {
    return labels[value];
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createReviewForm(doc: DocumentRecord | null): ReviewFormState {
  const canonical = doc ? getCanonical(doc) : {};

  return {
    docType: typeof canonical.doc_type === "string" ? canonical.doc_type : doc?.doc_type ?? "OTHER",
    supplier:
      typeof canonical.supplier === "string"
        ? canonical.supplier
        : doc?.supplier ?? "OTHER",
    billingMonth: formatMonthForInput(
      typeof canonical.billing_month === "string" ? canonical.billing_month : doc?.billing_month
    ),
    documentDate:
      typeof canonical.document_date === "string" ? canonical.document_date : "",
    invoiceNumber:
      typeof canonical.invoice_number === "string" ? canonical.invoice_number : "",
    referenceNumber:
      typeof canonical.reference_number === "string" ? canonical.reference_number : "",
    siteName:
      typeof canonical.site_name === "string" ? canonical.site_name : "",
    clientName:
      typeof canonical.client_name === "string" ? canonical.client_name : "",
    energyType:
      typeof canonical.energy_type === "string"
        ? canonical.energy_type
        : "electricity",
    rawValue:
      canonical.raw_value == null ? "" : String(canonical.raw_value),
    rawUnit:
      typeof canonical.raw_unit === "string" ? canonical.raw_unit : "",
    pciFactor:
      canonical.pci_factor == null ? "" : String(canonical.pci_factor),
    amountTtc:
      canonical.amount_ttc == null ? "" : String(canonical.amount_ttc),
    indexAncien:
      canonical.index_ancien == null ? "" : String(canonical.index_ancien),
    indexNouveau:
      canonical.index_nouveau == null ? "" : String(canonical.index_nouveau),
    subscribedPower:
      canonical.subscribed_power == null ? "" : String(canonical.subscribed_power),
  };
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadMode, setUploadMode] = useState<"photos" | "excel">("photos");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [summary, setSummary] = useState<DocumentsSummary>({
    total_normalized_kwh: 0,
    total_co2_kg: 0,
    by_supplier: [],
  });
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showBatchHints, setShowBatchHints] = useState(false);
  const [uploadResults, setUploadResults] = useState<DocumentBatchUploadResponse | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [photoHints, setPhotoHints] = useState({
    supplier: AUTO_OPTION,
    billingMonth: "",
    energyType: AUTO_OPTION,
    pciFactor: "",
  });
  const [excelForm, setExcelForm] = useState({
    docType: "STEG_ELECTRICITY_BILL",
    supplier: "STEG",
    billingMonth: getDefaultMonthInput(),
    energyType: "electricity",
    valueColumn: "value",
    unitColumn: "unit",
    pciFactor: "9.082",
  });
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(createReviewForm(null));

  async function refreshData() {
    const [documentsPayload, summaryPayload] = await Promise.all([
      fetchDocuments(),
      fetchDocumentsSummary(),
    ]);

    setDocuments(documentsPayload);
    setSummary(summaryPayload);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErrorMessage(null);
        const [documentsPayload, summaryPayload] = await Promise.all([
          fetchDocuments(),
          fetchDocumentsSummary(),
        ]);

        if (cancelled) {
          return;
        }

        setDocuments(documentsPayload);
        setSummary(summaryPayload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load documents."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setReviewForm(createReviewForm(selectedDoc));
    setPreviewError(false);
  }, [selectedDoc]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeTimeNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const sortedDocuments = sortDocumentsNewestFirst(documents);
  const acceptedDocuments = sortedDocuments.filter(
    (doc) => getReviewStatus(doc) === "accepted"
  );
  const reviewQueue = sortedDocuments.filter(
    (doc) => getReviewStatus(doc) !== "accepted"
  );
  const acceptedCount = acceptedDocuments.length;
  const reviewCount = reviewQueue.length;

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) {
      return;
    }

    if (uploadMode === "excel") {
      setSelectedFiles([files[0]]);
      setStatusMessage(`${files[0].name} ready for Excel import.`);
    } else {
      setSelectedFiles(files);
      setStatusMessage(`${files.length} file(s) ready for AI ingestion.`);
    }
    setErrorMessage(null);
  };

  const handleBrowseChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    if (uploadMode === "excel") {
      setSelectedFiles([files[0]]);
      setStatusMessage(`${files[0].name} ready for Excel import.`);
    } else {
      setSelectedFiles(files);
      setStatusMessage(`${files.length} file(s) ready for AI ingestion.`);
    }
    setErrorMessage(null);
  };

  const handlePhotoSubmit = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("Select at least one PDF or image before uploading.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      if (photoHints.supplier !== AUTO_OPTION) {
        formData.append("supplier", photoHints.supplier);
      }
      if (photoHints.billingMonth) {
        formData.append("billing_month", formatMonthForApi(photoHints.billingMonth));
      }
      if (photoHints.energyType !== AUTO_OPTION) {
        formData.append("energy_type", photoHints.energyType);
      }
      if (photoHints.pciFactor.trim()) {
        formData.append("pci_factor", photoHints.pciFactor.trim());
      }

      const result = await uploadDocumentsBatch(formData);
      setUploadResults(result);
      setStatusMessage(
        `Processed ${result.items.length} file(s): ${result.accepted} accepted, ${result.requires_review} requiring review, ${result.failed} failed.`
      );

      await refreshData();
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Batch upload failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcelSubmit = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("Select an Excel file before importing.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFiles[0]);
      formData.append("doc_type", excelForm.docType);
      formData.append("supplier", excelForm.supplier);
      formData.append("billing_month", formatMonthForApi(excelForm.billingMonth));
      formData.append("energy_type", excelForm.energyType);
      formData.append("value_column", excelForm.valueColumn.trim());
      formData.append("unit_column", excelForm.unitColumn.trim());
      formData.append("pci_factor", excelForm.pciFactor.trim());

      const result = await uploadExcelDocuments(formData);
      setStatusMessage(`Inserted ${result.inserted} accepted Excel document row(s).`);

      await refreshData();
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Excel import failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewSave = async () => {
    if (!selectedDoc) {
      return;
    }

    setIsReviewSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        doc_type: reviewForm.docType,
        supplier: reviewForm.supplier,
        billing_month: reviewForm.billingMonth
          ? formatMonthForApi(reviewForm.billingMonth)
          : null,
        document_date: reviewForm.documentDate.trim() || null,
        invoice_number: reviewForm.invoiceNumber.trim() || null,
        reference_number: reviewForm.referenceNumber.trim() || null,
        site_name: reviewForm.siteName.trim() || null,
        client_name: reviewForm.clientName.trim() || null,
        energy_type: reviewForm.energyType,
        raw_value: reviewForm.rawValue.trim() || null,
        raw_unit: reviewForm.rawUnit.trim() || null,
        pci_factor: reviewForm.pciFactor.trim() || null,
        amount_ttc: reviewForm.amountTtc.trim() || null,
        index_ancien: reviewForm.indexAncien.trim() || null,
        index_nouveau: reviewForm.indexNouveau.trim() || null,
        subscribed_power: reviewForm.subscribedPower.trim() || null,
      };

      const updatedDocument = await reviewDocument(selectedDoc.id, payload);
      setSelectedDoc(updatedDocument);
      setStatusMessage(
        selectedDoc.review_status === "accepted"
          ? `${updatedDocument.filename} was updated successfully.`
          : `${updatedDocument.filename} was accepted after review.`
      );
      await refreshData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Review save failed."
      );
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  const selectedCanonical = selectedDoc ? getCanonical(selectedDoc) : {};
  const selectedWarnings = selectedDoc ? getWarnings(selectedDoc) : [];
  const selectedConfidence = selectedDoc ? getOverallConfidence(selectedDoc) : null;
  const selectedDocSpecific = selectedDoc
    ? getRawObject(selectedDoc.raw_json?.doc_specific)
    : null;
  const selectedMeterRegisters = getMeterRegisters(selectedDocSpecific);
  const selectedSourceContentType = selectedDoc ? getSourceContentType(selectedDoc) : null;
  const selectedSourceUrl = selectedDoc ? getDocumentSourceUrl(selectedDoc.id) : null;
  const selectedUploadedLabel = selectedDoc ? getDocumentUploadedLabel(selectedDoc) : "—";
  const selectedUploadedRelativeLabel = selectedDoc
    ? getDocumentUploadedRelativeLabel(selectedDoc, relativeTimeNow)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.documents}</h1>
          <p className="text-sm text-muted-foreground">
            Backend API: {getDocumentsApiBaseUrl()}
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 self-start"
          onClick={() => {
            setIsLoading(true);
            setErrorMessage(null);
            void refreshData()
              .catch((error) => {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : "Failed to refresh documents."
                );
              })
              .finally(() => {
                setIsLoading(false);
              });
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Accepted Energy"
          value={summary.total_normalized_kwh}
          unit="kWh"
          status="good"
        />
        <KPICard
          label="Accepted CO2"
          value={summary.total_co2_kg}
          unit="kg"
          status="warning"
        />
        <KPICard label="Accepted Docs" value={acceptedCount} />
        <KPICard label="Needs Review" value={reviewCount} />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs
            value={uploadMode}
            onValueChange={(value) => {
              setUploadMode(value === "excel" ? "excel" : "photos");
              setSelectedFiles([]);
              setStatusMessage(null);
              setErrorMessage(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="photos">Photo / PDF</TabsTrigger>
              <TabsTrigger value="excel">Excel Batch</TabsTrigger>
            </TabsList>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "mt-6 flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                isDragOver
                  ? "border-energy-green bg-energy-green/5"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple={uploadMode === "photos"}
                accept={
                  uploadMode === "excel"
                    ? ".xlsx,.xls"
                    : ".pdf,.png,.jpg,.jpeg,.webp"
                }
                onChange={handleBrowseChange}
              />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                {uploadMode === "excel" ? (
                  <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {selectedFiles.length === 0
                  ? uploadMode === "excel"
                    ? "Upload Excel Batch"
                    : "Upload Documents"
                  : uploadMode === "excel"
                    ? selectedFiles[0]?.name
                    : `${selectedFiles.length} file(s) selected`}
              </h3>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                {uploadMode === "excel"
                  ? "Drop a single .xlsx or .xls file here, then map the value and unit columns below."
                  : "Drop one or many PDFs/images here. AI will classify, extract, normalize, and route only weak results into review."}
              </p>
              <Button variant="outline" className="mt-4" type="button">
                Browse Files
              </Button>
              {selectedFiles.length > 0 ? (
                <div className="mt-4 w-full max-w-2xl space-y-2">
                  {selectedFiles.slice(0, 6).map((file) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
                    >
                      {file.name}
                    </div>
                  ))}
                  {selectedFiles.length > 6 ? (
                    <p className="text-center text-xs text-muted-foreground">
                      +{selectedFiles.length - 6} more file(s)
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <TabsContent value="photos" className="mt-6 space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Batch Hints</p>
                    <p className="text-sm text-muted-foreground">
                      Optional fallback hints only. OCR remains the source of truth when it is confident.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setShowBatchHints((current) => !current)}
                  >
                    {showBatchHints ? "Hide Hints" : "Show Hints"}
                  </Button>
                </div>

                {showBatchHints ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Supplier</p>
                      <Select
                        value={photoHints.supplier}
                        onValueChange={(value) =>
                          setPhotoHints((current) => ({ ...current, supplier: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_OPTION}>Auto-detect</SelectItem>
                          {SUPPLIER_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Billing Month</p>
                      <Input
                        type="month"
                        value={photoHints.billingMonth}
                        onChange={(event) =>
                          setPhotoHints((current) => ({
                            ...current,
                            billingMonth: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Energy Type</p>
                      <Select
                        value={photoHints.energyType}
                        onValueChange={(value) =>
                          setPhotoHints((current) => ({ ...current, energyType: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_OPTION}>Auto-detect</SelectItem>
                          {ENERGY_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">PCI Factor</p>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="9.082"
                        value={photoHints.pciFactor}
                        onChange={(event) =>
                          setPhotoHints((current) => ({
                            ...current,
                            pciFactor: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => void handlePhotoSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload and Auto-detect
              </Button>
            </TabsContent>

            <TabsContent value="excel" className="mt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Document Type</p>
                  <Select
                    value={excelForm.docType}
                    onValueChange={(value) =>
                      setExcelForm((current) => ({ ...current, docType: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatDocType(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Supplier</p>
                  <Select
                    value={excelForm.supplier}
                    onValueChange={(value) =>
                      setExcelForm((current) => ({ ...current, supplier: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Billing Month</p>
                  <Input
                    type="month"
                    value={excelForm.billingMonth}
                    onChange={(event) =>
                      setExcelForm((current) => ({
                        ...current,
                        billingMonth: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Energy Type</p>
                  <Select
                    value={excelForm.energyType}
                    onValueChange={(value) =>
                      setExcelForm((current) => ({ ...current, energyType: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENERGY_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Value Column</p>
                  <Input
                    placeholder="value"
                    value={excelForm.valueColumn}
                    onChange={(event) =>
                      setExcelForm((current) => ({
                        ...current,
                        valueColumn: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Unit Column</p>
                  <Input
                    placeholder="unit"
                    value={excelForm.unitColumn}
                    onChange={(event) =>
                      setExcelForm((current) => ({
                        ...current,
                        unitColumn: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">PCI Factor</p>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="9.082"
                    value={excelForm.pciFactor}
                    onChange={(event) =>
                      setExcelForm((current) => ({
                        ...current,
                        pciFactor: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    className="w-full gap-2"
                    onClick={() => void handleExcelSubmit()}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" />
                    )}
                    Import Excel
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {uploadResults ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-energy-green" />
                <p className="text-sm font-medium text-foreground">Latest Upload Results</p>
              </div>
              <div className="space-y-2">
                {uploadResults.items.map((item, index) => (
                  <div
                    key={`${item.filename}-${item.id ?? "failed"}-${index}`}
                    className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.warnings.length > 0 ? item.warnings[0] : "Processed successfully."}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {item.overall_confidence == null
                          ? "—"
                          : `${formatNumber(item.overall_confidence, 0)}%`}
                      </span>
                      <Badge className={cn(getStatusBadgeClass(item.review_status))}>
                        {getStatusLabel(item.review_status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {statusMessage ? (
            <div className="rounded-lg border border-energy-green/30 bg-energy-green/10 px-4 py-3 text-sm text-foreground">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-alarm-red/30 bg-alarm-red/10 px-4 py-3 text-sm text-foreground">
              {errorMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Review Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">File</TableHead>
                <TableHead className="text-[15px]">Uploaded</TableHead>
                <TableHead className="text-[15px]">{t.type}</TableHead>
                <TableHead className="text-[15px]">Supplier</TableHead>
                <TableHead className="text-[15px]">{t.period}</TableHead>
                <TableHead className="text-right text-[15px]">Confidence</TableHead>
                <TableHead className="text-[15px]">{t.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Loading review queue...
                  </TableCell>
                </TableRow>
              ) : reviewQueue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No documents currently need review.
                  </TableCell>
                </TableRow>
              ) : (
                reviewQueue.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <TableCell className="text-[15px] font-medium">{doc.filename}</TableCell>
                    <TableCell className="text-[15px]">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {getDocumentUploadedRelativeLabel(doc, relativeTimeNow)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getDocumentUploadedLabel(doc)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[15px]">{formatDocType(doc.doc_type)}</TableCell>
                    <TableCell className="text-[15px]">{doc.supplier ?? "—"}</TableCell>
                    <TableCell className="text-[15px]">{doc.billing_month ?? "—"}</TableCell>
                    <TableCell className="text-right text-[15px]">
                      {getOverallConfidence(doc) == null
                        ? "—"
                        : `${formatNumber(getOverallConfidence(doc), 0)}%`}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(getStatusBadgeClass(doc.review_status))}>
                        {getStatusLabel(doc.review_status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Accepted Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">Uploaded</TableHead>
                <TableHead className="text-[15px]">Extracted Date</TableHead>
                <TableHead className="text-[15px]">{t.type}</TableHead>
                <TableHead className="text-[15px]">Supplier</TableHead>
                <TableHead className="text-[15px]">{t.period}</TableHead>
                <TableHead className="text-[15px]">{t.mainValue}</TableHead>
                <TableHead className="text-right text-[15px]">Normalized kWh</TableHead>
                <TableHead className="text-right text-[15px]">CO₂ (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Loading accepted documents...
                  </TableCell>
                </TableRow>
              ) : acceptedDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No accepted documents yet.
                  </TableCell>
                </TableRow>
              ) : (
                acceptedDocuments.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <TableCell className="text-[15px]">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {getDocumentUploadedRelativeLabel(doc, relativeTimeNow)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getDocumentUploadedLabel(doc)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[15px]">{getDisplayDate(doc)}</TableCell>
                    <TableCell className="text-[15px]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {formatDocType(doc.doc_type)}
                      </div>
                    </TableCell>
                    <TableCell className="text-[15px]">{doc.supplier ?? "—"}</TableCell>
                    <TableCell className="text-[15px]">{doc.billing_month ?? "—"}</TableCell>
                    <TableCell className="text-[15px]">{getDisplayMainValue(doc)}</TableCell>
                    <TableCell className="text-right text-[15px] font-medium">
                      {formatNumber(doc.normalized_kwh)}
                    </TableCell>
                    <TableCell className="text-right text-[15px]">
                      {formatNumber(doc.co2_emissions_kg)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Supplier Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">Supplier</TableHead>
                <TableHead className="text-right text-[15px]">kWh</TableHead>
                <TableHead className="text-right text-[15px]">CO₂ (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.by_supplier.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No accepted supplier aggregates yet.
                  </TableCell>
                </TableRow>
              ) : (
                summary.by_supplier.map((row) => (
                  <TableRow key={row.supplier}>
                    <TableCell className="text-[15px] font-medium">{row.supplier}</TableCell>
                    <TableCell className="text-right text-[15px]">
                      {formatNumber(row.total_kwh)}
                    </TableCell>
                    <TableCell className="text-right text-[15px]">
                      {formatNumber(row.total_co2_kg)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedDoc?.filename}
            </DialogTitle>
          </DialogHeader>

          {selectedDoc ? (
            <div className="grid h-[calc(92vh-72px)] gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
              <div className="border-b border-border bg-muted/20 p-4 lg:border-r lg:border-b-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge className={cn(getStatusBadgeClass(selectedDoc.review_status))}>
                      {getStatusLabel(selectedDoc.review_status)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Confidence:{" "}
                      {selectedConfidence == null ? "—" : `${formatNumber(selectedConfidence, 0)}%`}
                    </span>
                  </div>
                  {selectedSourceUrl ? (
                    <a
                      href={selectedSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-foreground underline underline-offset-4"
                    >
                      Open Original
                    </a>
                  ) : null}
                </div>

                <div className="flex h-full min-h-[340px] items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                  {selectedSourceUrl && isImageContentType(selectedSourceContentType) ? (
                    previewError ? (
                      <div className="px-6 text-center text-sm text-muted-foreground">
                        Original image preview is unavailable for this older record, but the stored fields can still be edited.
                      </div>
                    ) : (
                      <img
                        src={selectedSourceUrl}
                        alt={selectedDoc.filename}
                        className="max-h-[72vh] w-full object-contain"
                        onError={() => setPreviewError(true)}
                      />
                    )
                  ) : selectedSourceUrl && isPdfContentType(selectedSourceContentType) ? (
                    <iframe
                      title={selectedDoc.filename}
                      src={selectedSourceUrl}
                      className="h-[72vh] w-full bg-background"
                    />
                  ) : (
                    <div className="px-6 text-center text-sm text-muted-foreground">
                      No original preview is available for this document yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-y-auto p-6">
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Uploaded
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {selectedUploadedRelativeLabel}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedUploadedLabel}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Extracted Date
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {getDisplayDate(selectedDoc)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Document Type
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {formatDocType(selectedDoc.doc_type)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Supplier
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {selectedDoc.supplier ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Billing Month
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {selectedDoc.billing_month ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Main Quantity
                      </p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {getDisplayMainValue(selectedDoc)}
                      </p>
                    </div>
                  </div>

                  {selectedWarnings.length > 0 ? (
                    <div className="rounded-lg border border-warning-amber/30 bg-warning-amber/10 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        {selectedDoc.review_status === "failed" ? (
                          <XCircle className="h-4 w-4 text-alarm-red" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-warning-amber" />
                        )}
                        <p className="text-sm font-semibold text-foreground">Warnings</p>
                      </div>
                      <div className="space-y-2">
                        {selectedWarnings.map((warning) => (
                          <p key={warning} className="text-sm text-foreground">
                            {warning}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-energy-green" />
                      <p className="text-sm font-semibold text-foreground">Edit Fields</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Document Type</p>
                        <Select
                          value={reviewForm.docType}
                          onValueChange={(value) =>
                            setReviewForm((current) => ({ ...current, docType: value }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOC_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {formatDocType(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Supplier</p>
                        <Select
                          value={reviewForm.supplier}
                          onValueChange={(value) =>
                            setReviewForm((current) => ({ ...current, supplier: value }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPLIER_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Billing Month</p>
                        <Input
                          type="month"
                          value={reviewForm.billingMonth}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              billingMonth: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Document Date</p>
                        <Input
                          value={reviewForm.documentDate}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              documentDate: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Invoice Number</p>
                        <Input
                          value={reviewForm.invoiceNumber}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              invoiceNumber: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Reference Number</p>
                        <Input
                          value={reviewForm.referenceNumber}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              referenceNumber: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Site Name</p>
                        <Input
                          value={reviewForm.siteName}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              siteName: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Client Name</p>
                        <Input
                          value={reviewForm.clientName}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              clientName: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Energy Type</p>
                        <Select
                          value={reviewForm.energyType}
                          onValueChange={(value) =>
                            setReviewForm((current) => ({ ...current, energyType: value }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENERGY_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Raw Value</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.rawValue}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              rawValue: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Raw Unit</p>
                        <Input
                          value={reviewForm.rawUnit}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              rawUnit: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">PCI Factor</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.pciFactor}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              pciFactor: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Amount TTC</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.amountTtc}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              amountTtc: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Index Ancien</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.indexAncien}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              indexAncien: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Index Nouveau</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.indexNouveau}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              indexNouveau: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Subscribed Power</p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={reviewForm.subscribedPower}
                          onChange={(event) =>
                            setReviewForm((current) => ({
                              ...current,
                              subscribedPower: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <Button
                      className="w-full gap-2"
                      onClick={() => void handleReviewSave()}
                      disabled={isReviewSubmitting}
                    >
                      {isReviewSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {selectedDoc.review_status === "accepted"
                        ? "Save Document Changes"
                        : "Save Changes and Accept"}
                    </Button>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-foreground">
                      Extracted Useful Fields
                    </h4>
                    <div className="space-y-2 rounded-lg bg-muted/30 p-4">
                      {Object.entries(selectedCanonical).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-4">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                          <span className="text-right text-sm font-medium">
                            {value == null ? "—" : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedMeterRegisters.length > 0 ? (
                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-foreground">
                        Register Tables
                      </h4>
                      <div className="space-y-4">
                        {selectedMeterRegisters.map((register, index) => {
                          const visibleRows = getVisibleMeterRows(register);

                          return (
                            <div
                              key={`${register.registerLabel}-${register.registerId ?? "none"}-${index}`}
                              className="rounded-lg border border-border bg-muted/20 p-4"
                            >
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {register.registerId
                                      ? `CTR ${register.registerId}`
                                      : register.registerLabel}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {register.registerRole
                                      ? formatStructuredLabel(register.registerRole)
                                      : register.registerLabel}
                                  </p>
                                </div>
                                {register.side ? (
                                  <Badge variant="outline">
                                    {formatStructuredLabel(register.side)}
                                  </Badge>
                                ) : null}
                              </div>

                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Label</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead className="text-right">Ancien</TableHead>
                                    <TableHead className="text-right">Nouveau</TableHead>
                                    <TableHead className="text-right">Delta</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {visibleRows.map((row, rowIndex) => (
                                    <TableRow
                                      key={getMeterRowKey(register, row, rowIndex)}
                                    >
                                      <TableCell>{row.label ?? "—"}</TableCell>
                                      <TableCell>{row.code ?? "—"}</TableCell>
                                      <TableCell className="text-right">
                                        {row.ancien == null ? "—" : formatNumber(row.ancien, 0)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {row.nouveau == null ? "—" : formatNumber(row.nouveau, 0)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {row.delta == null ? "—" : formatNumber(row.delta, 0)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
