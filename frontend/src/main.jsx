import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// A deploy replaces every hashed chunk in /assets, so a tab that was open beforehand asks for a
// filename that no longer exists the moment it lazy-loads something (the PDF builder, say) and
// dies with "Failed to fetch dynamically imported module". The page itself is fine — it is simply
// running last release's code. Reload once, guarded so a genuinely missing chunk cannot loop.
const RELOAD_KEY = 'hros:chunk-reload'
function recoverFromStaleBundle() {
  if (sessionStorage.getItem(RELOAD_KEY)) return false
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}
// Any successful navigation means the current bundle loaded, so let the guard re-arm.
window.addEventListener('load', () => {
  const at = Number(sessionStorage.getItem(RELOAD_KEY))
  if (at && Date.now() - at > 10_000) sessionStorage.removeItem(RELOAD_KEY)
})
window.addEventListener('vite:preloadError', (e) => { if (recoverFromStaleBundle()) e.preventDefault() })
window.addEventListener('unhandledrejection', (e) => {
  if (/dynamically imported module|Importing a module script failed/i.test(String(e.reason?.message || ''))) {
    recoverFromStaleBundle()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
