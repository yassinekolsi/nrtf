# Waste Heat Recovery Report

> Generated: 2026-05-03T01:02:25.417240+00:00
> Site: Adwya pharmaceutical factory (Kilani Group)

> **DISCLAIMER**: Some values are audit-derived engineering estimates, not certified investment-grade measurements. All figures must be validated by on-site instrumentation before final investment decisions.

---

## 1. Objective

Identify, quantify, rank, and simulate waste heat recovery opportunities at the Adwya pharmaceutical production site. The goal is to transform audit observations into a ranked, actionable investment roadmap.

---

## 2. Data Sources

| Source | Description |
|--------|-------------|
| `configs/recovery_opportunities.json` | Primary audit-based assumptions |
| `utils/energy.py` | CO₂ emission factors and conversion constants |
| Site audit context | Process descriptions, equipment ratings, and shift schedules |

---

## 3. Global Assumptions

| Parameter | Value |
|-----------|-------|
| Natural gas CO₂ factor | 0.202 kgCO₂/kWh |
| Grid electricity CO₂ factor | 0.50 kgCO₂/kWh |
| Default boiler efficiency | 90% |
| Natural gas price | 0.028 DT/kWh |
| Discount rate | 5% |
| Project lifetime | 10 years |

---

## 4. Scoring Method

Opportunities are ranked using a weighted priority score (0–100):

| Criterion | Weight | Sub-score basis |
|-----------|--------|-----------------|
| Recoverable energy | 30% | Normalised vs max in set |
| CO₂ reduction | 25% | Normalised vs max in set |
| Return on investment | 20% | Derived from simple payback |
| Feasibility | 15% | Inverse of integration complexity |
| Measurement confidence | 10% | Direct input score × 10 |

---

## 5. Ranked Opportunities

| Rank | Name | System | Cap. Power kW | Energy MWh/yr | CO₂ t/yr | Savings DT/yr | CAPEX DT | Payback yr | Score |
|------|------|--------|--------------|--------------|----------|--------------|---------|-----------|-------|
| 1 | Chiller Condenser Heat Recovery | chilled_water | 123.0 | 897.9 | 201.5 | 24,141 | 100,000 | 4.1 | 78.8 |
| 2 | Trigeneration Heat Allocation Optimization | trigeneration | 50.8 | 407.9 | 91.6 | 11,122 | 30,000 | 2.7 | 56.6 |
| 3 | Steam Boiler Economizer | steam_boilers | 54.1 | 355.4 | 79.8 | 9,452 | 45,000 | 4.8 | 49.4 |
| 4 | Hot Surface Insulation | steam_hot_water_distribution | 35.0 | 229.9 | 51.6 | 6,439 | 12,000 | 1.9 | 49.1 |
| 5 | Compressor Heat Recovery | compressed_air | 24.7 | 180.4 | 40.5 | 5,051 | 15,000 | 3.0 | 47.5 |
| 6 | Automatic Blowdown / TDS Heat Recovery | steam_boilers | 25.8 | 169.2 | 38.0 | 4,539 | 25,000 | 5.5 | 36.2 |
| 7 | Beta Zone Heat Recovery Extension | hot_water_beta | 50.0 | 219.0 | 49.1 | 5,632 | 60,000 | 10.7 | 23.9 |
| 8 | Condensate Recovery Improvement | steam_network | 13.8 | 90.7 | 20.4 | 2,339 | 20,000 | 8.6 | 22.1 |

---

## 6. Top 3 Recommended Scenarios

### 1. Chiller Condenser Heat Recovery

- **System**: chilled_water
- **Location**: chiller_plant
- **Captured power**: 123.0 kW
- **Recoverable energy**: 897.9 MWh/year
- **CO₂ reduction**: 201.5 tCO₂/year
- **Annual savings**: 24,141 DT/year
- **CAPEX**: 100,000 DT
- **Simple payback**: 4.1 years
- **NPV (10y)**: 86,412 DT
- **Priority score**: 78.8/100
- **Complexity**: high

