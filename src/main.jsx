/**
 * Vite entry. Configures Amplify first, then mounts the React app.
 */
import './configureAmplify.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@aws-amplify/ui-react/styles.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
