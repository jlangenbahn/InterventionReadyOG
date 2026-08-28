/**
 * App root: Amplify Authenticator plus MUI/Amplify theming.
 * Signed-in instructors render AppShell.
 */
import { useMemo, useState } from 'react'
import { Authenticator, ThemeProvider as AmplifyThemeProvider } from '@aws-amplify/ui-react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import AppShell from './components/app/AppShell'
import AuthenticatorHeader from './components/app/AuthenticatorHeader'
import { COLOR_MODE_KEY, ColorModeContext, readStoredColorMode } from './components/app/colorMode'
import { amplifyTheme, createAppTheme } from './theme'

export default function App() {
  const [mode, setMode] = useState(readStoredColorMode)
  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((current) => {
          const next = current === 'dark' ? 'light' : 'dark'
          try {
            window.localStorage.setItem(COLOR_MODE_KEY, next)
          } catch {
            // Private mode or blocked storage.
          }
          return next
        })
      },
    }),
    [mode],
  )
  const muiTheme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        <AmplifyThemeProvider theme={amplifyTheme} colorMode={mode}>
          <Authenticator
            loginMechanisms={['email']}
            components={{
              Header: AuthenticatorHeader,
            }}
          >
            {({ signOut, user }) => <AppShell user={user} signOut={signOut} />}
          </Authenticator>
        </AmplifyThemeProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}
