# Mock Data Audit and Implementation Checklist

## Repo snapshot

- This repo is a frontend-only Next.js dashboard prototype.
- All business data currently comes from a single file: `lib/mockData.ts`.
- There are no API routes, no upload backend, no parser layer, no persistence, and no real sample data files in the repo.
- The current screens are:
  - `dashboard`: KPI cards, 24h power chart, active alarms
  - `energie`: monthly summary + one STEG billing table
  - `documents`: upload dropzone UI + extracted fields drawer
  - `alertes`: alarm history table
  - `trigeneration`: 30-day production/temperature charts

## What exists today

Current mock data is concentrated in `lib/mockData.ts` and covers only:

- one flat `SensorReading` type
- one flat `Document` type
- one flat `Alarm` type
- one current KPI object
- one synthetic 24h sensor series with only `ENGINE_POWER` and `STEG_IMPORT`
- one small active/historical alarm list
- one 6-month monthly summary
- one STEG billing breakdown for November 2025
- three documents
- one 30-day daily trigeneration chart

## Main gaps against the cahier des charges

The challenge requires a unified system that can represent:

- heterogeneous documents: PDF invoices, scanned bills, Excel sheets
- original units and canonical normalization to kWh
- traceable CO2 calculations
- merged document data + IoT sensor data
- anomaly detection with type, timestamp, site/sensor, and confidence
- short-term forecasting
- a live-ish dashboard layer that reflects pipeline state
- optional Part 3 data for edge intelligence or waste heat recovery

The current prototype does not yet model these domains in a structured way.

## Immediate repo observations

- The prototype uses synthetic dates like `2026-04` for alarms and `2025-11` to `2026-04` for monthly summaries, while the challenge brief points to concrete source examples around:
  - `2024-11` SONEDE water bill
  - `2025-03` trigeneration time series
  - `2025-11` STEG sheet
  - `2025-04-14` to `2025-04-20` repeating alarm period
- The `documents` screen only displays `extracted_json`; it does not yet show normalization, confidence, source file info, or pipeline status.
- The `alertes` screen currently treats alarms and detected anomalies as the same thing, but the brief implies we should distinguish:
  - source SCADA or equipment alarms
  - model-detected anomalies
- The `trigeneration` screen only shows daily aggregates, but the brief explicitly references 10-minute channels and event correlation.

## Mock data that should be implemented

Below is the mock data inventory we need if we want the prototype to evolve cleanly into a working product.

### 1. Core master data

Implement:

- `sites`
- `zones`
- `suppliers`
- `equipment`
- `meters`
- `sensors`

Minimum fields:

- site: `id`, `name`, `company`, `country`, `timezone`
- zone: `id`, `siteId`, `name`
- supplier: `id`, `name`, `category`
- equipment: `id`, `siteId`, `zoneId`, `name`, `type`, `status`
- meter: `id`, `siteId`, `equipmentId`, `energyType`, `direction`, `unit`
- sensor: `id`, `meterId`, `equipmentId`, `tag`, `displayName`, `unit`, `samplePeriodSec`

Seed examples from brief:

- site `ADWYA`
- zones `Alpha`, `Beta`, `Gamma`
- equipment `CAT Engine`, `Absorption Chiller`, `Chiller Alpha-1`, `Chiller Beta-2`
- suppliers `STEG`, `SONEDE`

### 2. Source document registry

Implement:

- `documents`
- `documentFiles`
- `documentPages` or `documentSheets`

Minimum fields:

- `id`, `fileName`, `docType`, `supplierId`, `siteId`
- `format`: `pdf`, `scan`, `xlsx`
- `uploadDate`, `documentDate`, `periodStart`, `periodEnd`
- `processingStatus`
- `sourceLanguage`
- `sheetNames` for Excel
- `previewUrl` or placeholder image path

Mock source documents to seed first:

- `sonede_bill_2024_11`
- `steg_sheet_2025_11`
- `cat_scada_snapshot`
- `sxada_alarm_log_2025_04`
- `rapport_audit_adwya`
- `mars_report2_2025_03`

### 3. Extraction result data

Implement:

- `documentExtractions`
- `extractedFields`
- `extractionRuns`

Minimum fields:

- `documentId`
- `fieldName`
- `rawValue`
- `parsedValue`
- `rawUnit`
- `confidence`
- `sourceLocation` such as page/sheet/cell
- `validationStatus`
- `extractorVersion`

Fields that must be representable because of the brief:

