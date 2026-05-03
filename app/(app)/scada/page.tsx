"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  fetchScadaRecords,
  fetchScadaSummary,
  uploadScadaExcel,
  type ScadaRecord,
  type ScadaSummary,
} from "@/lib/api-client";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ScadaPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState<ScadaSummary | null>(null);
  const [records, setRecords] = useState<ScadaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filterText, setFilterText] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [formState, setFormState] = useState({
    intervalMinutes: "10",
    pciFactor: "",
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [summaryPayload, recordsPayload] = await Promise.all([
        fetchScadaSummary(),
        fetchScadaRecords({
          skip: page * pageSize,
          limit: pageSize,
        }),
      ]);
      setSummary(summaryPayload);
      setRecords(recordsPayload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load SCADA data.");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalRecords = summary?.record_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    const maxPage = Math.max(totalPages - 1, 0);
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, totalPages]);

  const filteredRecords = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) {
      return records;
    }

    return records.filter((record) => {
      const timestamp = formatTimestamp(record.timestamp).toLowerCase();
      const metrics = Object.keys(record.raw_metrics ?? {}).join(" ").toLowerCase();
      return timestamp.includes(needle) || metrics.includes(needle);
    });
  }, [records, filterText]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("Select a Tri-generation SCADA file before importing.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const intervalMinutes = formState.intervalMinutes.trim();
      if (intervalMinutes) {
        formData.append("interval_minutes", intervalMinutes);
      }

      const pciFactor = formState.pciFactor.trim();
      if (pciFactor) {
        formData.append("pci_factor", pciFactor);
      }

      const result = await uploadScadaExcel(formData);
      setStatusMessage(
        `Imported ${result.inserted} Tri-generation rows (skipped ${result.skipped}).`
      );

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tri-generation import failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Tri-generation</h1>
              <Badge className="border border-primary/30 bg-primary/15 text-primary">
                SCADA
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              SCADA BILAN TOTAL import and latest readings
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 border-primary/30 bg-background/80"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-primary/25 bg-primary/10">
          <div className="h-1 w-full bg-primary/70" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Total kWh
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-foreground">
            {formatNumber(summary?.total_normalized_kwh, 0)}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-primary/20 bg-muted/30">
          <div className="h-1 w-full bg-primary/50" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Avg Power (kW)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-foreground">
            {formatNumber(summary?.avg_power_kw, 1)}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-primary/20 bg-muted/30">
          <div className="h-1 w-full bg-primary/50" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Total CO2 (kg)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-foreground">
            {formatNumber(summary?.total_co2_kg, 0)}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-primary/20 bg-muted/30">
          <div className="h-1 w-full bg-primary/50" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Records
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-foreground">
            {formatNumber(summary?.record_count ?? 0, 0)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-card">
        <CardHeader className="border-b border-primary/15 bg-primary/10 pb-2">
          <CardTitle className="text-lg font-semibold">Import Tri-generation SCADA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Interval Minutes</p>
              <Input
                type="number"
                min={1}
                value={formState.intervalMinutes}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    intervalMinutes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">PCI Factor (optional)</p>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="9.082"
                value={formState.pciFactor}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    pciFactor: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Excel File</p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void handleUpload()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Import Tri-generation
            </Button>
            {selectedFile ? (
              <Badge className="border border-primary/25 bg-primary/10 text-primary">
                {selectedFile.name}
              </Badge>
            ) : null}
            {statusMessage ? (
              <span className="text-sm text-muted-foreground">{statusMessage}</span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            BILAN TOTAL uses rows as field labels; column mapping is not required.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-card">
        <CardHeader className="border-b border-primary/15 bg-primary/10 pb-2">
          <CardTitle className="text-lg font-semibold">Latest Tri-generation Readings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
            <div className="min-w-[240px] flex-1 space-y-2">
              <p className="text-sm font-medium text-foreground">Filter</p>
              <Input
                placeholder="Search current page"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
              />
            </div>
            <div className="w-[160px] space-y-2">
              <p className="text-sm font-medium text-foreground">Rows per page</p>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  const nextSize = Number(value);
                  if (Number.isFinite(nextSize)) {
                    setPage(0);
                    setPageSize(nextSize);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {filteredRecords.length} of {records.length} rows
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/25"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page <= 0 || isLoading}
                >
                  Previous
                </Button>
                <Badge className="border border-primary/25 bg-primary/10 text-primary">
                  Page {page + 1} / {totalPages}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/25"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1 || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="pt-4 text-sm text-muted-foreground">Loading...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="pt-4 text-sm text-muted-foreground">No SCADA readings match this filter.</div>
          ) : (
            <Table className="mt-4">
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="py-3 text-primary">Timestamp</TableHead>
                  <TableHead className="py-3 text-right text-primary">Power (kW)</TableHead>
                  <TableHead className="py-3 text-right text-primary">Gas Flow (Nm3/h)</TableHead>
                  <TableHead className="py-3 text-right text-primary">Normalized kWh</TableHead>
                  <TableHead className="py-3 text-right text-primary">Metrics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record, index) => (
                  <TableRow
                    key={record.id}
                    className={
                      index % 2 === 0
                        ? "h-12 bg-muted/20 hover:bg-primary/5"
                        : "h-12 hover:bg-primary/5"
                    }
                  >
                    <TableCell className="py-3">
                      {formatTimestamp(record.timestamp)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      {formatNumber(record.power_gross_kw, 2)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      {formatNumber(record.gas_flow_nm3h, 2)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      {formatNumber(record.normalized_kwh, 2)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      {Object.keys(record.raw_metrics ?? {}).length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
