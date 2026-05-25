import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    global: "window",
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false, // Keeps your styling neatly organized
    lib: {
      entry: 'src/index.tsx',
      name: 'TerpKanban', // The global IIFE variable
      formats: ['iife'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      // Prevent bundling React; pull it from Hermes instead
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'window.__HERMES_PLUGIN_SDK__.React',
          'react-dom': 'window.__HERMES_PLUGIN_SDK__.ReactDOM'
        },
        // Automatically execute registration when Hermes injects the bundle
        footer: '\nif(window.__HERMES_PLUGINS__) { window.__HERMES_PLUGINS__.register("terp-kanban", TerpKanban.default || TerpKanban); }'
      }
    }
  }
});
