# NRTF Platform

## Part 3 Track B — Waste Heat Recovery Decision Engine

This module identifies, characterizes, ranks, and simulates waste heat recovery opportunities for the pharmaceutical factory.

### Features

- 8 audit-based waste heat recovery opportunities
- Temperature level, thermal flux, availability, location, and use-case characterization
- ROI, payback, NPV, annual savings, and CO2 reduction calculations
- Weighted priority score
- Interactive dashboard simulator
- Exportable JSON and Markdown reports

Note: Opportunity inputs are audit-based engineering estimates and require on-site
instrumentation before investment-grade decisions.

### API Endpoints

```text
GET /api/recovery/summary
GET /api/recovery/opportunities
GET /api/recovery/opportunities/{source_id}
POST /api/recovery/simulate
GET /api/recovery/export
```
