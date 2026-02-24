/**
 * Fraud Threshold Seed Data
 *
 * 27 default threshold records covering all heuristic categories.
 * All records have version 1 and are active.
 *
 * Created in prep-7 (Fraud Detection Domain Research).
 * Used by Story 4.3 (Fraud Engine Configurable Thresholds).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 * @see prep-7-fraud-heuristics-research.md
 */

import type { RuleCategory } from '../schema/fraud-thresholds.js';

export interface FraudThresholdSeedRecord {
  ruleKey: string;
  displayName: string;
  ruleCategory: RuleCategory;
  thresholdValue: string; // numeric as string for Drizzle
  weight: string | null;
  severityFloor: string | null;
  notes: string;
}

/**
 * Default fraud threshold seed data — 27 records.
 *
 * Categories:
 * - GPS (6 records): Clustering parameters + weight
 * - Speed (4 records): Tier thresholds + bootstrap + weight
 * - Straightline (5 records): PIR, battery size, entropy, min batteries, weight
 * - Duplicate (4 records): Exact/partial thresholds, lookback window, weight
 * - Timing (4 records): Night window, weekend penalty, weight
 * - Composite (4 records): Severity cutoffs
 */
export const FRAUD_THRESHOLD_DEFAULTS: FraudThresholdSeedRecord[] = [
  // ── GPS Clustering (6 records) ──────────────────────────────────────

  {
    ruleKey: 'gps_cluster_radius_m',
    displayName: 'GPS Cluster Radius (meters)',
    ruleCategory: 'gps',
    thresholdValue: '50.0000',
    weight: null,
    severityFloor: null,
    notes: 'DBSCAN epsilon parameter. Nigerian urban plots ~18x36m. 50m accounts for GPS inaccuracy on TECNO/Infinix devices.',
  },
  {
    ruleKey: 'gps_cluster_min_samples',
    displayName: 'GPS Cluster Minimum Samples',
    ruleCategory: 'gps',
    thresholdValue: '3.0000',
    weight: null,
    severityFloor: null,
    notes: 'DBSCAN minSamples. Minimum submissions from same location to form a cluster. 2 is too sensitive (legitimate revisit).',
  },
  {
    ruleKey: 'gps_cluster_time_window_h',
    displayName: 'GPS Cluster Time Window (hours)',
    ruleCategory: 'gps',
    thresholdValue: '4.0000',
    weight: null,
    severityFloor: null,
    notes: 'Hours within which to analyze GPS clustering per enumerator. Prevents flagging multi-day returns to same area.',
  },
  {
    ruleKey: 'gps_max_accuracy_m',
    displayName: 'GPS Maximum Accuracy (meters)',
    ruleCategory: 'gps',
    thresholdValue: '50.0000',
    weight: null,
    severityFloor: null,
    notes: 'Readings with reported accuracy >50m flagged as unreliable. Budget smartphones typically 5-20m outdoors, >100m indoors.',
  },
  {
    ruleKey: 'gps_teleport_speed_kmh',
    displayName: 'GPS Teleportation Speed (km/h)',
    ruleCategory: 'gps',
    thresholdValue: '120.0000',
    weight: null,
    severityFloor: null,
    notes: 'Max plausible travel speed between consecutive interviews. Oyo roads rarely >80km/h. 120 allows for highway segments.',
  },
  {
    ruleKey: 'gps_weight',
    displayName: 'GPS Heuristic Weight',
    ruleCategory: 'gps',
    thresholdValue: '25.0000',
    weight: '25.00',
    severityFloor: null,
    notes: 'Component weight in composite score (max 25 points). Strong physical evidence of fabrication.',
  },

  // ── Speed Run (4 records) ──────────────────────────────────────────

  {
    ruleKey: 'speed_superspeceder_pct',
    displayName: 'Superspeceder Threshold (%)',
    ruleCategory: 'speed',
    thresholdValue: '25.0000',
    weight: null,
    severityFloor: null,
    notes: 'Below 25% of median is physically implausible. Research (PMC11646990) confirms <25% as strong indicator.',
  },
  {
    ruleKey: 'speed_speeder_pct',
    displayName: 'Speeder Threshold (%)',
    ruleCategory: 'speed',
    thresholdValue: '50.0000',
    weight: null,
    severityFloor: null,
    notes: 'Below 50% of median is suspicious but possible for experienced enumerators with cooperative respondents.',
  },
  {
    ruleKey: 'speed_bootstrap_n',
    displayName: 'Speed Bootstrap Minimum Interviews',
    ruleCategory: 'speed',
    thresholdValue: '30.0000',
    weight: null,
    severityFloor: null,
    notes: 'Minimum interviews needed for empirical median. Uses theoretical minimum below this threshold.',
  },
  {
    ruleKey: 'speed_weight',
    displayName: 'Speed Heuristic Weight',
    ruleCategory: 'speed',
    thresholdValue: '25.0000',
    weight: '25.00',
    severityFloor: null,
    notes: 'Component weight in composite score (max 25 points). Strong behavioral evidence of rushing.',
  },

  // ── Straight-lining (5 records) ────────────────────────────────────

  {
    ruleKey: 'straightline_pir_threshold',
    displayName: 'PIR Threshold',
    ruleCategory: 'straightline',
    thresholdValue: '0.8000',
    weight: null,
    severityFloor: null,
    notes: 'Percentage Identical Responses threshold. 80% identical in a battery of 5+ scale questions. Research (PMC8944307).',
  },
  {
    ruleKey: 'straightline_min_battery_size',
    displayName: 'Minimum Battery Size',
    ruleCategory: 'straightline',
    thresholdValue: '5.0000',
    weight: null,
    severityFloor: null,
    notes: 'Minimum questions to constitute a battery for straight-lining analysis. <5 not statistically meaningful.',
  },
  {
    ruleKey: 'straightline_entropy_threshold',
    displayName: 'Shannon Entropy Threshold (bits)',
    ruleCategory: 'straightline',
    thresholdValue: '0.5000',
    weight: null,
    severityFloor: null,
    notes: 'Flag when entropy < 0.5 bits (near-zero diversity). 5-point equal distribution = 2.32 bits; all-same = 0 bits.',
  },
  {
    ruleKey: 'straightline_min_flagged_batteries',
    displayName: 'Minimum Flagged Batteries',
    ruleCategory: 'straightline',
    thresholdValue: '2.0000',
    weight: null,
    severityFloor: null,
    notes: 'Require 2+ flagged batteries for full penalty (20 pts). Single battery = partial (10 pts). Reduces false positives.',
  },
  {
    ruleKey: 'straightline_weight',
    displayName: 'Straight-lining Heuristic Weight',
    ruleCategory: 'straightline',
    thresholdValue: '20.0000',
    weight: '20.00',
    severityFloor: null,
    notes: 'Component weight in composite score (max 20 points). Moderate evidence — could be legitimate uniform opinion.',
  },

  // ── Duplicate Response (4 records) ─────────────────────────────────

  {
    ruleKey: 'duplicate_exact_threshold',
    displayName: 'Exact Duplicate Match Ratio',
    ruleCategory: 'duplicate',
    thresholdValue: '1.0000',
    weight: null,
    severityFloor: null,
    notes: 'Field match ratio for exact duplicate detection. 1.0 = 100% field match → 20 points.',
  },
  {
    ruleKey: 'duplicate_partial_threshold',
    displayName: 'Partial Duplicate Match Ratio',
    ruleCategory: 'duplicate',
    thresholdValue: '0.7000',
    weight: null,
    severityFloor: null,
    notes: 'Field match ratio for partial duplicate detection. >70% field match → 10 points.',
  },
  {
    ruleKey: 'duplicate_lookback_days',
    displayName: 'Duplicate Lookback Window (days)',
    ruleCategory: 'duplicate',
    thresholdValue: '7.0000',
    weight: null,
    severityFloor: null,
    notes: 'Days to look back when comparing submissions for duplicates. Same form only.',
  },
  {
    ruleKey: 'duplicate_weight',
    displayName: 'Duplicate Response Heuristic Weight',
    ruleCategory: 'duplicate',
    thresholdValue: '20.0000',
    weight: '20.00',
    severityFloor: null,
    notes: 'Component weight in composite score (max 20 points). Strong evidence when triggered.',
  },

  // ── Off-Hours Timing (4 records) ─────────────────────────────────

  {
    ruleKey: 'timing_night_start_hour',
    displayName: 'Night Window Start Hour',
    ruleCategory: 'timing',
    thresholdValue: '23.0000',
    weight: null,
    severityFloor: null,
    notes: 'Start of off-hours window (local time, 24h format). Submissions between start and end are flagged. WAT (UTC+1).',
  },
  {
    ruleKey: 'timing_night_end_hour',
    displayName: 'Night Window End Hour',
    ruleCategory: 'timing',
    thresholdValue: '5.0000',
    weight: null,
    severityFloor: null,
    notes: 'End of off-hours window (local time, 24h format). Submissions before this hour in the morning are flagged.',
  },
  {
    ruleKey: 'timing_weekend_penalty',
    displayName: 'Weekend Submission Penalty (points)',
    ruleCategory: 'timing',
    thresholdValue: '5.0000',
    weight: null,
    severityFloor: null,
    notes: 'Points awarded for weekend submissions. Lower than night penalty since weekend fieldwork is common in survey operations.',
  },
  {
    ruleKey: 'timing_weight',
    displayName: 'Off-Hours Timing Heuristic Weight',
    ruleCategory: 'timing',
    thresholdValue: '10.0000',
    weight: '10.00',
    severityFloor: null,
    notes: 'Component weight in composite score (max 10 points). Weakest signal — timing alone is contextual.',
  },

  // ── Composite Severity Cutoffs (4 records) ─────────────────────────

  {
    ruleKey: 'severity_low_min',
    displayName: 'Low Severity Minimum Score',
    ruleCategory: 'composite',
    thresholdValue: '25.0000',
    weight: null,
    severityFloor: 'low',
    notes: 'Scores 25-49 = low severity. Weekly review batch for supervisor.',
  },
  {
    ruleKey: 'severity_medium_min',
    displayName: 'Medium Severity Minimum Score',
    ruleCategory: 'composite',
    thresholdValue: '50.0000',
    weight: null,
    severityFloor: 'medium',
    notes: 'Scores 50-69 = medium severity. Next-day callback/verification. SLA: 24 hours.',
  },
  {
    ruleKey: 'severity_high_min',
    displayName: 'High Severity Minimum Score',
    ruleCategory: 'composite',
    thresholdValue: '70.0000',
    weight: null,
    severityFloor: 'high',
    notes: 'Scores 70-84 = high severity. Immediate notification, hold payment. SLA: 4 hours.',
  },
  {
    ruleKey: 'severity_critical_min',
    displayName: 'Critical Severity Minimum Score',
    ruleCategory: 'composite',
    thresholdValue: '85.0000',
    weight: null,
    severityFloor: 'critical',
    notes: 'Scores 85-100 = critical severity. Auto-quarantine, block enumerator until cleared. Immediate SLA.',
  },
];
