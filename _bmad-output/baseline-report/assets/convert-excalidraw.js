#!/usr/bin/env node
/**
 * Excalidraw JSON → SVG converter for the Chemiroy Document Design System.
 *
 * Targets diagrams authored with `roughness: 0` (clean lines, not sketchy),
 * which is the convention in `_bmad-output/baseline-report/diagrams/`.
 *
 * Supported elements:
 *   - rectangle / ellipse / diamond
 *   - line / arrow (polyline; arrowhead via SVG marker)
 *   - text (with multi-line, alignment, vertical-align, rotation)
 *   - freedraw (smoothed polyline)
 *
 * Unsupported (intentionally omitted; not used in the 16 baseline diagrams):
 *   - hachure / cross-hatch fills (would need RoughJS)
 *   - sketchy/rough rendering
 *   - embedded images, frames
 *
 * Usage:
 *   node convert-excalidraw.js                  # convert all .excalidraw in diagrams/
 *   node convert-excalidraw.js path/to/one.excalidraw
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─────────────────── Helpers ───────────────────

function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function strokeDashArray(strokeStyle, strokeWidth) {
  const sw = strokeWidth || 1;
  if (strokeStyle === 'dashed') return `${sw * 4},${sw * 2}`;
  if (strokeStyle === 'dotted') return `${sw},${sw * 1.5}`;
  return null;
}

function rotationTransform(el) {
  if (!el.angle) return '';
  const cx = el.x + (el.width || 0) / 2;
  const cy = el.y + (el.height || 0) / 2;
  const deg = (el.angle * 180) / Math.PI;
  return ` transform="rotate(${deg.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"`;
}

function commonAttrs(el) {
  const stroke = el.strokeColor || '#1e1e1e';
  const fill = el.backgroundColor && el.backgroundColor !== 'transparent'
    ? el.backgroundColor : 'none';
  const sw = el.strokeWidth || 1;
  const opacity = (el.opacity ?? 100) / 100;
  const dash = strokeDashArray(el.strokeStyle, sw);
  return {
    stroke, fill, sw, opacity,
    dashAttr: dash ? ` stroke-dasharray="${dash}"` : '',
  };
}

// Excalidraw font index → web font stack
const FONT_FAMILIES = {
  1: '"Inter", "Segoe UI", -apple-system, sans-serif',
  2: '"Inter", "Segoe UI", -apple-system, sans-serif',
  3: '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
  4: '"Inter", "Segoe UI", -apple-system, sans-serif',
  5: '"Inter", "Segoe UI", -apple-system, sans-serif',
};

// ─────────────────── Element renderers ───────────────────

function renderRectangle(el) {
  const { stroke, fill, sw, opacity, dashAttr } = commonAttrs(el);
  // Excalidraw roundness — when present, render with proportional radius
  const r = el.roundness ? Math.min(el.width, el.height) * 0.08 : 0;
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${r}" ry="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${dashAttr}${rotationTransform(el)}/>`;
}

function renderEllipse(el) {
  const { stroke, fill, sw, opacity, dashAttr } = commonAttrs(el);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${dashAttr}${rotationTransform(el)}/>`;
}

function renderDiamond(el) {
  const { stroke, fill, sw, opacity, dashAttr } = commonAttrs(el);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${dashAttr}${rotationTransform(el)}/>`;
}

function renderLineOrArrow(el) {
  const { stroke, sw, opacity, dashAttr } = commonAttrs(el);
  const pts = (el.points || []).map(([px, py]) =>
    `${(el.x + px).toFixed(2)},${(el.y + py).toFixed(2)}`
  ).join(' ');
  const isArrow = el.type === 'arrow';
  const markerEnd = isArrow ? ' marker-end="url(#arrowhead)"' : '';
  // color attribute propagates to marker fill (which uses context-stroke / currentColor)
  const colorAttr = isArrow ? ` color="${stroke}"` : '';
  return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${markerEnd}${colorAttr}${rotationTransform(el)}/>`;
}

function renderFreedraw(el) {
  const { stroke, sw, opacity } = commonAttrs(el);
  const pts = (el.points || []).map(([px, py]) =>
    `${(el.x + px).toFixed(2)},${(el.y + py).toFixed(2)}`
  ).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${rotationTransform(el)}/>`;
}

function renderText(el) {
  // Skip the "Figure X.Y: ..." titles inside Excalidraw scenes — the
  // build.js renderer auto-emits the figure caption, so an embedded title
  // inside the SVG would duplicate it.
  if (/^Figure\s+\d+\.\d+:/i.test(el.text || '')) return '';

  const { stroke, opacity } = commonAttrs(el);
  const fontFamily = FONT_FAMILIES[el.fontFamily] || FONT_FAMILIES[2];
  const fontSize = el.fontSize || 16;
  const lineHeight = el.lineHeight || 1.25;
  const fontWeight = el.fontWeight || 400;
  const lines = (el.text || '').split('\n');

  let textAnchor = 'start';
  let textX = el.x;
  if (el.textAlign === 'center') {
    textAnchor = 'middle';
    textX = el.x + el.width / 2;
  } else if (el.textAlign === 'right') {
    textAnchor = 'end';
    textX = el.x + el.width;
  }

  // Excalidraw stores y at the top-left of the text bounding box.
  // SVG dominant-baseline="hanging" aligns y to the top of the glyph cap.
  let dominantBaseline = 'hanging';
  let textY = el.y;
  if (el.verticalAlign === 'middle') {
    dominantBaseline = 'middle';
    const totalH = lines.length * fontSize * lineHeight;
    textY = el.y + el.height / 2 - totalH / 2 + fontSize * lineHeight / 2;
  } else if (el.verticalAlign === 'bottom') {
    dominantBaseline = 'alphabetic';
    textY = el.y + el.height;
  }

  const tspans = lines.map((line, i) =>
    `<tspan x="${textX}" dy="${i === 0 ? 0 : fontSize * lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');

  return `<text x="${textX}" y="${textY}" fill="${stroke}" font-family='${fontFamily}' font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}" opacity="${opacity}"${rotationTransform(el)}>${tspans}</text>`;
}

function renderElement(el) {
  if (el.isDeleted) return '';
  switch (el.type) {
    case 'rectangle': return renderRectangle(el);
    case 'ellipse': return renderEllipse(el);
    case 'diamond': return renderDiamond(el);
    case 'line':
    case 'arrow': return renderLineOrArrow(el);
    case 'freedraw': return renderFreedraw(el);
    case 'text': return renderText(el);
    default: return `<!-- unsupported element type: ${el.type} -->`;
  }
}

// ─────────────────── Bounding box ───────────────────

function calcBoundingBox(elements) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw') {
      for (const [px, py] of (el.points || [])) {
        minX = Math.min(minX, el.x + px);
        minY = Math.min(minY, el.y + py);
        maxX = Math.max(maxX, el.x + px);
        maxY = Math.max(maxY, el.y + py);
      }
    } else {
      const w = el.width || 0;
      const h = el.height || 0;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w);
      maxY = Math.max(maxY, el.y + h);
    }
  }
  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return { minX, minY, maxX, maxY };
}

// ─────────────────── Convert one file ───────────────────

function convert(jsonPath, svgPath) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const elements = data.elements || [];
  const bbox = calcBoundingBox(elements);
  const padding = 24;
  const viewX = bbox.minX - padding;
  const viewY = bbox.minY - padding;
  const viewW = (bbox.maxX - bbox.minX) + 2 * padding;
  const viewH = (bbox.maxY - bbox.minY) + 2 * padding;

  // Marker for arrowheads. Uses context-stroke so the arrowhead colour
  // matches the line's stroke colour automatically.
  const arrowheadDef = `<defs>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>
    </marker>
  </defs>`;

  const body = elements.map(renderElement).filter(Boolean).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX.toFixed(2)} ${viewY.toFixed(2)} ${viewW.toFixed(2)} ${viewH.toFixed(2)}" preserveAspectRatio="xMidYMid meet">
  ${arrowheadDef}
  <rect x="${viewX.toFixed(2)}" y="${viewY.toFixed(2)}" width="${viewW.toFixed(2)}" height="${viewH.toFixed(2)}" fill="white"/>
  ${body}
</svg>
`;

  writeFileSync(svgPath, svg, 'utf-8');
  return svg.length;
}

// ─────────────────── Main ───────────────────

const arg = process.argv[2];
const diagramsDir = join(__dirname, '..', 'diagrams');

if (arg) {
  const out = arg.replace(/\.excalidraw$/i, '.svg');
  const size = convert(arg, out);
  console.log(`✓ ${basename(arg)} → ${basename(out)} (${size} bytes)`);
} else {
  const files = readdirSync(diagramsDir).filter(f => f.endsWith('.excalidraw'));
  let totalIn = 0, totalOut = 0, ok = 0, fail = 0;
  for (const f of files) {
    const jsonPath = join(diagramsDir, f);
    const svgPath = join(diagramsDir, f.replace(/\.excalidraw$/i, '.svg'));
    try {
      const size = convert(jsonPath, svgPath);
      totalOut += size;
      ok += 1;
      console.log(`✓ ${f.padEnd(45)} ${size.toString().padStart(7)} bytes`);
    } catch (e) {
      fail += 1;
      console.error(`✗ ${f}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
}
