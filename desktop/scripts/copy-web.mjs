// Builds the website's admin (the React app) and copies it into desktop/web, where the app serves it from.
// The same build also runs on the website: the app is recognised at run time (window.desktop), so nothing differs.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = join(here, '..', '..', 'frontend')
const target = join(here, '..', 'web')

if (!existsSync(join(frontend, 'node_modules'))) {
  console.log('Installing the frontend packages…')
  execSync('npm ci', { cwd: frontend, stdio: 'inherit' })
}

console.log('Building the admin…')
// The website address is unused in the app (it uses the server chosen on first launch); any value will do.
execSync('npm run build', { cwd: frontend, stdio: 'inherit', env: { ...process.env, VITE_API_URL: 'https://desktop.invalid' } })

rmSync(target, { recursive: true, force: true })
cpSync(join(frontend, 'dist'), target, { recursive: true })
console.log(`Copied to ${target}`)
