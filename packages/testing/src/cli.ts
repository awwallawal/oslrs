#!/usr/bin/env node
import { generateDashboard } from './dashboard.js';
import path from 'path';

const rootDir = process.cwd();
const outputPath = path.resolve(rootDir, 'test-pipeline.html');

generateDashboard(rootDir, outputPath);
