import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasmPlugin from 'vite-plugin-wasm';

const wasm = typeof wasmPlugin === 'function' ? wasmPlugin : (wasmPlugin as any).default;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), typeof wasm === 'function' ? wasm() : undefined].filter(Boolean),
  build: {
    target: 'esnext',
  },
  worker: {
    plugins: () => [typeof wasm === 'function' ? wasm() : undefined].filter(Boolean) as any,
    format: 'es',
  },
});