- date
- period
- supplier
- site
- energy quantity
- unit
- amount
- tariff period
- meter index
- power factor where available
- alarm code/count where applicable

### 4. Unit normalization data

Implement:

- `unitConversions`
- `normalizedEnergyFacts`

Minimum fields:

- `sourceRecordId`
- `originalValue`
- `originalUnit`
- `canonicalValueKWh`
- `conversionFactor`
- `conversionFormula`
- `normalizedAt`
- `reviewStatus`

Units explicitly mentioned in the brief to support:

- `kWh`
- `MWh`
- `Gcal`
- `BTU`
- `toe`
- `GJ`
- `Nm3` gas input using the audit ratio when needed

Important note:

- The current repo stores already-normalized numbers directly in chart tables.
- We need mock data that preserves both original units and normalized output so the pipeline is explainable.

### 5. Unified energy ledger

Implement:

- `energyFacts`
- `energyRollups`

Minimum fields:

- `id`
- `timestamp` or `periodStart`/`periodEnd`
- `siteId`
- `zoneId`
- `sourceType`: `document`, `iot`, `manual_reference`
- `energyType`: `electricity_import`, `electricity_export`, `natural_gas`, `water`, `cooling`
- `supplierId`
- `equipmentId` if applicable
- `originalValue`
- `originalUnit`
- `normalizedKWh`
- `costAmount`
- `currency`
- `documentId` or `sensorId`

This is the main mock dataset that should drive:

- dashboard KPIs
- monthly energy charts
- billing screens
- CO2 calculations
- forecasting inputs

### 6. IoT time-series data

Implement:

- `sensorReadings`
- `sensorStreams`
- `ingestionBatches`

Minimum fields:

- `timestamp`
- `sensorId`
- `siteId`
- `equipmentId`
- `value`
- `unit`
- `qualityFlag`
- `ingestionSource`

First channels to mock from the brief:

- gas flow around `270 Nm3/h`
- engine active power around `1200 kW`
- cumulative energy around `19146760 kWh`
- power factor around `1.00`
- TT01 chilled water inlet around `6 degC`
- TT02 chilled water outlet around `8.5 degC`
- TT03 hot water primary around `100 degC`
- TT04 hot water secondary around `70 degC`
- engine RPM
- STEG import/export power

Time granularity to support first:

- 10-minute readings for March 2025
- last 24h derived view for the dashboard
- daily rollups for trend charts

### 7. Sensor fault and anomaly data

Implement:

- `detectedAnomalies`
- `anomalyWindows`
- `anomalyScores`

Minimum fields:

- `id`
- `timestampStart`
- `timestampEnd`
- `siteId`
- `equipmentId`
- `sensorId`
- `anomalyType`
- `severity`
- `confidence`
- `observedValue`
- `expectedValue`
- `message`
- `source`: `rule`, `model`, `scada`

Anomaly types required by the brief:

- spike
- dropout
- drift
- stuck sensor
- shutdown event
- abnormal consumption pattern

Seed anomalies to include immediately:

- TT01 spikes to `17-18 degC`
- engine shutdown window around `2025-03-27` with gas/power/RPM dropping to zero for about 10 readings
- repeating `OVERFLOW_TEMP_HIGH` pattern matching the alarm log

### 8. Alarm and event timeline

Implement:

- `alarmEvents`
- `alarmSummaries`

Minimum fields:

- `id`
- `timestamp`
- `equipmentId`
- `zoneId`
- `alarmCode`
- `description`
- `severity`
- `status`
- `pending`
- `acknowledgedAt`
- `countWithinWindow`
- `linkedSensorIds`

Seed real-ish event patterns from the brief:

- `OVERFLOW_TEMP_HIGH`
- `ABSO_PUMP_NOT_RESPOND`
- `HW_DP_SWITCH_TRIP`
- `ENGINE_IN_PARALLEL_MODE`
- `COLLECTIVE_FAULT`

Important distinction:

- alarms are not the same as detected anomalies
- we should mock both and allow correlation between them

### 9. CO2 and emissions data

Implement:

- `emissionFactors`
- `emissionCalculations`
- `co2Kpis`

Minimum fields:

- `energyType`
- `region`
- `factorValue`
- `factorUnit`
- `effectiveFrom`
- `sourceLabel`
- `inputEnergyKWh`
- `co2Kg`
- `calculationMethod`
- `baselineCo2Kg`
- `avoidedCo2Kg`

This data should back:

- monthly CO2 totals
- source-by-source CO2 breakdown
- avoided CO2 KPI
- traceability from normalized energy to final CO2 number

