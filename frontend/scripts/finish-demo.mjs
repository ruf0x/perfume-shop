// After `vite build --mode demo`: removes what belongs to a client (the real logos) so the folder can be given to anyone.
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const out = path.join(import.meta.dirname, '..', 'dist-demo')

await rm(path.join(out, 'brand'), { recursive: true, force: true })
await rm(path.join(out, 'favicon.png'), { force: true })
await rm(path.join(out, '.htaccess'), { force: true }) // the cPanel rewrite rules of a delivered shop, useless on a static host
await rm(path.join(out, 'icons.svg'), { force: true })
// A page that does not exist falls back to the app, on hosts that serve a custom 404 page.
await writeFile(path.join(out, '_redirects'), '/*    /index.html   200\n')
console.log(`Demo site ready in ${out}`)
