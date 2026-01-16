import fs from 'fs';
import { mergeTestResults, TestResult, MergedResults } from './merger.js';

export type { TestResult } from './merger.js';

export interface DashboardOptions {
  noCleanup?: boolean;
}

const STAGES = ['GoldenPath', 'Security', 'Contract', 'UI', 'Performance'];

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Generate the test pipeline dashboard HTML.
 */
export async function generateDashboard(
  rootDir: string,
  outputPath: string,
  options: DashboardOptions = {}
): Promise<void> {
  // Use merger to get consolidated results
  const mergedData = await mergeTestResults(rootDir, { saveConsolidated: true });
  const finalResults = mergedData.tests;

  // Calculate summary stats
  const totalTests = finalResults.length;
  const passedTests = finalResults.filter(t => t.status === 'passed').length;
  const failedTests = finalResults.filter(t => t.status === 'failed').length;
  const skippedTests = finalResults.filter(t => t.status === 'skipped').length;

  // Calculate stage stats
  const stageStats = STAGES.map(stage => {
    const stageTests = finalResults.filter(t => t.category === stage);
    const passed = stageTests.filter(t => t.status === 'passed').length;
    const failed = stageTests.filter(t => t.status === 'failed').length;
    const skipped = stageTests.filter(t => t.status === 'skipped').length;
    const blocking = stageTests.some(t => t.blocking);
    const totalDuration = stageTests.reduce((sum, t) => sum + (t.duration || 0), 0);
    return { stage, total: stageTests.length, passed, failed, skipped, blocking, totalDuration };
  });

  // Calculate package stats
  const packages = [...new Set(finalResults.map(t => t.package).filter(Boolean))] as string[];
  const packageStats = packages.map(pkg => {
    const pkgTests = finalResults.filter(t => t.package === pkg);
    const passed = pkgTests.filter(t => t.status === 'passed').length;
    const failed = pkgTests.filter(t => t.status === 'failed').length;
    const totalDuration = pkgTests.reduce((sum, t) => sum + (t.duration || 0), 0);
    const avgDuration = pkgTests.length > 0 ? totalDuration / pkgTests.length : 0;
    return { package: pkg, total: pkgTests.length, passed, failed, totalDuration, avgDuration };
  });

  // Get all unique tags
  const allTags = [...new Set(finalResults.flatMap(t => t.tags || []))];

  // Calculate performance metrics
  const totalDuration = finalResults.reduce((sum, t) => sum + (t.duration || 0), 0);
  const slowestTests = [...finalResults]
    .filter(t => t.duration !== undefined)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 10);

  // Get failed tests with error details
  const failedTestDetails = finalResults.filter(t => t.status === 'failed');

  // Generate Mermaid flow diagram
  const flowLines = STAGES.slice(0, -1).map((stage, i) => {
    const current = stageStats.find(s => s.stage === stage);
    const blocking = current?.blocking ?? true;
    return `${stage} -->|${blocking ? 'blocking' : 'non-blocking'}| ${STAGES[i + 1]}`;
  }).join('\n      ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSLSR Test Pipeline Dashboard</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true });
  </script>
  <style>
    :root {
      --primary: #9c1e23;
      --success: #059669;
      --danger: #dc2626;
      --warning: #d97706;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-500: #6b7280;
      --gray-700: #374151;
      --gray-900: #1f2937;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 20px;
      background: var(--gray-50);
      color: var(--gray-900);
      line-height: 1.5;
      margin: 0;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 { font-size: 24px; margin: 0 0 24px 0; color: var(--primary); }
    h2 { font-size: 18px; margin: 32px 0 16px 0; color: var(--gray-700); border-bottom: 1px solid var(--gray-200); padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 24px 0 12px 0; color: var(--gray-700); }

    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: var(--gray-50);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card .value { font-size: 32px; font-weight: 700; }
    .summary-card .label { font-size: 12px; color: var(--gray-500); text-transform: uppercase; }
    .summary-card.passed .value { color: var(--success); }
    .summary-card.failed .value { color: var(--danger); }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--gray-200); }
    th { background: var(--gray-100); font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--gray-500); }
    .status-passed { color: var(--success); font-weight: 600; }
    .status-failed { color: var(--danger); font-weight: 600; }
    .status-skipped { color: var(--warning); }

    /* Tags */
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 500;
      margin: 2px;
    }
    .tag-blocking { background: #fee2e2; color: #991b1b; }
    .tag-optional { background: #dcfce7; color: #166534; }
    .tag-category { background: #dbeafe; color: #1e40af; }
    .tag-filter { cursor: pointer; transition: opacity 0.2s; }
    .tag-filter:hover { opacity: 0.8; }
    .tag-filter.active { box-shadow: 0 0 0 2px var(--primary); }

    /* Filter Section */
    .filter-section {
      background: var(--gray-50);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .filter-label { font-size: 12px; font-weight: 600; color: var(--gray-500); margin-bottom: 8px; }

    /* Error Details */
    .error-card {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .error-card .test-name { font-weight: 600; color: var(--danger); margin-bottom: 8px; }
    .error-card .file-path { font-size: 12px; color: var(--gray-500); margin-bottom: 8px; font-family: monospace; }
    .error-card .error-message { font-family: monospace; font-size: 13px; background: white; padding: 12px; border-radius: 4px; overflow-x: auto; }
    .error-card .stack-trace {
      font-family: monospace;
      font-size: 11px;
      background: #1f2937;
      color: #e5e7eb;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin-top: 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .error-toggle { cursor: pointer; color: var(--primary); font-size: 12px; }

    /* Performance */
    .perf-bar {
      background: var(--gray-200);
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    .perf-bar-fill { background: var(--primary); height: 100%; }

    /* Mermaid */
    .mermaid { display: flex; justify-content: center; margin: 20px 0; }

    /* Footer */
    .footer { margin-top: 32px; font-size: 12px; color: var(--gray-500); text-align: right; }

    /* Test List */
    .test-row { cursor: pointer; }
    .test-row:hover { background: var(--gray-50); }
    .test-row.hidden { display: none; }

    /* Responsive */
    @media (max-width: 768px) {
      body { padding: 10px; }
      .container { padding: 16px; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      th, td { padding: 8px; font-size: 14px; }
    }
  </style>
</head>
<body>
<div class="container">
  <h1>OSLSR Test Pipeline Dashboard</h1>

  <!-- Summary Cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${totalTests}</div>
      <div class="label">Total Tests</div>
    </div>
    <div class="summary-card passed">
      <div class="value">${passedTests}</div>
      <div class="label">Passed</div>
    </div>
    <div class="summary-card failed">
      <div class="value">${failedTests}</div>
      <div class="label">Failed</div>
    </div>
    <div class="summary-card">
      <div class="value">${skippedTests}</div>
      <div class="label">Skipped</div>
    </div>
    <div class="summary-card">
      <div class="value">${formatDuration(totalDuration)}</div>
      <div class="label">Total Duration</div>
    </div>
  </div>

  ${totalTests === 0 ? '<p>No tests found. Run your test suite first.</p>' : ''}

  <!-- Filter Section -->
  ${allTags.length > 0 ? `
  <div class="filter-section">
    <div class="filter-label">Filter by Tag</div>
    <div id="tag-filters">
      <span class="tag tag-category tag-filter active" data-tag="all">All</span>
      ${allTags.map(tag => `<span class="tag tag-category tag-filter" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
    </div>
  </div>
  ` : ''}

  <!-- Stage Stats -->
  <h2>Tests by Stage</h2>
  <table>
    <thead>
      <tr>
        <th>Stage</th>
        <th>Total</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Duration</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      ${stageStats.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.stage)}</strong></td>
          <td>${s.total}</td>
          <td class="status-passed">${s.passed}</td>
          <td class="status-failed">${s.failed}</td>
          <td>${formatDuration(s.totalDuration)}</td>
          <td><span class="tag ${s.blocking ? 'tag-blocking' : 'tag-optional'}">${s.blocking ? 'BLOCKING' : 'OPTIONAL'}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Package Stats -->
  ${packageStats.length > 0 ? `
  <h2>Tests by Package</h2>
  <table>
    <thead>
      <tr>
        <th>Package</th>
        <th>Total</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Avg Duration</th>
      </tr>
    </thead>
    <tbody>
      ${packageStats.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.package)}</strong></td>
          <td>${p.total}</td>
          <td class="status-passed">${p.passed}</td>
          <td class="status-failed">${p.failed}</td>
          <td>${formatDuration(p.avgDuration)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <!-- Pipeline Visualization -->
  <h2>Pipeline Visualization</h2>
  <div class="mermaid">
    flowchart TD
      ${flowLines}

      ${stageStats.map(s => {
        const color = s.failed > 0 ? '#fee2e2' : s.passed > 0 ? '#dcfce7' : '#f3f4f6';
        const stroke = s.failed > 0 ? '#dc2626' : s.passed > 0 ? '#059669' : '#d1d5db';
        return `style ${s.stage} fill:${color},stroke:${stroke},stroke-width:2px`;
      }).join('\n      ')}
  </div>

  <!-- Performance Metrics -->
  ${slowestTests.length > 0 ? `
  <h2>Slowest Tests (Top 10)</h2>
  <table>
    <thead>
      <tr>
        <th>Test Name</th>
        <th>Duration</th>
        <th>Package</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${slowestTests.map((t, i) => {
        const maxDuration = slowestTests[0]?.duration || 1;
        const percentage = ((t.duration || 0) / maxDuration) * 100;
        return `
        <tr>
          <td>${escapeHtml(t.name)}</td>
          <td>${formatDuration(t.duration)}</td>
          <td>${escapeHtml(t.package || '-')}</td>
          <td style="width: 100px;">
            <div class="perf-bar"><div class="perf-bar-fill" style="width: ${percentage}%"></div></div>
          </td>
        </tr>
      `}).join('')}
    </tbody>
  </table>
  ` : ''}

  <!-- Failed Tests with Error Details -->
  ${failedTestDetails.length > 0 ? `
  <h2>Failed Tests</h2>
  ${failedTestDetails.map(t => `
    <div class="error-card">
      <div class="test-name">${escapeHtml(t.name)}</div>
      ${t.file ? `<div class="file-path">${escapeHtml(t.file)}${t.line ? `:${t.line}` : ''}</div>` : ''}
      ${t.error ? `<div class="error-message">${escapeHtml(t.error)}</div>` : ''}
      ${t.stackTrace ? `
        <div class="error-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
          Toggle Stack Trace
        </div>
        <div class="stack-trace" style="display: none;">${escapeHtml(t.stackTrace)}</div>
      ` : ''}
    </div>
  `).join('')}
  ` : ''}

  <!-- All Tests List -->
  <h2>All Tests</h2>
  <table id="tests-table">
    <thead>
      <tr>
        <th>Test Name</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Tags</th>
      </tr>
    </thead>
    <tbody>
      ${finalResults.map(t => `
        <tr class="test-row" data-tags="${escapeHtml((t.tags || []).join(','))}">
          <td>${escapeHtml(t.name)}</td>
          <td class="status-${t.status}">${t.status}</td>
          <td>${formatDuration(t.duration)}</td>
          <td>${(t.tags || []).map(tag => `<span class="tag tag-category">${escapeHtml(tag)}</span>`).join('')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated at ${new Date().toLocaleString()} from ${mergedData.fileCount} report files.
  </div>
</div>

<script>
  // Tag filtering
  document.querySelectorAll('.tag-filter').forEach(tag => {
    tag.addEventListener('click', function() {
      const selectedTag = this.dataset.tag;

      // Update active state
      document.querySelectorAll('.tag-filter').forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      // Filter tests
      document.querySelectorAll('.test-row').forEach(row => {
        const tags = row.dataset.tags.split(',');
        if (selectedTag === 'all' || tags.includes(selectedTag)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    });
  });
</script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log(`Dashboard generated at: ${outputPath}`);
}
