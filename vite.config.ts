/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
  // O app do motorista tem o proprio vitest e a propria config de alias;
  // sem este exclude os testes dele rodariam duas vezes, aqui e la.
  test: { exclude: ['**/node_modules/**', 'motorista-app/**'] },
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas de exportação só são usadas na tela de Relatórios
        manualChunks: {
          exportacao: ['jspdf', 'jspdf-autotable', 'xlsx'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
})
