// Recent npm versions may skip Electron's own install step, which downloads the program itself.
// This makes sure it is there before starting or packaging.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electron = join(root, 'node_modules', 'electron')

if (!existsSync(join(electron, 'path.txt')) || !existsSync(join(electron, 'dist'))) {
  console.log('Downloading Electron…')
  execFileSync(process.execPath, [join(electron, 'install.js')], { stdio: 'inherit' })
}
