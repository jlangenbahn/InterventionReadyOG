import { createTheme } from '@mui/material'

/** Single-story geometric stack used on student lesson pages 2–4. */
export const FONT_FAMILY = '"Century Gothic", "Comic Sans MS", Andika, sans-serif'

/** Navy, glow blue, and cool gray from the CIMS-style mark. */
export const BRAND = {
  navy: '#002366',
  navyDark: '#001845',
  navyMid: '#3d5a99',
  glow: '#a8c6fa',
  sky: '#7ba3e0',
  skyDark: '#5b82c4',
  gray: '#c0c0c0',
  grayMid: '#9aa0a6',
  grayBg: '#e8eaed',
  grayPaper: '#ffffff',
  ink: '#1a2332',
  inkMuted: '#5c6370',
  readerInk: '#333333',
}

export const STUDENT_FONT_SIZE = '24px'

export const studentTypeSx = {
  fontFamily: FONT_FAMILY,
  fontSize: STUDENT_FONT_SIZE,
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 1.6,
  letterSpacing: '0.04em',
  textAlign: 'left',
  textTransform: 'none',
  textDecoration: 'none',
  color: BRAND.readerInk,
}

/** Sequential navy: unknown (lightest gray) → mastered (navy). */
export const MASTERY_ROW_COLORS = {
  unknown: { bg: '#e8eaed', hover: '#dcdfe3', color: BRAND.ink },
  new: { bg: '#d6e4fa', hover: '#c4d7f5', color: BRAND.navy },
  review: { bg: BRAND.sky, hover: '#6a94d4', color: BRAND.navyDark },
  mastered: { bg: BRAND.navy, hover: BRAND.navyDark, color: '#ffffff' },
}

export const masteryRowSx = Object.fromEntries(
  Object.entries(MASTERY_ROW_COLORS).flatMap(([status, { bg, hover, color }]) => [
    [
      `& .mastery-row-${status}`,
      {
        bgcolor: bg,
        color,
        '& .MuiCheckbox-root': { color },
        '& .MuiDataGrid-cell': { color },
      },
    ],
    [`& .mastery-row-${status}:hover`, { bgcolor: hover }],
  ]),
)

export const BAR_COLORS = [
  BRAND.navy,
  BRAND.navyMid,
  BRAND.sky,
  BRAND.glow,
  BRAND.grayMid,
  BRAND.gray,
]

/** Distinct blue/gray tones for review concept 1–3. */
export const REVIEW_SLOT_COLORS = [
  {
    slotClass: 'review-slot-0',
    bg: BRAND.glow,
    hover: '#93b6f5',
    color: BRAND.navyDark,
    border: BRAND.skyDark,
    rowBg: '#eef4fd',
    rowHover: '#d6e4fa',
    rowSelected: BRAND.glow,
  },
  {
    slotClass: 'review-slot-1',
    bg: BRAND.sky,
    hover: '#6a94d4',
    color: BRAND.navyDark,
    border: BRAND.navyMid,
    rowBg: '#e3edf9',
    rowHover: '#c5d6f2',
    rowSelected: BRAND.sky,
  },
  {
    slotClass: 'review-slot-2',
    bg: BRAND.navy,
    hover: BRAND.navyDark,
    color: '#ffffff',
    border: BRAND.navyDark,
    rowBg: '#d9e0ef',
    rowHover: '#c5cee4',
    rowSelected: BRAND.navyMid,
  },
]

export const UNREPRESENTED_COLORS = {
  bg: BRAND.grayBg,
  hover: BRAND.gray,
  color: BRAND.inkMuted,
  border: BRAND.grayMid,
}

export const amplifyTheme = {
  name: 'intervention-ready-cims',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: BRAND.grayBg },
          20: { value: '#d6e4fa' },
          40: { value: BRAND.glow },
          60: { value: BRAND.sky },
          80: { value: BRAND.navy },
          90: { value: BRAND.navyDark },
          100: { value: '#00102e' },
        },
      },
      background: {
        primary: { value: BRAND.grayBg },
        secondary: { value: BRAND.grayPaper },
      },
      font: {
        primary: { value: BRAND.ink },
        secondary: { value: BRAND.inkMuted },
      },
    },
    fonts: {
      default: {
        variable: { value: FONT_FAMILY },
        static: { value: FONT_FAMILY },
      },
    },
  },
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: BRAND.navy,
      light: BRAND.navyMid,
      dark: BRAND.navyDark,
      contrastText: '#ffffff',
    },
    secondary: {
      main: BRAND.glow,
      light: '#d6e4fa',
      dark: BRAND.skyDark,
      contrastText: BRAND.navyDark,
    },
    background: {
      default: BRAND.grayBg,
      paper: BRAND.grayPaper,
    },
    text: {
      primary: BRAND.ink,
      secondary: BRAND.inkMuted,
    },
    divider: BRAND.gray,
    grey: {
      100: '#f4f5f7',
      200: BRAND.grayBg,
      300: BRAND.gray,
      400: BRAND.grayMid,
      700: BRAND.inkMuted,
      900: BRAND.ink,
    },
  },
  typography: {
    fontFamily: FONT_FAMILY,
    htmlFontSize: 16,
    fontSize: 13,
    fontWeightRegular: 400,
    fontWeightMedium: 600,
    fontWeightBold: 700,
    h5: { fontWeight: 700, fontSize: '1.15rem', letterSpacing: '-0.02em', lineHeight: 1.25 },
    h6: { fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em', lineHeight: 1.25 },
    subtitle1: { fontWeight: 650, fontSize: '0.85rem', letterSpacing: '-0.015em', lineHeight: 1.3 },
    subtitle2: { fontWeight: 650, fontSize: '0.78rem', letterSpacing: '-0.015em', lineHeight: 1.3 },
    body1: { fontSize: '0.8125rem', letterSpacing: '-0.02em', lineHeight: 1.35 },
    body2: { fontSize: '0.75rem', letterSpacing: '-0.02em', lineHeight: 1.3 },
    button: {
      fontWeight: 650,
      fontSize: '0.75rem',
      letterSpacing: '-0.01em',
      textTransform: 'none',
    },
    caption: { fontSize: '0.68rem', letterSpacing: '-0.01em', lineHeight: 1.25 },
    overline: { fontSize: '0.65rem', letterSpacing: '0.04em', fontWeight: 700 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: FONT_FAMILY,
          letterSpacing: '-0.02em',
          backgroundColor: BRAND.grayBg,
          color: BRAND.ink,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontFamily: FONT_FAMILY },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: { fontFamily: FONT_FAMILY },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontFamily: FONT_FAMILY, fontSize: '0.8125rem' },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          fontFamily: FONT_FAMILY,
          fontSize: '0.75rem',
          letterSpacing: '-0.02em',
        },
        columnHeaderTitle: {
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: '-0.015em',
        },
        cell: {
          fontFamily: FONT_FAMILY,
        },
      },
    },
  },
})
