import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
const botUrl = process.env.CARDROOM_BOT_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  envDir: '..',
  build: {
    rolldownOptions: {
      input: ['index.html', 'privacy/index.html', 'terms/index.html'].map(
        (page) => fileURLToPath(new URL(page, import.meta.url)),
      ),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  define: {
    __SPACETIMEDB_HOST__: JSON.stringify(host),
    __SPACETIMEDB_DB__: JSON.stringify(database),
    __CARDROOM_BOT_URL__: JSON.stringify(botUrl),
  },
});
