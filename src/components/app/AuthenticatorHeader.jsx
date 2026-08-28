/**
 * Sign-in chrome that matches the signed-in app bar: navy header, logo, color toggle.
 */
import { AppBar, Box, Stack, Toolbar, Typography } from '@mui/material'
import { BRAND } from '../../theme'
import { ColorModeToggle } from './colorMode'
import readyOgLogo from '../../assets/readyog-logo.png'

const HEADER_BRAND_SIZE = 48

export default function AuthenticatorHeader() {
  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: '3px solid',
          borderColor: 'secondary.main',
          bgcolor: BRAND.navy,
          color: '#ffffff',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box
              component="img"
              src={readyOgLogo}
              alt=""
              sx={{
                height: HEADER_BRAND_SIZE,
                width: HEADER_BRAND_SIZE,
                flexShrink: 0,
                borderRadius: 1,
                objectFit: 'contain',
              }}
            />
            <Typography
              noWrap
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: HEADER_BRAND_SIZE,
                fontSize: HEADER_BRAND_SIZE * 0.5,
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '-0.03em',
              }}
            >
              ReadyOG!
            </Typography>
          </Stack>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>
      <Toolbar />
    </>
  )
}
