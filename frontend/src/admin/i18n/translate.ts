import { AR, AR_PATTERNS } from './ar'
import { getLang, isRtl } from './lang'

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE'])

const norm = (s: string) => s.replace(/’/g, "'")

/** Translates one text (without its surrounding spaces); unknown texts are returned as they are. */
function translateCore(core: string): string {
  const key = norm(core)
  const hit = AR[key]
  if (hit !== undefined) return hit

  for (const [re, build] of AR_PATTERNS) {
    const m = key.match(re)
    if (m) return build(m, translateCore)
  }

  // Several sentences joined with a dot (the dashboard's profit note).
  if (key.includes(' · ')) return key.split(' · ').map(translateCore).join(' · ')

  // Money and volumes inside a longer text ("1 500 DA", "30 ml").
  return core.replace(/\bDA\b/g, AR.DA).replace(/\bml\b/g, AR.ml)
}

export function translate(text: string): string {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m || !m[2]) return text
  const out = translateCore(m[2])

  return out === m[2] ? text : m[1] + out + m[3]
}

// What this module wrote last, so that its own changes are not mistaken for new French text.
const written = new WeakMap<Node, string>()
const writtenAttr = new WeakMap<Element, Map<string, string>>()

function fixText(node: Text) {
  if (written.get(node) === node.data) return
  const next = translate(node.data)
  if (next !== node.data) {
    node.data = next
    written.set(node, next)
  }
}

function fixAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (!v || writtenAttr.get(el)?.get(a) === v) continue
    const next = translate(v)
    if (next !== v) {
      el.setAttribute(a, next)
      const m = writtenAttr.get(el) ?? new Map()
      m.set(a, next)
      writtenAttr.set(el, m)
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!SKIP.has(root.parentElement?.tagName ?? '') && !root.parentElement?.closest('[data-no-translate]')) fixText(root as Text)

    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (SKIP.has(el.tagName) || el.closest('[data-no-translate]')) return
  fixAttrs(el)
  el.childNodes.forEach(walk)
}

/** Applies the current language to the page and keeps doing it while React changes the screen. Returns a stop function. */
export function startTranslator(): () => void {
  const html = document.documentElement
  const apply = () => {
    html.lang = getLang()
    html.dir = isRtl() ? 'rtl' : 'ltr'
  }
  apply()

  let observer: MutationObserver | null = null
  if (getLang() === 'ar') {
    walk(document.body)
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') walk(r.target)
        else if (r.type === 'attributes') fixAttrs(r.target as Element)
        else r.addedNodes.forEach(walk)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  }

  return () => {
    observer?.disconnect()
    html.lang = 'fr'
    html.dir = 'ltr'
  }
}
