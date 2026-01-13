import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

interface TestRecord {
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'running';
  duration?: number;
  error?: string;
  blocking: boolean;
  timestamp: string;
}

const STAGES = ['GoldenPath', 'Security', 'Contract', 'UI', 'Performance'];

export async function generateDashboard(rootDir: string, outputPath: string) {
  // Find all result files
  const files = await glob('.vitest-live-*.json', { cwd: rootDir, absolute: true });
  
  if (files.length === 0) {
    console.warn('No test result files found.');
  }

  const results: TestRecord[] = [];
  
  for (const file of files) {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        results.push(...data);
    } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
    }
  }

  // Deduplicate by name (take latest)
  const uniqueResults = new Map<string, TestRecord>();
  results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  results.forEach(r => uniqueResults.set(r.name, r));
  const finalResults = Array.from(uniqueResults.values());

  const stageStats = STAGES.map(stage => {
    const stageTests = finalResults.filter(t => t.category === stage);
    const passed = stageTests.filter(t => t.status === 'passed').length;
    const failed = stageTests.filter(t => t.status === 'failed').length;
    const blocking = stageTests.some(t => t.blocking);
    return { stage, total: stageTests.length, passed, failed, blocking };
  });

  const flowLines = STAGES.slice(0, -1).map((stage, i) => {
    const current = stageStats.find(s => s.stage === stage);
    const blocking = current?.blocking ?? true;
    return `${stage} -->|${blocking ? 'blocking' : 'non-blocking'}| ${STAGES[i + 1]}`;
  }).join('\n  ');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>OSLSR Test Pipeline Dashboard</title>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true });
</script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; background: #f9fafb; color: #1f2937; }
  .container { max-width: 1000px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h1 { font-size: 24px; margin-bottom: 24px; color: #9c1e23; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
  th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f4f6; font-weight: 600; }
  .status-passed { color: #059669; font-weight: 600; }
  .status-failed { color: #dc2626; font-weight: 600; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
  .tag-blocking { background: #fee2e2; color: #991b1b; }
  .tag-optional { background: #dcfce7; color: #166534; }
  .mermaid { display: flex; justify-content: center; margin-top: 20px; }
  .footer { margin-top: 20px; font-size: 12px; color: #6b7280; text-align: right; }
</style>
</head>
<body>
<div class="container">
  <h1>OSLSR Test Pipeline Dashboard</h1>
  
  <table>
    <thead>
      <tr>
        <th>Stage</th>
        <th>Total</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      ${stageStats.map(s => `
        <tr>
          <td><strong>${s.stage}</strong></td>
          <td>${s.total}</td>
          <td class="status-passed">${s.passed}</td>
          <td class="status-failed">${s.failed}</td>
          <td><span class="tag ${s.blocking ? 'tag-blocking' : 'tag-optional'}">${s.blocking ? 'BLOCKING' : 'OPTIONAL'}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

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
  
  <div class="footer">
    Generated at ${new Date().toLocaleString()} from ${files.length} report files.
  </div>
</div>
</body>
</html>
`;

  fs.writeFileSync(outputPath, html);
  console.log(`Dashboard generated at: ${outputPath}`);
}
