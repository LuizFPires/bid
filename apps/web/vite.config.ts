import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Carimbo do build: aparece no menu de perfil para o usuário saber qual versão está rodando.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  // .env fica na raiz do monorepo (um só para todo o projeto).
  envDir: '../..',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'brand/bid-icone-app.svg',
        'brand/bid-icone-32.png',
        'brand/bid-icone-180.png',
        'brand/bid-icone-192.png',
        'brand/bid-icone-512.png',
      ],
      manifest: {
        name: 'bid',
        short_name: 'bid',
        description: 'Propostas, equalização e contratos de obra',
        lang: 'pt-BR',
        theme_color: '#7D8CF5',
        background_color: '#F3F4F6',
        display: 'standalone',
        orientation: 'portrait',
        // Ícone com fundo quadrado opaco (o sistema aplica a máscara).
        icons: [
          { src: 'brand/bid-icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/bid-icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'brand/bid-icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'brand/bid-icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'brand/bid-icone-app.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