### 10. Forecasting data

Implement:

- `forecastRuns`
- `forecastSeries`
- `forecastMetrics`

Minimum fields:

- `targetMetric`
- `horizon`
- `generatedAt`
- `timestamp`
- `actual`
- `predicted`
- `lowerBound`
- `upperBound`
- `modelName`
- `mae`
- `mape`

First forecast targets:

- short-term engine power
- short-term gas consumption
- short-term site electricity demand
- optional next-day chilled-water temperature risk

### 11. Pipeline and system-health data

Implement:

- `pipelineJobs`
- `deviceStatus`
- `ingestionHealth`

Minimum fields:

- `jobId`
- `jobType`
- `status`
- `startedAt`
- `finishedAt`
- `inputCount`
- `successCount`
- `failureCount`
- `errorMessage`
- `lastSeenAt`
- `connectionState`
- `bufferDepth`

This is needed if the dashboard should feel operational instead of static.

### 12. Part 3 Track A mock data

Implement if you want to demonstrate edge inference:

- `edgeModelArtifacts`
- `edgeInferenceRuns`
- `offlineDetectionEvents`
- `syncBacklogEvents`

Minimum fields:

- `modelName`
- `modelSizeKb`
- `targetDevice`
- `latencyMs`
- `metricName`
- `metricValue`
- `offlineStartedAt`
- `offlineEndedAt`
- `eventsQueued`

### 13. Part 3 Track B mock data

Implement if you want to demonstrate waste heat recovery:

- `wasteHeatSources`
- `recoveryScenarios`
- `roiComparisons`

Minimum fields:

- source `temperatureC`
- `thermalFluxKw`
- `availabilityProfile`
- `location`
- `recoverableEnergyKWh`
- `co2ReductionKg`
- `capex`
- `opex`
- `roiMonths`
- `integrationComplexity`
- `priorityScore`

Use the audit clues first:

- tri-generation engine heat
- hot water loop
- chiller-related thermal streams

## Screen-by-screen mock data needed

### Dashboard

Needs more than `currentKPIs`, `powerChartData`, and `activeAlarms`.

Add:

- live KPI summary from the unified energy ledger
- latest device connectivity status
- pipeline health summary
- recent document processing status
- anomaly counts by severity
- forecast next 24h mini-summary

### Energy page

Current page is missing traceability and CO2 modeling.

Add:

- monthly energy facts by source and unit
- normalized kWh values with traceable origin
- cost totals by supplier
- CO2 totals and avoided CO2
- import vs export electricity
- gas-to-kWh conversion display
- tariff-based billing lines from the STEG sheet

### Documents page

Current page only shows a generic extracted JSON object.

Add:

- raw document metadata
- extraction confidence per field
- normalization output per extracted energy quantity
- parse warnings and missing fields
- page/sheet provenance
- processing job history
- ground-truth comparison status if available

### Alerts page

Current page is a basic alarm table.

Add:

- separate tabs or filters for alarms vs anomalies
- anomaly type
- confidence score
- linked sensor
- linked document or site when anomaly is not sensor-based
- recurrence count
- correlation to actual SCADA alarms

### Trigeneration page

Current page is too aggregated for the brief.

Add:

- 10-minute multi-channel time series
- shutdown event window
- TT01 spike annotations
- gas/power/RPM alignment
- hot water and chilled water channels
- absorption chiller utilization trend

## Priority order

### P0 - Make the current prototype truthful

- align dates and sample names with the challenge examples
- replace random chart generation with seeded deterministic datasets
- split master data, documents, alarms, anomalies, and time-series into separate mock modules
- add normalized energy facts and emission factors

### P1 - Support Part 2 scoring logic

- document extraction result mocks with confidence and provenance
- unit conversion traceability
- unified energy ledger
- CO2 calculation outputs
- forecast outputs
- anomaly outputs with confidence

### P2 - Support Part 3 storytelling

- edge model metrics and offline inference events
- waste heat recovery candidates and ROI scenarios

## Recommended first implementation pass

If we want the fastest path from prototype to believable product, implement these mock datasets first:

1. `masterData`
2. `documents` + `documentExtractions`
3. `unitConversions` + `normalizedEnergyFacts`
4. `sensorReadings10mMarch2025`
5. `alarmEvents` + `detectedAnomalies`
6. `emissionFactors` + `emissionCalculations`
7. `forecastSeries`

That gives us enough to make every current screen meaningful without building the full backend yet.
