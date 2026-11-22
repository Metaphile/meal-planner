import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { catchInstallPrompt } from './lib/install'

// (Before the browser offers to install: see Account → Home Screen.)
catchInstallPrompt()

// A new version of the app downloads in the background and waits. It's put
// in place (the page reloaded) only once you've left the app — never in
// front of you, mid-edit. Coming back, it's as you left it: what's on screen
// is saved as it changes (lib/uiState). And coming back is when to look for
// a new version (an app on the Home Screen is rarely reloaded otherwise).
let waiting = false
let registration: ServiceWorkerRegistration | undefined
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    waiting = true
    if (document.visibilityState === 'hidden') void updateSW(true)
  },
  onRegisteredSW(_url, r) {
    registration = r
  },
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (waiting) void updateSW(true)
  } else void registration?.update().catch(() => {})
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
