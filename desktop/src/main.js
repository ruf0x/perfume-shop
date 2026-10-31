'use strict'

/**
 * The shop's admin as a desktop app.
 *
 * - The admin screens are the website's own React app, built once and shipped inside the app (`web/`), served
 *   through a private `app://local` address. It talks to the shop's server (the address is asked on first launch).
 * - It signs in with a token (not a cookie). The token is kept encrypted by the operating system (Windows DPAPI).
 * - The page gets a tiny bridge (`window.desktop`, see preload.js) and no access to Node.
 */

const { app, BrowserWindow, Menu, ipcMain, net, protocol, safeStorage, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const config = readJson(path.join(app.getAppPath(), 'app.config.json')) ?? {}
const PRODUCT = config.productName || 'Administration Boutique'
const ORIGIN = 'app://local'

// Tests and a second shop on the same computer can keep their data elsewhere.
if (process.env.SHOP_DESKTOP_DATA) app.setPath('userData', process.env.SHOP_DESKTOP_DATA)

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === null)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(start)
  app.on('window-all-closed', () => app.quit())
}

// ── files in the user's data folder ─────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')
const tokenFile = () => path.join(app.getPath('userData'), 'token.bin')

/** The server address: set by the user, else the one shipped with the app, else asked on first launch. */
function apiUrl() {
  return process.env.SHOP_API_URL || readJson(settingsFile())?.apiUrl || config.apiUrl || ''
}

function saveApiUrl(url) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify({ apiUrl: url }, null, 2))
}

/** Memory fallback when the system cannot encrypt: the user then signs in again at every launch. */
let memoryToken = null

function readToken() {
  if (!safeStorage.isEncryptionAvailable()) return memoryToken
  try {
    return safeStorage.decryptString(fs.readFileSync(tokenFile()))
  } catch {
    return null
  }
}

function writeToken(token) {
  if (!token) {
    memoryToken = null
    fs.rmSync(tokenFile(), { force: true })

    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    memoryToken = token

    return
  }
  fs.mkdirSync(path.dirname(tokenFile()), { recursive: true })
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token))
}

// ── server address ──────────────────────────────────────────────────────

/** https only (a shop's server must be encrypted); plain http is accepted for this computer, to try things out. */
function normalizeServer(input) {
  let url
  try {
    url = new URL(String(input).trim())
  } catch {
    return null
  }
  const here = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && here)) return null

  return url.origin
}

/** Does this address answer like our server? */
async function testServer(input) {
  const origin = normalizeServer(input)
  if (!origin) return { ok: false, error: "Adresse invalide. Écrivez-la en commençant par https://, par exemple https://api.votre-boutique.com" }

  try {
    const res = await net.fetch(`${origin}/api/ping`, { signal: AbortSignal.timeout(8000) })
    const body = await res.json().catch(() => null)
    if (res.ok && body?.pong === true) return { ok: true, origin }

    return { ok: false, error: "Cette adresse répond, mais ce n'est pas le serveur de la boutique." }
  } catch {
    return { ok: false, error: 'Impossible de joindre ce serveur. Vérifiez l\'adresse et votre connexion internet.' }
  }
}

// ── the private app:// address ──────────────────────────────────────────

const WEB = path.join(app.getAppPath(), 'web')
const UI = path.join(app.getAppPath(), 'src', 'ui')

/** Serve the admin build, with index.html for every unknown path (the admin is a single-page app). */
function serve(request) {
  const { pathname } = new URL(request.url)
  const relative = decodeURIComponent(pathname)
  const isUi = relative.startsWith('/__desktop/')
  const root = isUi ? UI : WEB
  let file = path.normalize(path.join(root, isUi ? relative.slice('/__desktop/'.length) : relative))

  if (!file.startsWith(root)) return new Response('Interdit', { status: 403 })
  if (!isUi && (!fs.existsSync(file) || fs.statSync(file).isDirectory())) file = path.join(WEB, 'index.html')
  if (isUi && !fs.existsSync(file)) return new Response('Introuvable', { status: 404 })

  return net.fetch(pathToFileURL(file).toString())
}

// ── window ──────────────────────────────────────────────────────────────

let mainWindow = null

function openFirstScreen() {
  mainWindow?.loadURL(apiUrl() ? `${ORIGIN}/admin` : `${ORIGIN}/__desktop/setup.html`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: PRODUCT,
    backgroundColor: '#fdf5f3',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  // The page names itself after the shop; the window says it is the admin.
  mainWindow.on('page-title-updated', (event, title) => {
    event.preventDefault()
    mainWindow.setTitle(title.includes('Administration') ? title : `${title} – Administration`)
  })
  mainWindow.on('closed', () => (mainWindow = null))
  guard(mainWindow.webContents)
  openFirstScreen()
}

/** The page may open ticket windows (about:blank) and links to the web; it can never leave the app. */
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith(`${ORIGIN}/`)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 820, height: 920, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } }
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url)

    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  contents.on('did-create-window', (child) => guard(child.webContents))
}

function buildMenu() {
  const dev = !app.isPackaged
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Fichier',
        submenu: [
          { label: 'Changer de serveur…', click: forgetServer },
          { type: 'separator' },
          { label: 'Quitter', accelerator: 'Alt+F4', role: 'quit' },
        ],
      },
      { label: 'Édition', submenu: [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' }, { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }] },
      {
        label: 'Affichage',
        submenu: [
          { role: 'reload', label: 'Actualiser' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Zoom normal' },
          { role: 'zoomIn', label: 'Agrandir' },
          { role: 'zoomOut', label: 'Réduire' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Plein écran' },
          ...(dev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' }] : []),
        ],
      },
      { label: 'Aide', submenu: [{ label: `${PRODUCT} version ${app.getVersion()}`, enabled: false }] },
    ]),
  )
}

/** Forget the server and the sign-in, back to the set-up screen. */
function forgetServer() {
  fs.rmSync(settingsFile(), { force: true })
  writeToken(null)
  mainWindow?.loadURL(`${ORIGIN}/__desktop/setup.html`)
}

// ── bridge for the page (only our own pages may call it) ────────────────

const trusted = (event) => event.senderFrame?.url?.startsWith(`${ORIGIN}/`) === true

function bridge() {
  ipcMain.on('desktop:settings', (event) => {
    event.returnValue = trusted(event) ? { apiUrl: apiUrl(), version: app.getVersion(), productName: PRODUCT } : { apiUrl: '', version: '', productName: '' }
  })
  ipcMain.handle('desktop:get-token', (event) => (trusted(event) ? readToken() : null))
  ipcMain.handle('desktop:set-token', (event, token) => {
    if (trusted(event)) writeToken(typeof token === 'string' && token.length > 0 ? token : null)
  })
  ipcMain.handle('desktop:test-server', (event, url) => (trusted(event) ? testServer(url) : { ok: false, error: 'Interdit.' }))
  ipcMain.handle('desktop:set-server', async (event, url) => {
    if (!trusted(event)) return { ok: false, error: 'Interdit.' }

    const result = await testServer(url)
    if (!result.ok) return result

    saveApiUrl(result.origin)
    writeToken(null)
    mainWindow?.loadURL(`${ORIGIN}/admin`)

    return { ok: true }
  })
  ipcMain.handle('desktop:change-server', (event) => {
    if (trusted(event)) forgetServer()
  })
}

function start() {
  protocol.handle('app', serve)
  bridge()
  buildMenu()
  createWindow()
}
