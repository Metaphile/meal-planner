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

// Auto-update the service worker in the background; the app stays usable.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