**Assumptions**: 820 kW total chiller capacity (condensing side ≈ input + cooling); 50% average load factor during cooling season; 100% of condenser rejection is recoverable in principle

### 2. Trigeneration Heat Allocation Optimization

- **System**: trigeneration
- **Location**: cogen_room
- **Captured power**: 50.8 kW
- **Recoverable energy**: 407.9 MWh/year
- **CO₂ reduction**: 91.6 tCO₂/year
- **Annual savings**: 11,122 DT/year
- **CAPEX**: 30,000 DT
- **Simple payback**: 2.7 years
- **NPV (10y)**: 55,880 DT
- **Priority score**: 56.6/100
- **Complexity**: medium

**Assumptions**: 1270 kW trigeneration engine thermal output at rated power; 20% of thermal output wasted due to dispatch inefficiency (estimated); 8030 h/year engine availability based on telemetry

### 3. Steam Boiler Economizer

- **System**: steam_boilers
- **Location**: boiler_room
- **Captured power**: 54.1 kW
- **Recoverable energy**: 355.4 MWh/year
- **CO₂ reduction**: 79.8 tCO₂/year
- **Annual savings**: 9,452 DT/year
- **CAPEX**: 45,000 DT
- **Simple payback**: 4.8 years
- **NPV (10y)**: 27,982 DT
- **Priority score**: 49.4/100
- **Complexity**: medium

**Assumptions**: 1840 kW total boiler nominal output (2 × 920 kW); 70% average load factor from billing data; 7% of input energy lost in flue gas (stack temperature not directly measured)

---

## 7. Sensitivity Notes

- Compressor heat recovery payback is sensitive to actual load factor and nearby hot water demand.
- Boiler economizer savings depend heavily on flue gas temperature (not measured — assumed 160°C).
- Chiller condenser heat recovery requires demand validation; low temperature (35–45°C) limits usability.
- Trigeneration dispatch optimization savings are contingent on operational scheduling changes.
- All savings assume stable natural gas price of 0.028 DT/kWh.

---

## 8. Measurement Gaps

The following measurements are required before investment-grade analysis:

**Chiller Condenser Heat Recovery**:
- condenser water temperature in/out
- cooling water flow rate
- availability of nearby hot water demand
- integration study for piping routing

**Trigeneration Heat Allocation Optimization**:
- recovered heat meter at cogen hot water circuit
- boiler gas meter with timestamps
- hot water demand profile
- cogen operation schedule

**Steam Boiler Economizer**:
- flue gas temperature at stack
- flue gas flow rate
- feedwater temperature
- boiler operating schedule

**Hot Surface Insulation**:
- thermographic surface survey
- bare pipe and valve inventory
- surface temperature measurements
- ambient temperature profile

**Compressor Heat Recovery**:
- compressor exhaust temperature
- actual operating schedule
- nearby hot water demand

**Automatic Blowdown / TDS Heat Recovery**:
- TDS level in boiler water
- actual blowdown rate
- blowdown water temperature
- makeup water temperature

**Beta Zone Heat Recovery Extension**:
- Beta zone thermal demand profile
- existing hot water supply capacity at Beta boundary
- piping distance and route survey
- return temperature feasibility

**Condensate Recovery Improvement**:
- condensate return flow rate
- condensate temperature at return header
- steam trap condition survey
- makeup water meter readings

---

## 9. Jury Demo Path

```
1. Open /recovery dashboard page
2. Review KPI cards: total MWh, CO₂, savings, best payback
3. Review ranked opportunity table
4. Use simulator: change capture_efficiency on compressor recovery
5. Observe delta in payback and NPV
6. Click 'Export Track B Submission'
7. Show generated JSON and Markdown report
```

**Pitch**: Our platform does not stop at CO₂ reporting. After ingesting documents, telemetry, and SCADA-like data, it closes the decision loop by identifying where the plant is wasting recoverable heat, ranking the opportunities by energy, CO₂ impact, ROI, feasibility, and confidence, then turning the audit into an actionable investment roadmap.

---
*Report generated by NRTF Recovery Engine — 2026-05-03T01:02:25.417240+00:00*