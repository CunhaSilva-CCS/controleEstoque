import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './lib/toast'
import { ThemeProvider } from './lib/theme'
import { ClientBrandProvider } from './lib/client-brand'
import { initRendererTelemetry } from './lib/telemetry'
import './styles.css'

initRendererTelemetry()

const isFileProtocol = window.location.protocol === 'file:'
const Router = isFileProtocol ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ClientBrandProvider>
        <ToastProvider>
          <Router>
            <App />
          </Router>
        </ToastProvider>
      </ClientBrandProvider>
    </ThemeProvider>
  </StrictMode>,
)
