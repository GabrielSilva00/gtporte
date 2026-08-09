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
