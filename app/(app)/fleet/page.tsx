"use client";

import { useState } from "react";
import {
  Activity,
  Bolt,
  Cpu,
  DownloadCloud,
  Gauge,
  History,
  MapPin,
  Play,
  Radio,
  RefreshCcw,
  RotateCw,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  TerminalSquare,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/kpi-card";
import { cn } from "@/lib/utils";

const fleetDevices = [
  {
    id: "esp32s3_alpha_edge_node_01",
    name: "ESP32 Alpha",
    zone: "Zone Alpha",
    role: "Motor Energy Node",
    status: "Online",
    health: 94,
    firmware: "0.5.0",
    rssi: "-52",
    buffer: "0",
    lastPacket: "3s",
    compliance: "Up to date",
    color: "green",
    ip: "10.42.12.21",
    mac: "30:C6:F7:A1:04:11",
    mqttTopic: "adwya/alpha/motor-energy",
  },
  {
    id: "esp32s3_beta_hvac_node_02",
    name: "ESP32 Beta",
    zone: "Zone Beta",
    role: "HVAC Node",
    status: "Offline",
    health: 0,
    firmware: "0.4.1",
    rssi: "--",
    buffer: "--",
    lastPacket: "8min",
    compliance: "Update available",
    color: "red",
    ip: "--",
    mac: "30:C6:F7:B2:10:04",
    mqttTopic: "adwya/beta/hvac",
  },
  {
    id: "esp32s3_gamma_vibration_node_03",
    name: "ESP32 Gamma",
    zone: "Zone Gamma",
    role: "Compressor Vibration Node",
    status: "Buffering",
    health: 76,
    firmware: "0.5.0",
    rssi: "-70",
    buffer: "42",
    lastPacket: "5s",
    compliance: "Up to date",
    color: "orange",
    ip: "10.42.12.45",
    mac: "30:C6:F7:C9:22:19",
    mqttTopic: "adwya/gamma/compressor-vibration",
  },
] as const;

const fleetKpis = [
  { label: "Total ESP32 Nodes", value: "3", unit: "", status: "normal" },
  { label: "Online", value: "2", unit: "", status: "good" },
  { label: "Buffering", value: "1", unit: "", status: "warning" },
  { label: "Firmware Updates", value: "1", unit: "", status: "warning" },
  { label: "Active Faults", value: "1", unit: "", status: "critical" },
  { label: "Fleet Health", value: "87", unit: "%", status: "good" },
] as const;

const eventTimeline = [
  "10:00 Boot",
  "10:01 Wi-Fi connected",
  "10:01 MQTT connected",
  "10:05 Vibration fault detected",
  "10:08 Buffering started",
  "10:10 Replay started",
  "10:11 Sync complete, lost_packets=0",
  "10:15 OTA success",
  "10:17 Telemetry resumed",
];

const commandGroups = [
  {
    title: "Remote Commands",
    icon: TerminalSquare,
    commands: [
      { label: "Identify Device", icon: Radio },
      { label: "Reboot", icon: RotateCw },
      { label: "LED Test", icon: Bolt },
    ],
  },
  {
    title: "OTA Manager",
    icon: DownloadCloud,
    commands: [{ label: "Run OTA", icon: DownloadCloud }],
  },
  {
    title: "Buffer / Replay Control",
    icon: History,
    commands: [
      { label: "Buffer Status", icon: Gauge },
      { label: "Force Sync", icon: RefreshCcw },
    ],
  },
  {
    title: "Calibration & Self-Test",
    icon: SlidersHorizontal,
    commands: [
      { label: "Run Self-Test", icon: Play },
      { label: "ACS712 Zero Calibrate", icon: Wrench },
      { label: "Inject Vibration Fault", icon: Activity },
      { label: "Clear Fault", icon: ShieldCheck },
    ],
  },
] as const;

type FleetDevice = (typeof fleetDevices)[number];

function statusBadgeClass(status: FleetDevice["status"]) {
  if (status === "Online") {
    return "border-emerald-500/30 bg-emerald-50 text-emerald-700";
  }
  if (status === "Buffering") {
    return "border-amber-500/35 bg-amber-50 text-amber-800";
  }
  return "border-red-500/30 bg-red-50 text-red-700";
}

function complianceBadgeClass(compliance: FleetDevice["compliance"]) {
  if (compliance === "Up to date") {
    return "border-emerald-500/30 bg-emerald-50 text-emerald-700";
  }
  if (compliance === "Update available") {
    return "border-amber-500/35 bg-amber-50 text-amber-800";
  }
  return "border-red-500/30 bg-red-50 text-red-700";
}

function nodeColorClass(color: FleetDevice["color"]) {
  if (color === "green") return "border-emerald-500 bg-emerald-500 shadow-emerald-500/40";
  if (color === "orange") return "border-amber-500 bg-amber-500 shadow-amber-500/40";
  return "border-red-500 bg-red-500 shadow-red-500/40";
}

export default function FleetControlCenterPage() {
  const [selectedDevice, setSelectedDevice] = useState<FleetDevice>(fleetDevices[0]);
  const [commandMessage, setCommandMessage] = useState("Advanced Operations Center ready.");

  const queueMockCommand = (commandName: string) => {
    setCommandMessage(`Mock command queued for demo. ${commandName} -> ${selectedDevice.name}`);
  };

  const openOperations = (device: FleetDevice) => {
    setSelectedDevice(device);
    setCommandMessage(`Advanced Operations Center armed for ${device.name}.`);
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-primary/30 bg-[linear-gradient(135deg,#ffffff_0%,#f7f7f4_48%,rgba(201,168,76,0.20)_100%)] p-8 shadow-[0_24px_55px_rgba(26,26,26,0.08)]">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <Badge className="gap-2 border border-primary/30 bg-primary/15 text-primary">
              <Cpu className="h-3.5 w-3.5" />
              ESP32 edge fleet
            </Badge>
            <h1 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">
              Fleet Control Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Fleet Control Center transforms OTA from a firmware upload tool into an industrial operations layer.
              Operators can monitor, identify, reboot, update, calibrate, and verify ESP32 edge nodes from one dashboard.
            </p>
          </div>
          <div className="flex min-w-[240px] flex-col gap-3 rounded-2xl border border-primary/25 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Demo Mode
              </span>
              <Badge variant="outline" className="border-primary/35 text-primary">
                Mock only
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Wifi className="h-5 w-5 text-primary" />
              No MQTT command publishing
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              No backend models or migrations
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {fleetKpis.map((kpi) => (
          <KPICard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            status={kpi.status}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg font-semibold">ESP32 Fleet Registry</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-2 border border-emerald-500/25 bg-emerald-50 text-emerald-700">
                  <Signal className="h-3.5 w-3.5" />
                  2 live links
                </Badge>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700">
                  Up to date
                </Badge>
                <Badge variant="outline" className="border-amber-500/35 bg-amber-50 text-amber-800">
                  Update available
                </Badge>
                <Badge variant="outline" className="border-red-500/30 bg-red-50 text-red-700">
                  Offline
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead>Device</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Firmware</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>RSSI</TableHead>
                  <TableHead>Buffer</TableHead>
                  <TableHead>Last Packet</TableHead>
                  <TableHead className="text-right">Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fleetDevices.map((device) => (
                  <TableRow
                    key={device.id}
                    className={cn(
                      "h-14 cursor-pointer hover:bg-primary/5",
                      selectedDevice.id === device.id ? "bg-primary/10" : "",
                    )}
                    onClick={() => openOperations(device)}
                  >
                    <TableCell className="font-semibold">{device.name}</TableCell>
                    <TableCell>{device.zone}</TableCell>
                    <TableCell>{device.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(device.status)}>
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[88px] items-center gap-2">
                        <Progress value={device.health} className="h-1.5" />
                        <span className="text-xs font-semibold">{device.health}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{device.firmware}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={complianceBadgeClass(device.compliance)}>
                        {device.compliance}
                      </Badge>
                    </TableCell>
                    <TableCell>{device.rssi}</TableCell>
                    <TableCell>{device.buffer}</TableCell>
                    <TableCell>{device.lastPacket}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="after:content-none"
                        onClick={(event) => {
                          event.stopPropagation();
                          openOperations(device);
                        }}
                      >
                        <TerminalSquare className="h-4 w-4" />
                        Advanced Operations
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-primary" />
              Plant Zone Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(90deg,rgba(26,26,26,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(26,26,26,0.04)_1px,transparent_1px)] bg-[size:38px_38px] p-4">
              <div className="absolute left-5 top-5 rounded-full border border-primary/20 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Adwya Plant Edge Layer
              </div>
              <div className="grid h-full min-h-[320px] grid-cols-1 gap-3 pt-10">
                {fleetDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white/88 p-4 shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "h-4 w-4 shrink-0 rounded-full border-2 shadow-[0_0_20px]",
                          nodeColorClass(device.color),
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{device.zone}</p>
                        <p className="truncate text-xs text-muted-foreground">{device.name}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 after:content-none"
                      onClick={() => openOperations(device)}
                    >
                      <TerminalSquare className="h-4 w-4" />
                      Advanced Operations
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-primary/25 bg-card shadow-[0_24px_55px_rgba(26,26,26,0.08)]">
        <CardHeader className="border-b border-primary/15 bg-primary/10 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="gap-2 border border-primary/30 bg-white/70 text-primary">
                <TerminalSquare className="h-3.5 w-3.5" />
                Advanced Operations Center
              </Badge>
              <CardTitle className="mt-3 text-2xl font-semibold">
                {selectedDevice.name}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedDevice.zone} · {selectedDevice.role} · {selectedDevice.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={statusBadgeClass(selectedDevice.status)}>
                {selectedDevice.status}
              </Badge>
              <Badge variant="outline" className={complianceBadgeClass(selectedDevice.compliance)}>
                {selectedDevice.compliance}
              </Badge>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-primary/25 bg-white/75 px-4 py-3 text-sm font-medium text-foreground">
            {commandMessage}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                  Device Identity
                </h2>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Node ID</span>
                  <span className="text-right font-medium">{selectedDevice.id}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">MAC</span>
                  <span className="font-medium">{selectedDevice.mac}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">IP</span>
                  <span className="font-medium">{selectedDevice.ip}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">MQTT Topic</span>
                  <span className="text-right font-medium">{selectedDevice.mqttTopic}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <DownloadCloud className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                  OTA Manager
                </h2>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Current firmware</span>
                  <span className="font-semibold">{selectedDevice.firmware}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Target firmware</span>
                  <span className="font-semibold">0.5.0</span>
                </div>
                <Progress value={selectedDevice.status === "Offline" ? 0 : 100} className="h-2" />
                <Button
                  className="w-full after:content-none"
                  onClick={() => queueMockCommand("Run OTA")}
                >
                  <DownloadCloud className="h-4 w-4" />
                  Run OTA
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                  Security / Compliance
                </h2>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Firmware compliance</span>
                  <Badge variant="outline" className={complianceBadgeClass(selectedDevice.compliance)}>
                    {selectedDevice.compliance}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">TLS profile</span>
                  <Badge variant="outline" className="border-primary/30 text-foreground">
                    Plant CA
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Command mode</span>
                  <Badge variant="outline" className="border-primary/30 text-foreground">
                    Demo locked
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Audit trail</span>
                  <Badge className="bg-primary/15 text-primary">
                    Enabled
                  </Badge>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                    Mock Actions
                  </h2>
                </div>
                <Badge variant="outline" className="border-primary/30 text-muted-foreground">
                  Buttons show demo queue feedback only
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {commandGroups.map((group) => (
                  <div key={group.title} className="rounded-xl border border-primary/15 bg-muted/25 p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <group.icon className="h-4 w-4 text-primary" />
                      {group.title}
                    </div>
                    <div className="grid gap-2">
                      {group.commands.map((command) => (
                        <Button
                          key={command.label}
                          variant="outline"
                          size="sm"
                          className="justify-start after:content-none"
                          onClick={() => queueMockCommand(command.label)}
                        >
                          <command.icon className="h-4 w-4" />
                          {command.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                  Event Timeline
                </h2>
              </div>
              <div className="mt-5 space-y-3">
                {eventTimeline.map((event, index) => (
                  <div key={event} className="grid grid-cols-[24px_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "h-3 w-3 rounded-full border-2",
                          index === 3
                            ? "border-red-500 bg-red-500"
                            : index >= 4 && index <= 5
                              ? "border-amber-500 bg-amber-500"
                              : "border-emerald-500 bg-emerald-500",
                        )}
                      />
                      {index < eventTimeline.length - 1 ? (
                        <span className="mt-1 h-7 w-px bg-border" />
                      ) : null}
                    </div>
                    <p className="text-sm text-foreground">{event}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.1em]">
                  Buffer / Replay Control
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current replay queue: {selectedDevice.buffer} packets · Last packet: {selectedDevice.lastPacket}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="after:content-none"
                  onClick={() => queueMockCommand("Buffer Status")}
                >
                  <Gauge className="h-4 w-4" />
                  Buffer Status
                </Button>
                <Button
                  size="sm"
                  className="after:content-none"
                  onClick={() => queueMockCommand("Force Sync")}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Force Sync
                </Button>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
