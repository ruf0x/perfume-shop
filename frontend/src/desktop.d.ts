/** What the Electron preload script exposes to the page (see desktop/src/preload.js). Absent on the website. */
interface DesktopBridge {
  /** The server this app was set up with, e.g. https://api.votre-domaine.com (no trailing slash). */
  apiUrl: string
  version: string
  /** The sign-in token, kept encrypted by the operating system. */
  getToken(): Promise<string | null>
  /** Save the token after signing in; `null` forgets it (sign out). */
  setToken(token: string | null): Promise<void>
  /** Check that an address answers like our server. */
  testServer(url: string): Promise<{ ok: boolean; error?: string }>
  /** Save the server address and open the admin. */
  setServer(url: string): Promise<{ ok: boolean; error?: string }>
  /** Forget the server and go back to the set-up screen. */
  changeServer(): Promise<void>
}

interface Window {
  desktop?: DesktopBridge
}
