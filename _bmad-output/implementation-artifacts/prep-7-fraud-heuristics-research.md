# Fraud Detection Heuristics Research — OSLSR

**Date:** 2026-02-17
**Story:** prep-7-fraud-detection-domain-research
**Author:** Dev Agent (Claude Opus 4.6)
**Architecture Reference:** ADR-003 — Fraud Detection Engine Design
**Target:** Story 4.3 (Fraud Engine Configurable Thresholds), Story 4.4 (Flagged Submission Review)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [GPS Clustering Heuristic](#2-gps-clustering-heuristic)
3. [Speed Run Detection Heuristic](#3-speed-run-detection-heuristic)
4. [Straight-lining Detection Heuristic](#4-straight-lining-detection-heuristic)
5. [Duplicate Response Detection](#5-duplicate-response-detection)
6. [Off-Hours Submission Detection](#6-off-hours-submission-detection)
7. [Composite Scoring Model](#7-composite-scoring-model)
8. [Threshold Schema Design](#8-threshold-schema-design)
9. [Implementation Handoff Package](#9-implementation-handoff-package)
10. [References](#10-references)

---

## 1. Executive Summary

This document defines the fraud detection heuristics for the OSLSR (Oyo State Labour & Skills Registry) system. The system supports ~200 field enumerators conducting household surveys using a 6-section questionnaire via an offline-first PWA with GPS capture.

**Design Principles:**
- Rule-based with pluggable heuristics (ADR-003)
- DB-backed configurable thresholds with runtime adjustment
- Weighted additive composite scoring (0-100 scale)
- Pilot tuning target: 2-5% of submissions flagged for manual review
- Each heuristic independently testable and can be disabled via `isActive` flag
- No ML/AI models — weighted additive model is appropriate for pilot phase
- No PostGIS dependency — pure TypeScript at 200-enumerator scale

**Five Heuristic Categories:**

| # | Heuristic | Max Score | Weight |
|---|-----------|-----------|--------|
| 1 | GPS Clustering | 25 | 25% |
| 2 | Speed Run | 25 | 25% |
| 3 | Straight-lining | 20 | 20% |
| 4 | Duplicate Response | 20 | 20% |
| 5 | Off-Hours Timing | 10 | 10% |

---

## 2. GPS Clustering Heuristic

**Category:** `gps`
**Max Score:** 25 points
**Purpose:** Detect enumerators who fabricate interviews by submitting multiple responses from the same location (e.g., sitting at home) rather than visiting different households.

### 2.1 Algorithm: DBSCAN with Haversine Distance

DBSCAN (Density-Based Spatial Clustering of Applications with Noise) is used to identify clusters of GPS coordinates that indicate an enumerator did not travel between interviews.

**Why DBSCAN:**
- No need to specify number of clusters in advance
- Identifies noise points (legitimate single-location interviews)
- Works with arbitrary cluster shapes (unlike k-means)
- Efficient at the scale of ~200 enumerators with ~20-50 interviews/day each

### 2.2 Haversine Distance Formula

The Haversine formula calculates the great-circle distance between two GPS coordinates on Earth's surface.

```
Given two points (lat1, lon1) and (lat2, lon2) in decimal degrees:

1. Convert to radians:
   lat1_rad = lat1 * PI / 180
   lon1_rad = lon1 * PI / 180
   lat2_rad = lat2 * PI / 180
   lon2_rad = lon2 * PI / 180

2. Compute deltas:
   dlat = lat2_rad - lat1_rad
   dlon = lon2_rad - lon1_rad

3. Haversine formula:
   a = sin(dlat/2)^2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon/2)^2
   c = 2 * atan2(sqrt(a), sqrt(1 - a))
   distance_meters = R * c

   where R = 6_371_000 (Earth's mean radius in meters)
```

**TypeScript Implementation Reference:**

```typescript
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // meters
}
```

### 2.3 DBSCAN Algorithm Pseudocode

```
DBSCAN(points, epsilon, minSamples):
  labels = array of UNDEFINED for each point
  clusterCount = 0

  for each point P in points:
    if labels[P] != UNDEFINED:
      continue

    neighbors = rangeQuery(P, epsilon)

    if |neighbors| < minSamples:
      labels[P] = NOISE
      continue

    clusterCount += 1
    labels[P] = clusterCount
    seedSet = neighbors \ {P}

    for each Q in seedSet:
      if labels[Q] == NOISE:
        labels[Q] = clusterCount  // border point
      if labels[Q] != UNDEFINED:
        continue
      labels[Q] = clusterCount
      neighborsQ = rangeQuery(Q, epsilon)
      if |neighborsQ| >= minSamples:
        seedSet = seedSet ∪ neighborsQ

  return labels, clusterCount


rangeQuery(P, epsilon):
  return { Q in points : haversineDistance(P, Q) <= epsilon }
```

### 2.4 Default Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `gps_cluster_radius_m` | 50 | Nigerian urban plots are typically 18m x 36m (648 sq.m). 50m accounts for GPS inaccuracy on TECNO/Infinix devices and adjacent household visits. |
| `gps_cluster_min_samples` | 3 | Minimum 3 submissions from same location within time window to form a cluster. 2 is too sensitive (legitimate revisit). |
| `gps_cluster_time_window_h` | 4 | Hours within which to analyze clustering per enumerator per day. Full day (24h) would catch legitimate multi-trip scenarios. |
| `gps_max_accuracy_m` | 50 | GPS accuracy filter. Readings with reported accuracy >50m are flagged as unreliable. Nigerian budget smartphones (TECNO Spark, Infinix Hot) typically report 5-20m accuracy outdoors, but can degrade to >100m indoors or in dense urban areas. |
| `gps_teleport_speed_kmh` | 120 | Maximum plausible travel speed between consecutive interviews. Oyo State road conditions rarely allow >80 km/h. 120 km/h provides margin for highway segments (Ibadan-Lagos expressway). Speeds above this indicate GPS spoofing or fabrication. |
| `gps_weight` | 25 | Component weight in composite score |

### 2.5 Scoring Rules

```
GPS Score Calculation:
  Input: submissions[] for enumerator within time_window

  1. Filter out submissions with GPS accuracy > gps_max_accuracy_m
     → Flag filtered submissions as "low_accuracy" (informational, not scored)

  2. Run DBSCAN(gps_points, epsilon=gps_cluster_radius_m, minSamples=gps_cluster_min_samples)

  3. For each cluster found:
     clusterSize = number of points in cluster
     if clusterSize >= gps_cluster_min_samples:
       clusterScore = min(25, (clusterSize - gps_cluster_min_samples + 1) * 8)
       // 3 points → 8, 4 → 16, 5+ → 25 (capped)

  4. Teleportation check (per consecutive pair):
     timeDiff_h = (submission[i+1].submittedAt - submission[i].submittedAt) / 3600
     distance_km = haversineDistance(gps[i], gps[i+1]) / 1000
     speed_kmh = distance_km / timeDiff_h
     if speed_kmh > gps_teleport_speed_kmh:
       teleportScore = 25  // Maximum penalty

  5. Duplicate coordinate check:
     For submissions from DIFFERENT enumerators on SAME day:
     if haversineDistance(gps_a, gps_b) < 5m:
       duplicateCoordScore = 15  // Strong signal of coordination/fabrication

  6. gpsScore = min(25, max(clusterScore, teleportScore, duplicateCoordScore))
```

### 2.6 False-Positive Mitigation

- **Urban density:** In Ibadan markets/motor parks, legitimate consecutive interviews may cluster within 50m. The `minSamples=3` threshold prevents flagging pairs.
- **GPS accuracy:** Poor accuracy readings (>50m) are excluded from clustering but flagged separately for informational purposes.
- **Time window:** 4-hour window prevents flagging an enumerator who returns to the same area on different days.
- **Per-enumerator baseline:** After 30+ interviews, compare each enumerator's cluster ratio against their own historical norm rather than global threshold. An enumerator who consistently works in dense urban areas will have naturally tighter clusters.

### 2.7 OSLSR-Specific Adaptations

- **Nigerian hardware (TECNO/Infinix):** These devices have GPS chipsets with variable accuracy. The 50m accuracy filter accounts for this without being overly restrictive.
- **Offline-first PWA:** GPS coordinates are captured at interview time and stored in IndexedDB. The coordinates are submitted during sync, which may be hours later. The `submittedAt` timestamp (client-side) is used for time-based analysis, not `ingestedAt` (server-side).
- **Oyo State geography:** The 33 LGAs cover both urban (Ibadan) and rural areas. Rural interviews naturally have wider spacing; urban interviews cluster tighter. Per-LGA normalization may be a future enhancement but is not needed for pilot.

---

## 3. Speed Run Detection Heuristic

**Category:** `speed`
**Max Score:** 25 points
**Purpose:** Detect enumerators who complete interviews unrealistically quickly, suggesting they are fabricating responses without actually conducting the interview.

### 3.1 Algorithm: Two-Tier Median-Ratio Model

Speed detection compares an individual interview's completion time against the population median for the same form. Two tiers capture different severity levels.

### 3.2 Pseudocode

```
SpeedRunDetection(submission, enumeratorHistory, globalHistory):
  completionTime = submission.completedAt - submission.startedAt  // seconds

  // Determine reference median
  if enumeratorHistory.count >= 30:
    // Empirical median: use this enumerator's own history
    referenceMed = median(enumeratorHistory.completionTimes)
  else if globalHistory.count >= 30:
    // Global median: use all enumerators' history for this form
    referenceMed = median(globalHistory.completionTimes)
  else:
    // Bootstrap: calculate theoretical minimum from form structure
    referenceMed = theoreticalMinimum(submission.formSchema)

  // Tier classification
  ratio = completionTime / referenceMed

  if ratio < 0.25:
    // Tier 1: Superspeceder — under 25% of median
    speedScore = 25
    tier = "superspeceder"
  else if ratio < 0.50:
    // Tier 2: Speeder — under 50% of median
    speedScore = 12
    tier = "speeder"
  else:
    speedScore = 0
    tier = "normal"

  // Secondary metric: questions-per-minute
  totalQuestions = countQuestions(submission.formSchema)
  durationMinutes = completionTime / 60
  qpm = totalQuestions / durationMinutes

  if qpm > 30:
    qpmFlag = "critical"  // Physically impossible reading speed
    speedScore = max(speedScore, 25)
  else if qpm > 15:
    qpmFlag = "suspicious"
    speedScore = max(speedScore, 12)

  // Per-section timing analysis
  for each section in submission.sectionTimings:
    sectionMedian = median(allSectionTimings[section.id])
    if section.duration < 0.20 * sectionMedian:
      // Flag individual section as rushed
      sectionFlags.push({ sectionId: section.id, ratio: section.duration / sectionMedian })

  return { speedScore, tier, ratio, qpm, qpmFlag, sectionFlags }
```

### 3.3 Theoretical Minimum Calculation (Bootstrap)

When fewer than 30 interviews exist to establish an empirical median, use a theoretical floor based on form structure:

```
theoreticalMinimum(formSchema):
  closedQCount = count questions where type in ['select_one', 'select_multiple']
  openQCount = count questions where type in ['text', 'textarea']
  numericQCount = count questions where type in ['integer', 'decimal']
  overhead = 30  // seconds for greeting, consent, closing

  minimum = (closedQCount * 3) + (openQCount * 8) + (numericQCount * 4) + overhead
  return minimum  // seconds
```

**Time estimates per question type:**

| Question Type | Seconds | Rationale |
|---------------|---------|-----------|
| Closed (select_one/multiple) | 3s | Read question + select option |
| Open (text/textarea) | 8s | Read question + type/dictate answer |
| Numeric (integer/decimal) | 4s | Read question + enter number |
| Overhead | 30s | Greeting, consent, closing |

### 3.4 Default Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `speed_superspeceder_pct` | 25 | Below 25% of median is physically implausible for genuine interview. Research (PMC11646990) confirms <25% as strong indicator. |
| `speed_speeder_pct` | 50 | Below 50% of median is suspicious but possible for experienced enumerators with cooperative respondents. |
| `speed_bootstrap_n` | 30 | Minimum interviews needed to establish reliable empirical median. Statistical stability threshold. |
| `speed_weight` | 25 | Component weight in composite score |

### 3.5 False-Positive Mitigation

- **Experienced enumerators:** Long-serving enumerators naturally speed up. Per-enumerator median (after 30+ interviews) accounts for this.
- **Short forms:** Forms with <10 questions can be completed quickly legitimately. The theoretical minimum provides a floor.
- **Re-interviews:** If a respondent was previously interviewed and answers are unchanged, completion may be faster. Cross-reference with `respondentId` to check for re-interviews.
- **Section-level analysis:** A genuinely fast enumerator is fast across all sections. Fabrication typically shows uniform rushing in early sections with normal speed in final sections (fatigue in fabrication).

### 3.6 OSLSR-Specific Adaptations

- **6-section questionnaire:** The OSLSR form has 6 sections. Section-level timing analysis provides granular insight.
- **Yoruba bilingual support:** Questions have English + Yoruba labels. Interviews conducted in Yoruba may be faster (no translation overhead). This does not invalidate speed detection — the median naturally adjusts for the dominant interview language in each LGA.
- **Offline completion:** Start/complete timestamps are recorded client-side. Clock skew between devices is not a concern for duration calculation (same device).

---

## 4. Straight-lining Detection Heuristic

**Category:** `straightline`
**Max Score:** 20 points
**Purpose:** Detect enumerators who select the same answer for consecutive scale questions, indicating they are not reading questions to respondents.

### 4.1 Algorithm: Three Complementary Methods

Straight-lining detection uses three independent metrics that must converge before flagging.

#### 4.1.1 PIR — Percentage of Identical Responses

```
PIR(battery):
  // battery = array of responses to scale questions in a group
  // Only applies to batteries of 5+ scale questions

  if battery.length < 5:
    return null  // Not applicable

  // Count most frequent response
  responseCounts = countOccurrences(battery)
  maxCount = max(responseCounts.values())

  pir = maxCount / battery.length
  return pir

  // Flag at PIR >= 0.80 (80% identical responses)
```

#### 4.1.2 LIS — Longest Identical String

```
LIS(battery):
  // Longest run of consecutive identical responses

  maxRun = 1
  currentRun = 1

  for i = 1 to battery.length - 1:
    if battery[i] == battery[i-1]:
      currentRun += 1
      maxRun = max(maxRun, currentRun)
    else:
      currentRun = 1

  return maxRun

  // Flag at LIS >= 8 consecutive identical responses
```

#### 4.1.3 Shannon Entropy

```
ShannonEntropy(battery):
  // Measure response diversity (0 = no diversity, high = diverse)

  n = battery.length
  responseCounts = countOccurrences(battery)

  H = 0
  for each count in responseCounts.values():
    p = count / n
    if p > 0:
      H -= p * log2(p)

  return H

  // Flag at H < 0.5 bits (very low diversity)
  // For reference: 5-point scale with equal distribution → H = 2.32 bits
  // All-same responses → H = 0 bits
```

### 4.2 Combined Scoring Pseudocode

```
StraightlineDetection(submission, formSchema):
  // Identify scale-question batteries (groups of 5+ Likert/scale questions)
  batteries = extractBatteries(formSchema, submission.responses)
  // Battery = consecutive scale questions with same choice set

  flaggedBatteries = 0
  batteryDetails = []

  for each battery in batteries:
    pir = PIR(battery.responses)
    lis = LIS(battery.responses)
    entropy = ShannonEntropy(battery.responses)

    isFlagged = false
    reasons = []

    if pir !== null and pir >= 0.80:
      reasons.push({ metric: 'PIR', value: pir, threshold: 0.80 })
      isFlagged = true

    if lis >= 8:
      reasons.push({ metric: 'LIS', value: lis, threshold: 8 })
      isFlagged = true

    if entropy < 0.50:
      reasons.push({ metric: 'entropy', value: entropy, threshold: 0.50 })
      isFlagged = true

    if isFlagged:
      flaggedBatteries += 1
      batteryDetails.push({ batteryId: battery.id, reasons })

  // Scoring: require flags in 2+ separate batteries to trigger full score
  if flaggedBatteries >= 2:
    straightlineScore = 20  // Full penalty: pattern in multiple batteries
  else if flaggedBatteries == 1:
    straightlineScore = 10  // Partial: could be legitimate uniform opinion
  else:
    straightlineScore = 0

  return { straightlineScore, flaggedBatteries, batteryDetails }
```

### 4.3 Default Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `straightline_pir_threshold` | 0.80 | 80% identical responses in a battery. Research (PMC8944307) confirms this as a reliable threshold. |
| `straightline_min_battery_size` | 5 | Minimum questions to constitute a battery for analysis. Fewer than 5 is not statistically meaningful. |
| `straightline_entropy_threshold` | 0.50 | Shannon entropy below 0.5 bits indicates near-zero response diversity. |
| `straightline_min_flagged_batteries` | 2 | Require 2+ flagged batteries to trigger full penalty. Single-battery flag is partial. |
| `straightline_weight` | 20 | Component weight in composite score |

### 4.4 False-Positive Mitigation

- **Legitimately uniform responses:** Some demographic questions naturally have uniform answers in homogeneous communities (e.g., "Do you have access to electricity?" in a rural village where nobody does). Battery-level analysis prevents flagging these.
- **Cross-battery consistency:** A single flagged battery gets partial score (10 points). Only 2+ batteries trigger full penalty. This distinguishes legitimate uniformity from fabrication.
- **Per-enumerator baseline:** After 30+ interviews, compare each enumerator's average PIR against their own historical norm. An enumerator working in homogeneous communities will have naturally higher PIR.
- **Direction check:** If the same pattern appears across different sections with different topics, it's much more likely to be fabrication than a legitimately uniform population.

### 4.5 OSLSR-Specific Adaptations

- **6-section form:** The OSLSR questionnaire has 6 sections. Straight-lining is analyzed per-battery within sections, not across the entire form.
- **Choice list variety:** The form includes both Likert scales and categorical choices. Only batteries with ordinal/scale response types are analyzed (not categorical questions like "Which LGA do you live in?").
- **Yoruba/English:** Response values are stored by `value` key (not label), so bilingual display does not affect analysis.

---

## 5. Duplicate Response Detection

**Category:** `duplicate`
**Max Score:** 20 points
**Purpose:** Detect when an enumerator submits an interview that is identical or near-identical to another interview, suggesting copy-paste fabrication.

### 5.1 Algorithm

```
DuplicateDetection(submission, recentSubmissions):
  // Compare against recent submissions (same form, last 7 days)

  for each other in recentSubmissions:
    if other.id == submission.id:
      continue

    matchingFields = 0
    totalFields = 0

    for each field in submission.rawData:
      totalFields += 1
      if field.value == other.rawData[field.key]:
        matchingFields += 1

    matchRatio = matchingFields / totalFields

    if matchRatio >= 1.00:
      // Exact duplicate (100% field match)
      return { duplicateScore: 20, matchType: 'exact', matchedSubmissionId: other.id, matchRatio }

    if matchRatio >= 0.70:
      // Partial duplicate (>70% field match)
      return { duplicateScore: 10, matchType: 'partial', matchedSubmissionId: other.id, matchRatio }

  return { duplicateScore: 0, matchType: 'none', matchedSubmissionId: null, matchRatio: 0 }
```

### 5.2 Exclusions

- **Same respondent re-interview:** If `respondentId` matches, this is a legitimate follow-up. Exclude from duplicate detection.
- **Common demographic fields:** Fields like LGA, state, and date should be excluded from the match ratio calculation as they are naturally identical for same-area interviews.

---

## 6. Off-Hours Submission Detection

**Category:** `timing`
**Max Score:** 10 points
**Purpose:** Detect interviews submitted during unusual hours, which may indicate fabrication (filing fake interviews late at night).

### 6.1 Algorithm

```
OffHoursDetection(submission):
  // Use client-side submittedAt timestamp (local time zone)
  localHour = getLocalHour(submission.submittedAt, 'Africa/Lagos')  // WAT (UTC+1)

  timingScore = 0

  if localHour >= 23 or localHour < 5:
    // Late night / early morning (11 PM - 5 AM)
    timingScore = 10

  dayOfWeek = getDayOfWeek(submission.submittedAt)
  if dayOfWeek in ['Saturday', 'Sunday']:
    // Weekend submission
    timingScore = max(timingScore, 5)

  return { timingScore, localHour, dayOfWeek }
```

### 6.2 Default Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `timing_weight` | 10 | Lowest weight — timing alone is weak signal |

### 6.3 Limitations

- Off-hours timing is the weakest heuristic. Enumerators may legitimately submit during off-hours if they were collecting data offline and syncing later. This is why the weight is only 10 points.
- Weekend fieldwork is common in survey operations. The 5-point penalty is intentionally low.

---

## 7. Composite Scoring Model

### 7.1 Formula

```
totalScore = min(100, gpsScore + speedScore + straightlineScore + duplicateScore + timingScore)
```

All component scores are independently calculated and simply summed. The `min(100, ...)` cap prevents scores above 100.

### 7.2 Component Weights

| Component | Max Points | Weight | Rationale |
|-----------|-----------|--------|-----------|
| GPS Clustering | 25 | 25% | Strong physical evidence of fabrication |
| Speed Run | 25 | 25% | Strong behavioral evidence of rushing |
| Straight-lining | 20 | 20% | Moderate evidence — could be legitimate |
| Duplicate Response | 20 | 20% | Strong evidence when triggered |
| Off-Hours Timing | 10 | 10% | Weak signal — contextual only |

### 7.3 Severity Levels

| Score Range | Severity | Supervisor Action | SLA |
|-------------|----------|-------------------|-----|
| 0-24 | `clean` | Auto-accept | None |
| 25-49 | `low` | Weekly review batch | 7 days |
| 50-69 | `medium` | Next-day callback/verification | 24 hours |
| 70-84 | `high` | Immediate notification, hold payment | 4 hours |
| 85-100 | `critical` | Auto-quarantine, block enumerator until cleared | Immediate |

### 7.4 Severity Cutoff Thresholds

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| `severity_low_min` | 25 | Yes |
| `severity_medium_min` | 50 | Yes |
| `severity_high_min` | 70 | Yes |
| `severity_critical_min` | 85 | Yes |

### 7.5 Pilot Tuning Target

**Target:** 2-5% of submissions flagged for manual review (severity >= medium).

- **40% flagged = too aggressive** — supervisors overwhelmed, false-positive fatigue
- **0.5% flagged = too lenient** — fraud slips through undetected

The dashboard will show threshold hit rates per heuristic, enabling Super Admins to tune weights and thresholds based on pilot data.

---

## 8. Threshold Schema Design

### 8.1 Temporal Versioning Pattern

**Never UPDATE threshold rows — always INSERT a new version:**

```sql
-- Example: Change GPS radius from 50m to 75m

-- Step 1: Close current version
UPDATE fraud_thresholds
SET effective_until = NOW()
WHERE rule_key = 'gps_cluster_radius_m' AND effective_until IS NULL;

-- Step 2: Insert new version
INSERT INTO fraud_thresholds (
  rule_key, display_name, rule_category, threshold_value,
  weight, is_active, effective_from, version, created_by
) VALUES (
  'gps_cluster_radius_m', 'GPS Cluster Radius (m)', 'gps', 75.0000,
  NULL, true, NOW(), 2, '<admin-uuid>'
);
```

**Benefits:**
- Full audit trail of every threshold change
- Historical score auditing: every `fraud_detections` row stores `config_snapshot_version`
- Rollback capability: reactivate a previous version by closing current and inserting a copy

### 8.2 Table: `fraud_thresholds`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID (v7) | PK | Unique threshold record ID |
| `rule_key` | VARCHAR(100) | NOT NULL | Machine-readable key (e.g., `gps_cluster_radius_m`) |
| `display_name` | TEXT | NOT NULL | Human-readable name for UI |
| `rule_category` | ENUM | NOT NULL | One of: gps, speed, straightline, duplicate, timing, composite |
| `threshold_value` | NUMERIC(12,4) | NOT NULL | The threshold value |
| `weight` | NUMERIC(5,2) | NULLABLE | Component weight (only for category-level weight records) |
| `severity_floor` | VARCHAR(20) | NULLABLE | Minimum severity for auto-escalation (optional) |
| `is_active` | BOOLEAN | NOT NULL DEFAULT true | Whether this threshold is currently active |
| `effective_from` | TIMESTAMP(tz) | NOT NULL | When this version became active |
| `effective_until` | TIMESTAMP(tz) | NULLABLE | When this version was superseded (NULL = current) |
| `version` | INTEGER | NOT NULL | Version counter per rule_key |
| `created_by` | UUID (FK→users) | NOT NULL | Who created this version |
| `created_at` | TIMESTAMP(tz) | NOT NULL DEFAULT NOW() | Record creation timestamp |
| `notes` | TEXT | NULLABLE | Admin notes for why threshold was changed |

**Constraints:**
- UNIQUE on `(rule_key, version)` — prevents duplicate version numbers per rule
- INDEX on `(is_active, effective_until)` — fast lookup of current active thresholds

### 8.3 Table: `fraud_detections`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID (v7) | PK | Unique detection record ID |
| `submission_id` | UUID (FK→submissions) | NOT NULL | The evaluated submission |
| `enumerator_id` | UUID (FK→users) | NOT NULL | The submitting enumerator |
| `computed_at` | TIMESTAMP(tz) | NOT NULL | When the score was computed |
| `config_snapshot_version` | INTEGER | NOT NULL | Threshold version used for this computation |
| `gps_score` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | GPS clustering component score |
| `speed_score` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Speed run component score |
| `straightline_score` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Straight-lining component score |
| `duplicate_score` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Duplicate response component score |
| `timing_score` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Off-hours timing component score |
| `total_score` | NUMERIC(5,2) | NOT NULL | Composite score (0-100) |
| `severity` | VARCHAR(20) | NOT NULL | clean, low, medium, high, critical |
| `gps_details` | JSONB | NULLABLE | GPS heuristic detail breakdown |
| `speed_details` | JSONB | NULLABLE | Speed heuristic detail breakdown |
| `straightline_details` | JSONB | NULLABLE | Straight-lining detail breakdown |
| `duplicate_details` | JSONB | NULLABLE | Duplicate detection detail breakdown |
| `reviewed_by` | UUID (FK→users) | NULLABLE | Supervisor who reviewed |
| `reviewed_at` | TIMESTAMP(tz) | NULLABLE | When the review occurred |
| `resolution` | VARCHAR(30) | NULLABLE | Resolution outcome |
| `resolution_notes` | TEXT | NULLABLE | Supervisor notes on resolution |

**Constraints:**
- INDEX on `(severity, resolution)` — supervisor queue queries
- INDEX on `(enumerator_id)` — per-enumerator fraud history
- INDEX on `(submission_id)` — submission → fraud lookup

**Resolution Values:** `confirmed_fraud`, `false_positive`, `needs_investigation`, `dismissed`, `enumerator_warned`, `enumerator_suspended`

---

## 9. Implementation Handoff Package

### 9.1 FraudEngine Service Interface (Story 4.3)

```typescript
/**
 * Core entry point for fraud evaluation.
 * Called by BullMQ fraud-detection worker.
 */
interface FraudEngine {
  evaluate(submissionId: string): Promise<FraudDetectionResult>;
}

/**
 * Registry for pluggable heuristics.
 * Each heuristic is independently registered and can be enabled/disabled.
 */
interface HeuristicRegistry {
  register(heuristic: FraudHeuristic): void;
  unregister(key: string): void;
  getActive(): FraudHeuristic[];
}

/**
 * Loads active thresholds from DB with Redis cache.
 * Cache key: fraud:thresholds:active (TTL 5 min)
 *
 * CRITICAL: On threshold INSERT (new version), ConfigService MUST
 * invalidate Redis cache keys immediately via explicit DEL fraud:thresholds:*
 * Do NOT rely on TTL expiry alone. Story 4.3 AC requires "immediately apply" semantics.
 */
interface ConfigService {
  getActiveThresholds(): Promise<FraudThresholdConfig[]>;
  getThresholdsByCategory(category: HeuristicCategory): Promise<FraudThresholdConfig[]>;
  invalidateCache(): Promise<void>;
}

/**
 * Combines component scores into composite score with severity.
 */
interface ScoringAggregator {
  aggregate(componentScores: FraudComponentScore): {
    totalScore: number;
    severity: FraudSeverity;
  };
}
```

### 9.2 Worker Pattern

```typescript
// BullMQ fraud-detection worker (replace current stub)
// File: apps/api/src/workers/fraud-detection.worker.ts

import { Worker } from 'bullmq';
import { fraudEngine } from '../services/fraud-engine.service.js';

const worker = new Worker('fraud-detection', async (job) => {
  const { submissionId } = job.data;

  // 1. Run all active heuristics
  const result = await fraudEngine.evaluate(submissionId);

  // 2. Store result in fraud_detections table
  await db.insert(fraudDetections).values({
    submissionId: result.submissionId,
    enumeratorId: result.enumeratorId,
    computedAt: new Date(),
    configSnapshotVersion: result.configVersion,
    gpsScore: result.componentScores.gps,
    speedScore: result.componentScores.speed,
    straightlineScore: result.componentScores.straightline,
    duplicateScore: result.componentScores.duplicate,
    timingScore: result.componentScores.timing,
    totalScore: result.totalScore,
    severity: result.severity,
    gpsDetails: result.details.gps,
    speedDetails: result.details.speed,
    straightlineDetails: result.details.straightline,
    duplicateDetails: result.details.duplicate,
  });

  // 3. Push notification if severity >= high
  if (result.severity === 'high' || result.severity === 'critical') {
    // Emit realtime notification to supervisor via Socket.io
    // (using prep-6 Socket.io infrastructure)
    await notificationService.notifySupervisor({
      type: 'fraud_alert',
      submissionId,
      severity: result.severity,
      totalScore: result.totalScore,
    });
  }

  return { processed: true, severity: result.severity, score: result.totalScore };
});
```

### 9.3 API Endpoints for Threshold Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/fraud-thresholds` | Super Admin | List all active thresholds |
| `PUT` | `/api/v1/fraud-thresholds/:ruleKey` | Super Admin | Create new version (NOT update) |
| `GET` | `/api/v1/fraud-detections` | Supervisor + Assessor + Super Admin | Filtered list for review queue |
| `PATCH` | `/api/v1/fraud-detections/:id/review` | Supervisor + Assessor + Super Admin | Resolve with verdict |

**PUT `/api/v1/fraud-thresholds/:ruleKey` Request Body:**
```json
{
  "thresholdValue": 75.0,
  "notes": "Increased GPS radius for urban Ibadan LGAs based on pilot data"
}
```

**PUT Response:**
```json
{
  "data": {
    "id": "018e...",
    "ruleKey": "gps_cluster_radius_m",
    "thresholdValue": 75.0,
    "version": 2,
    "effectiveFrom": "2026-02-17T14:30:00.000Z",
    "previousVersion": 1
  }
}
```

**GET `/api/v1/fraud-detections` Query Params:**
```
?severity=high,critical          // Filter by severity (comma-separated)
&resolution=null                 // Unreviewed only (null = no resolution yet)
&enumeratorId=<uuid>             // Filter by enumerator
&dateFrom=2026-02-01             // Date range
&dateTo=2026-02-17
&page=1&pageSize=20              // Pagination
&sortBy=totalScore&sortOrder=desc
```

**PATCH `/api/v1/fraud-detections/:id/review` Request Body:**
```json
{
  "resolution": "confirmed_fraud",
  "resolutionNotes": "GPS coordinates match enumerator's home address. 5 interviews submitted from same location within 2 hours."
}
```

### 9.4 File Touchpoints for Story 4.3

**Files to CREATE:**

| File | Purpose |
|------|---------|
| `apps/api/src/services/fraud-engine.service.ts` | FraudEngine orchestrator |
| `apps/api/src/services/fraud-config.service.ts` | ConfigService (DB + Redis cache) |
| `apps/api/src/services/fraud-scoring.service.ts` | ScoringAggregator |
| `apps/api/src/services/heuristics/gps-cluster.heuristic.ts` | GPS heuristic implementation |
| `apps/api/src/services/heuristics/speed-run.heuristic.ts` | Speed run heuristic implementation |
| `apps/api/src/services/heuristics/straightline.heuristic.ts` | Straight-lining heuristic |
| `apps/api/src/services/heuristics/duplicate.heuristic.ts` | Duplicate detection heuristic |
| `apps/api/src/services/heuristics/timing.heuristic.ts` | Off-hours heuristic |
| `apps/api/src/services/heuristics/index.ts` | Heuristic registry |
| `apps/api/src/controllers/fraud-thresholds.controller.ts` | Threshold CRUD controller |
| `apps/api/src/controllers/fraud-detections.controller.ts` | Detection review controller |
| `apps/api/src/routes/fraud.routes.ts` | Fraud API routes |
| `apps/api/src/services/__tests__/fraud-engine.service.test.ts` | Unit tests for FraudEngine |
| `apps/api/src/services/__tests__/fraud-config.service.test.ts` | Unit tests for ConfigService |
| `apps/api/src/services/__tests__/fraud-scoring.service.test.ts` | Unit tests for ScoringAggregator |
| `apps/api/src/services/heuristics/__tests__/gps-cluster.heuristic.test.ts` | GPS heuristic tests |
| `apps/api/src/services/heuristics/__tests__/speed-run.heuristic.test.ts` | Speed run tests |
| `apps/api/src/services/heuristics/__tests__/straightline.heuristic.test.ts` | Straight-lining tests |

**Files to MODIFY:**

| File | Change |
|------|--------|
| `apps/api/src/workers/fraud-detection.worker.ts` | Replace stub with real implementation |
| `apps/api/src/routes/index.ts` | Add fraud routes |
| `apps/api/src/db/schema/index.ts` | Already done by prep-7 (fraud tables exported) |

**Files to LEAVE UNCHANGED:**

| File | Reason |
|------|--------|
| `apps/api/src/queues/fraud-detection.queue.ts` | Queue setup is correct; only worker changes |
| `apps/api/src/services/submission-processing.service.ts` | Queue trigger is correct (fires when GPS present) |
| `apps/api/src/db/schema/submissions.ts` | GPS columns already exist |
| `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` | UI placeholder — Story 4.4 scope |

### 9.5 Test Strategy for Story 4.3

**Unit Tests (per heuristic in isolation):**
- GPS: test cluster detection with known coordinate sets, test Haversine accuracy, test teleportation detection
- Speed: test tier classification at boundary values, test bootstrap calculation, test per-section timing
- Straight-lining: test PIR calculation, test LIS detection, test entropy calculation, test battery extraction
- Duplicate: test exact match, test partial match at 70% threshold, test exclusion of same-respondent
- Timing: test off-hours detection, test weekend detection
- ConfigService: test cache hit/miss, test cache invalidation on threshold change
- ScoringAggregator: test composite calculation, test severity assignment at boundary values

**Integration Tests:**
- FraudEngine.evaluate() with all heuristics registered → correct composite score
- Threshold change → cache invalidation → new score uses updated threshold
- Worker processes job → stores result in fraud_detections → triggers notification for high severity

**E2E Test:**
- Admin changes GPS threshold → submit new interview → verify new threshold applied to scoring

---

## 10. References

1. **PMC11646990** — "AI-powered fraud and survey integrity: A systematic review of automated quality checks in survey research." Provides speeder detection thresholds (<25% median as strong indicator).

2. **PMC8944307** — "Comparison of detection methods for interviewer falsification in surveys." Validates PIR >= 0.80 as reliable straight-lining threshold and compares multiple detection approaches.

3. **PMC10818231** — "Assessing data integrity in web-based surveys: Methods, challenges, and best practices." Reviews composite scoring approaches and severity calibration.

4. **AAPOR Task Force Report** — "Falsification in surveys: Characteristics, detection methods, and prevention strategies." Industry standard reference for survey fraud detection methodology.

5. **Oxford Academic JSSAM** — "Detecting interviewer fraud using multilevel models." Covers per-interviewer baseline comparison techniques and hierarchical fraud models.

6. **ADR-003** — OSLSR Architecture Decision Record: Fraud Detection Engine Design. Defines the pluggable heuristic architecture, DB-backed thresholds, and runtime adjustment requirements.

7. **DBSCAN Original Paper** — Ester, M., et al. (1996). "A Density-Based Algorithm for Discovering Clusters in Large Spatial Databases with Noise." KDD-96.

8. **Haversine Formula** — Standard great-circle distance calculation for geographic coordinates. Used in place of PostGIS for the 200-enumerator scale of OSLSR.
