import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { isDemo } from '@/lib/api'
import './i18n'
import './index.css'
import App from './App'
import { LanguageGate } from './demo/LanguageGate'
import { startDemoLanguage } from './demo/language'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

if (isDemo) startDemoLanguage()

// The demo site runs from any folder of any free host, so its addresses live after the "#".
const Router = isDemo ? HashRouter : BrowserRouter
const DemoKit = import.meta.env.VITE_DEMO === 'true' ? lazy(() => import('./demo/DemoKit')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
        {isDemo && <LanguageGate />}
        {DemoKit && (
          <Suspense fallback={null}>
            <DemoKit />
          </Suspense>
        )}
      </Router>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
