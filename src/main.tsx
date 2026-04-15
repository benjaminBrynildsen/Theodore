import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppErrorBoundary } from './components/app/AppErrorBoundary'
import { init as initJourney } from './lib/journey'
import { isLibraryHost } from './library/api'
import { LibraryApp } from './library/LibraryApp'

// Start journey tracking immediately (before React renders)
initJourney();

const Root = isLibraryHost() ? LibraryApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </StrictMode>,
)
