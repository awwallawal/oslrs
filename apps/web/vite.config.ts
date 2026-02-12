import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read version from package.json at build time
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      manifest: false,
      devOptions: { enabled: false },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  envDir: '../../',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    // Inject version at build time - accessible as __APP_VERSION__ in code
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    rollupOptions: {
      output: {
        // Code splitting for large dependencies
        manualChunks: {
          // Face detection library (largest chunk - @vladmandic/human is ~1.5MB)
          'face-detection': ['@vladmandic/human'],
          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI components
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-accordion', '@radix-ui/react-navigation-menu'],
          // Form handling
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Data fetching
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
});
