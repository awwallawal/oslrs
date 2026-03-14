/**
 * Policy Brief PDF Service — Story 8.7
 *
 * Generates a branded PDF policy brief using PDFKit.
 * Reuses logo loading pattern from id-card.service.ts.
 * Text-based tables only — no chart images.
 */

import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { SurveyAnalyticsService } from './survey-analytics.service.js';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import type { AnalyticsQueryParams, InferentialInsightsData, ExtendedEquityData, RegistrySummary, DemographicStats, EmploymentStats, SkillsFrequency } from '@oslsr/types';

const logger = pino({ name: 'policy-brief-service' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load logo at module level (same pattern as id-card.service.ts)
let logoBuffer: Buffer | null = null;
try {
  logoBuffer = readFileSync(join(__dirname, '../../assets/oyo-coat-of-arms.png'));
} catch {
  logger.warn('Logo file not found — PDF will be generated without logo');
}

const BRAND_MAROON = '#9C1E23';
const WHITE = '#FFFFFF';
const BODY_TEXT = '#333333';
const HEADING_TEXT = '#1a1a1a';
const LIGHT_GREY = '#f5f5f5';

export class PolicyBriefService {
  static async generatePolicyBrief(
    scope: AnalyticsScope,
    params: AnalyticsQueryParams = {},
  ): Promise<Buffer> {
    // Fetch all needed data (reuse cached where possible)
    const [insights, equity, demographics, employment, registry, skills] = await Promise.all([
      SurveyAnalyticsService.getInferentialInsights(scope, params),
      SurveyAnalyticsService.getExtendedEquity(scope, params),
      SurveyAnalyticsService.getDemographics(scope, params),
      SurveyAnalyticsService.getEmployment(scope, params),
      SurveyAnalyticsService.getRegistrySummary(scope, params),
      SurveyAnalyticsService.getSkillsFrequency(scope, params),
    ]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: 'Labour Market Intelligence Brief',
          Author: 'OSLRS — Oyo State Labour Registration System',
          Creator: 'OSLRS Policy Brief Generator',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: Error) => reject(err));

      const pageWidth = doc.page.width - 100; // 50 margin each side
      const date = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // === PAGE 1: Header + Executive Summary ===
      PolicyBriefService.renderHeader(doc, pageWidth, date);
      PolicyBriefService.renderExecutiveSummary(doc, pageWidth, insights, registry);

      // === PAGE 2: Demographics ===
      doc.addPage();
      PolicyBriefService.renderFooter(doc, 2);
      PolicyBriefService.renderDemographics(doc, pageWidth, demographics, registry);

      // === PAGE 3: Employment & Skills ===
      doc.addPage();
      PolicyBriefService.renderFooter(doc, 3);
      PolicyBriefService.renderEmploymentSkills(doc, pageWidth, employment, skills, equity);

      // === PAGE 4: Inferential Findings ===
      doc.addPage();
      PolicyBriefService.renderFooter(doc, 4);
      PolicyBriefService.renderInferentialFindings(doc, pageWidth, insights);

      // === PAGE 5: Methodology ===
      doc.addPage();
      PolicyBriefService.renderFooter(doc, 5);
      PolicyBriefService.renderMethodology(doc, pageWidth, registry);

      // Footer on page 1
      doc.switchToPage(0);
      PolicyBriefService.renderFooter(doc, 1);

      doc.end();
    });
  }

  private static renderHeader(doc: PDFKit.PDFDocument, pageWidth: number, date: string) {
    // Maroon header bar
    doc.save();
    doc.rect(0, 0, doc.page.width, 90).fill(BRAND_MAROON);

    // Logo
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, 15, { width: 60, height: 60 });
      } catch {
        // Skip logo if it can't be rendered
      }
    }

    // Title
    doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE);
    doc.text('Labour Market Intelligence Brief', logoBuffer ? 120 : 50, 22, {
      width: pageWidth - 80,
    });

    // Subtitle
    doc.font('Helvetica').fontSize(10).fillColor(WHITE);
    doc.text(`Oyo State Labour Registration System — ${date}`, logoBuffer ? 120 : 50, 52);
    doc.restore();

    doc.y = 110;
  }

  private static renderExecutiveSummary(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    insights: InferentialInsightsData,
    registry: RegistrySummary,
  ) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND_MAROON);
    doc.text('Executive Summary', 50, doc.y);
    doc.moveDown(0.5);

    // Generate key findings
    const findings: string[] = [];

    findings.push(
      `A total of ${registry.totalRespondents?.toLocaleString() || 'N/A'} respondents have been registered, ` +
      `with an employment rate of ${registry.employedPct?.toFixed(1) || 'N/A'}%.`,
    );

    const significantChi = insights.chiSquare.filter(r => r.significant);
    if (significantChi.length > 0) {
      findings.push(significantChi[0].interpretation);
    }

    const significantCorr = insights.correlations.filter(r => r.significant);
    if (significantCorr.length > 0) {
      findings.push(significantCorr[0].interpretation);
    }

    if (insights.forecast) {
      findings.push(insights.forecast.interpretation);
    }

    if (insights.proportionCIs.length > 0) {
      findings.push(insights.proportionCIs[0].interpretation);
    }

    doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);
    for (const finding of findings.slice(0, 5)) {
      doc.text(`• ${finding}`, 60, doc.y, { width: pageWidth - 20, indent: 0 });
      doc.moveDown(0.4);
    }
  }

  private static renderDemographics(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    demographics: DemographicStats,
    registry: RegistrySummary,
  ) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND_MAROON);
    doc.text('Demographics Overview', 50, 50);
    doc.moveDown(0.5);

    const rows: [string, string][] = [
      ['Total Respondents', String(registry.totalRespondents?.toLocaleString() || 'N/A')],
      ['Average Age', registry.avgAge ? `${registry.avgAge.toFixed(1)} years` : 'N/A'],
      ['Female Representation', registry.femalePct ? `${registry.femalePct.toFixed(1)}%` : 'N/A'],
    ];

    // Add gender distribution
    if (demographics.genderDistribution) {
      for (const bucket of demographics.genderDistribution) {
        if (bucket.count !== null && !bucket.suppressed) {
          rows.push([`  ${bucket.label}`, `${bucket.count} (${bucket.percentage?.toFixed(1)}%)`]);
        }
      }
    }

    // Add education levels
    rows.push(['', '']);
    rows.push(['Education Distribution', '']);
    if (demographics.educationDistribution) {
      for (const bucket of demographics.educationDistribution.slice(0, 6)) {
        if (bucket.count !== null && !bucket.suppressed) {
          rows.push([`  ${bucket.label}`, `${bucket.count} (${bucket.percentage?.toFixed(1)}%)`]);
        }
      }
    }

    PolicyBriefService.renderTable(doc, pageWidth, rows);
  }

  private static renderEmploymentSkills(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    employment: EmploymentStats,
    skills: SkillsFrequency[],
    equity: ExtendedEquityData,
  ) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND_MAROON);
    doc.text('Employment & Skills', 50, 50);
    doc.moveDown(0.5);

    const rows: [string, string][] = [];

    // Employment breakdown
    if (employment.workStatusBreakdown) {
      for (const bucket of employment.workStatusBreakdown) {
        if (bucket.count !== null && !bucket.suppressed) {
          rows.push([bucket.label, `${bucket.count} (${bucket.percentage?.toFixed(1)}%)`]);
        }
      }
    }

    rows.push(['', '']);

    // Top skills
    rows.push(['Top Skills', '']);
    if (skills) {
      for (const s of skills.slice(0, 10)) {
        rows.push([`  ${s.skill}`, `${s.count} (${s.percentage.toFixed(1)}%)`]);
      }
    }

    // Equity extension
    if (equity.educationAlignment) {
      rows.push(['', '']);
      rows.push(['Education-Employment Alignment', '']);
      rows.push(['  Aligned', `${equity.educationAlignment.alignedPct.toFixed(1)}%`]);
      rows.push(['  Over-qualified', `${equity.educationAlignment.overQualifiedPct.toFixed(1)}%`]);
      rows.push(['  Under-qualified', `${equity.educationAlignment.underQualifiedPct.toFixed(1)}%`]);
    }

    PolicyBriefService.renderTable(doc, pageWidth, rows);
  }

  private static renderInferentialFindings(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    insights: InferentialInsightsData,
  ) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND_MAROON);
    doc.text('Inferential Statistical Findings', 50, 50);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);

    // Significant associations
    const significant = [
      ...insights.chiSquare.filter(r => r.significant),
      ...insights.correlations.filter(r => r.significant),
      ...insights.groupComparisons.filter(r => r.significant),
    ];

    if (significant.length === 0) {
      doc.text('No statistically significant associations were found at the p < 0.05 level.', 50, doc.y, { width: pageWidth });
      doc.moveDown(1);
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_TEXT);
      doc.text('Significant Findings:', 50, doc.y);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);

      for (const finding of significant) {
        doc.text(`• ${finding.interpretation}`, 60, doc.y, { width: pageWidth - 20 });
        doc.moveDown(0.4);
      }
    }

    // Proportion CIs
    if (insights.proportionCIs.length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_TEXT);
      doc.text('Confidence Intervals:', 50, doc.y);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);

      for (const ci of insights.proportionCIs) {
        doc.text(`• ${ci.interpretation}`, 60, doc.y, { width: pageWidth - 20 });
        doc.moveDown(0.3);
      }
    }

    // Forecast
    if (insights.forecast) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(HEADING_TEXT);
      doc.text('Enrollment Forecast:', 50, doc.y);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);
      doc.text(insights.forecast.interpretation, 60, doc.y, { width: pageWidth - 20 });
    }
  }

  private static renderMethodology(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    registry: RegistrySummary,
  ) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND_MAROON);
    doc.text('Methodology', 50, 50);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);

    const methodologyText = [
      `Sample Size: ${registry.totalRespondents?.toLocaleString() || 'N/A'} respondents`,
      'Data Collection: Mixed-method field enumeration and public self-registration via mobile-optimized web forms',
      'Confidence Level: 95% (z = 1.96) for all confidence intervals',
      'Statistical Tests: Chi-square independence tests, Spearman/Pearson correlations, Mann-Whitney U / Kruskal-Wallis H group comparisons, Wilson score proportion CIs',
      'Data Suppression: Cells with fewer than 5 observations are suppressed to protect respondent privacy',
      'Significance Level: α = 0.05 for all hypothesis tests',
      'Geographic Scope: Oyo State, Nigeria (33 Local Government Areas)',
      'Limitations: Self-reported data; non-probability sample (not generalizable to full population without adjustment); income data may be underreported',
    ];

    for (const line of methodologyText) {
      doc.text(`• ${line}`, 60, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.4);
    }
  }

  private static renderFooter(doc: PDFKit.PDFDocument, pageNum: number) {
    const y = doc.page.height - 40;
    doc.save();
    doc.font('Helvetica').fontSize(8).fillColor('#999999');
    doc.text(
      'Generated by OSLRS — Oyo State Labour Registration System',
      50,
      y,
      { width: doc.page.width - 150, align: 'left' },
    );
    doc.text(
      `Page ${pageNum}`,
      0,
      y,
      { width: doc.page.width - 50, align: 'right' },
    );
    doc.restore();
  }

  private static renderTable(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    rows: [string, string][],
  ) {
    const colWidth = pageWidth / 2;
    const startX = 50;

    doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);

    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];

      if (label === '' && value === '') {
        doc.moveDown(0.3);
        continue;
      }

      // Alternate row background
      if (i % 2 === 0 && label && value) {
        doc.save();
        doc.rect(startX - 5, doc.y - 2, pageWidth + 10, 16).fill(LIGHT_GREY);
        doc.restore();
        doc.fillColor(BODY_TEXT);
      }

      // Section heading (value empty)
      if (!value && label) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(HEADING_TEXT);
        doc.text(label, startX, doc.y, { width: pageWidth });
        doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);
        doc.moveDown(0.2);
        continue;
      }

      doc.text(label, startX, doc.y, { width: colWidth, continued: false });
      doc.text(value, startX + colWidth, doc.y - 14, { width: colWidth, align: 'right' });
      doc.moveDown(0.1);
    }
  }
}
