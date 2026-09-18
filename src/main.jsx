import { createRoot } from 'react-dom/client'
import './index.css'

const rootEl = document.getElementById('root')

function showBootError(message) {
  if (!rootEl) return
  rootEl.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#080808;color:#f03838;font-family:system-ui,sans-serif;text-align:center'
  const title = document.createElement('div')
  title.textContent = 'App failed to load'
  title.style.fontWeight = '700'
  const detail = document.createElement('div')
  detail.textContent = message
  detail.style.cssText = 'max-width:520px;line-height:1.6;color:#d4d4d8;font-size:14px'
  const hint = document.createElement('div')
  hint.textContent = 'Stop the dev server (Ctrl+C), then run: npm run dev -- --force'
  hint.style.cssText = 'max-width:520px;font-size:12px;color:#94a3b8;margin-top:8px'
  wrap.append(title, detail, hint)
  rootEl.appendChild(wrap)
}

if (!rootEl) {
  document.body.innerHTML = '<p style="color:#f03838;padding:24px">Missing #root element</p>'
} else {
  import('./App.jsx')
    .then(({ default: App }) => {
      createRoot(rootEl).render(<App />)
    })
    .catch((err) => {
      console.error(err)
      showBootError(err?.message || String(err))
    })
}
