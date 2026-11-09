import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** The static demo site (`vite build --mode demo`) carries a neutral name and icon, never a client's. */
const demoHtml = (): Plugin => ({
  name: 'demo-html',
  // The French dictionary carries the delivered shop's name as a fallback: the demo's own replaces it in the bundle.
  transform: (code, id) => (id.split('\\').join('/').endsWith('/i18n/fr.json') ? code.replace('Roze Sham', 'Parfumerie Démo') : null),
  transformIndexHtml: (html) =>
    html.replace('<title>Roze Sham</title>', '<title>Parfumerie Démo</title>').replace('<link rel="icon" type="image/png" href="/favicon.png" />', '<link rel="icon" type="image/svg+xml" href="./brand-demo/favicon.svg" />'),
})

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'

  return {
    // Relative addresses: the demo works from the root of a free host or from a sub-folder (GitHub Pages).
    base: demo ? './' : '/',
    // A constant either way, so the normal build drops every bit of the demo.
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? 'true' : 'false') },
    plugins: [react(), tailwindcss(), ...(demo ? [demoHtml()] : [])],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    build: demo ? { outDir: 'dist-demo', emptyOutDir: true } : {},
    server: {
      open: true,
      port: 3000,
    },
  }
})
