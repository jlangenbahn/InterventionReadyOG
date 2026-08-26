/**
 * Light/dark color mode for MUI and the Amplify Authenticator.
 * Preference is stored in localStorage when the browser allows it.
 */
import { createContext, useContext } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'

export const COLOR_MODE_KEY = 'readyog-color-mode'

export const ColorModeContext = createContext({
  mode: 'light',
  toggleColorMode: () => {},
})

export function readStoredColorMode() {
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Private mode or blocked storage.
  }
  return 'light'
}

export function ColorModeToggle({ color = 'inherit' }) {
  const { mode, toggleColorMode } = useContext(ColorModeContext)
  const dark = mode === 'dark'
  return (
    <Tooltip title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        color={color}
        onClick={toggleColorMode}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  )
}
