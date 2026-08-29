/**
 * MUI theme, Amplify Authenticator theme, and lesson-grid color tokens.
 */
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
  gold: '#D4AF37',
  goldMid: '#E0C04A',
  goldDark: '#8F7314',
  goldBg: '#F8F3E4',
  goldHover: '#F0E6C4',
  goldSelected: '#E8C547',
  goldSelectedHover: '#DDBB32',
  goldHeader: '#F3EAC6',
  goldBorder: '#D4C48A',
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

/** Soft row tints for scored lesson plans. Ungraded rows stay uncolored. */
export const GRADE_ROW_COLORS = {
  high: {
    bg: '#dceee1',
    hover: '#cde5d4',
    selected: '#b9dcc4',
    selectedHover: '#a8d0b5',
    color: '#1a4a32',
  },
  mid: {
    bg: '#f3ebcc',
    hover: '#ece1b4',
    selected: '#e3d49a',
    selectedHover: '#d9c986',
    color: '#5a4710',
  },
  low: {
    bg: '#f1dfdf',
    hover: '#e8cece',
    selected: '#dcbbbb',
    selectedHover: '#d0aaaa',
    color: '#6a2626',
  },
}

export function gradeBandFromPercent(percent) {
  if (percent == null || Number.isNaN(Number(percent))) return null
  if (percent >= 90) return 'high'
  if (percent >= 70) return 'mid'
  return 'low'
}

export const gradeRowSx = Object.fromEntries(
  Object.entries(GRADE_ROW_COLORS).flatMap(([band, { bg, hover, selected, selectedHover, color }]) => [
    [
      `& .grade-row-${band}`,
      {
        bgcolor: bg,
        color,
        '& .MuiDataGrid-cell': { color, bgcolor: 'transparent' },
        '& .MuiIconButton-root': { color },
        '& .MuiDataGrid-cell--pinnedLeft, & .MuiDataGrid-cell--pinnedRight, & .MuiDataGrid-cell--pinnedLeft--last, & .MuiDataGrid-cell--pinnedRight--first': {
          bgcolor: 'inherit !important',
          backgroundImage: 'none',
        },
      },
    ],
    [`& .grade-row-${band}:hover`, { bgcolor: hover }],
    [
      `& .grade-row-${band}.Mui-selected`,
      {
        bgcolor: `${selected} !important`,
        '&:hover': { bgcolor: `${selectedHover} !important` },
        '& .MuiDataGrid-cell': { bgcolor: 'transparent !important' },
      },
    ],
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

export const globalLessonGridSx = {
  bgcolor: BRAND.goldBg,
  '--DataGrid-containerBackground': BRAND.goldHeader,
  '--DataGrid-pinnedBackground': BRAND.goldBg,
  '--DataGrid-rowBorderColor': BRAND.goldBorder,
  '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-columnHeader': {
    bgcolor: `${BRAND.goldHeader} !important`,
    borderColor: BRAND.goldBorder,
  },
  '& .MuiDataGrid-filler, & .MuiDataGrid-overlayWrapper, & .MuiDataGrid-virtualScroller': {
    bgcolor: 'transparent',
  },
  '& .MuiDataGrid-footerContainer': {
    bgcolor: BRAND.goldBg,
    borderColor: BRAND.goldBorder,
  },
  '& .MuiDataGrid-toolbarContainer': {
    bgcolor: BRAND.goldBg,
  },
  '& .MuiDataGrid-row': {
    bgcolor: BRAND.goldBg,
    '&:hover': { bgcolor: BRAND.goldHover },
    '& .MuiDataGrid-cell': { bgcolor: 'transparent' },
  },
  '& .MuiDataGrid-row.Mui-selected': {
    bgcolor: `${BRAND.goldSelected} !important`,
    '&:hover': { bgcolor: `${BRAND.goldSelectedHover} !important` },
    '& .MuiDataGrid-cell': { bgcolor: 'transparent !important' },
  },
  '& .MuiDataGrid-cell': {
    borderColor: BRAND.goldBorder,
  },
  '& .MuiDataGrid-cell--pinnedLeft, & .MuiDataGrid-cell--pinnedRight, & .MuiDataGrid-cell--pinnedLeft--last, & .MuiDataGrid-cell--pinnedRight--first': {
    bgcolor: 'inherit !important',
    backgroundImage: 'none',
  },
}

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
          10: { value: { light: BRAND.grayBg, dark: '#1b2740' } },
          20: { value: { light: '#d6e4fa', dark: '#243556' } },
          40: { value: BRAND.glow },
          60: { value: BRAND.sky },
          80: { value: BRAND.navy },
          90: { value: BRAND.navyDark },
          100: { value: '#00102e' },
        },
      },
      background: {
        primary: { value: { light: BRAND.grayBg, dark: '#0c1220' } },
        secondary: { value: { light: BRAND.grayPaper, dark: '#152036' } },
      },
      font: {
        primary: { value: { light: BRAND.ink, dark: '#e8eaed' } },
        secondary: { value: { light: BRAND.inkMuted, dark: '#a8b0bc' } },
        interactive: { value: { light: BRAND.navy, dark: BRAND.sky } },
      },
      border: {
        primary: { value: { light: BRAND.gray, dark: '#2a3a55' } },
        focus: { value: BRAND.navy },
      },
    },
    fonts: {
      default: {
        variable: { value: FONT_FAMILY },
        static: { value: FONT_FAMILY },
      },
    },
    radii: {
      small: { value: '10px' },
      medium: { value: '10px' },
      large: { value: '12px' },
    },
    components: {
      authenticator: {
        router: {
          boxShadow: { value: 'none' },
          borderWidth: { value: '1px' },
          backgroundColor: { value: { light: BRAND.grayPaper, dark: '#152036' } },
        },
      },
      button: {
        fontWeight: { value: '650' },
        primary: {
          backgroundColor: { value: BRAND.navy },
          color: { value: '#ffffff' },
          _hover: { backgroundColor: { value: BRAND.navyDark } },
          _focus: { backgroundColor: { value: BRAND.navyDark } },
          _active: { backgroundColor: { value: BRAND.navyDark } },
        },
        link: {
          color: { value: { light: BRAND.navy, dark: BRAND.sky } },
        },
      },
      fieldcontrol: {
        borderColor: { value: { light: BRAND.gray, dark: '#2a3a55' } },
        color: { value: { light: BRAND.ink, dark: '#e8eaed' } },
        _focus: {
          borderColor: { value: BRAND.navy },
          boxShadow: { value: `0 0 0 2px ${BRAND.glow}` },
        },
      },
    },
  },
}

const DARK = {
  bg: '#0c1220',
  paper: '#152036',
  ink: '#e8eaed',
  muted: '#a8b0bc',
  divider: '#2a3a55',
}

export function createAppTheme(mode = 'light') {
  const isDark = mode === 'dark'
  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: isDark ? BRAND.sky : BRAND.navy,
        light: BRAND.navyMid,
        dark: BRAND.navyDark,
        contrastText: '#ffffff',
      },
      secondary: {
        main: BRAND.glow,
        light: isDark ? '#3d5a99' : '#d6e4fa',
        dark: BRAND.skyDark,
        contrastText: BRAND.navyDark,
      },
      background: {
        default: isDark ? DARK.bg : BRAND.grayBg,
        paper: isDark ? DARK.paper : BRAND.grayPaper,
      },
      text: {
        primary: isDark ? DARK.ink : BRAND.ink,
        secondary: isDark ? DARK.muted : BRAND.inkMuted,
      },
      divider: isDark ? DARK.divider : BRAND.gray,
      grey: {
        100: isDark ? '#1b2740' : '#f4f5f7',
        200: isDark ? DARK.paper : BRAND.grayBg,
        300: isDark ? DARK.divider : BRAND.gray,
        400: isDark ? DARK.muted : BRAND.grayMid,
        700: isDark ? DARK.muted : BRAND.inkMuted,
        900: isDark ? DARK.ink : BRAND.ink,
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
          html: { colorScheme: isDark ? 'dark' : 'light' },
          body: {
            fontFamily: FONT_FAMILY,
            letterSpacing: '-0.02em',
            backgroundColor: isDark ? DARK.bg : BRAND.grayBg,
            color: isDark ? DARK.ink : BRAND.ink,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: BRAND.navy,
            color: '#ffffff',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingTop: 4,
            overflow: 'visible',
            borderBottom: `2px solid ${isDark ? DARK.divider : BRAND.navy}`,
            '& .MuiTabs-scroller': {
              overflow: 'visible !important',
            },
          },
          flexContainer: {
            gap: 4,
            alignItems: 'flex-end',
          },
          list: {
            gap: 4,
            alignItems: 'flex-end',
          },
          indicator: {
            display: 'none',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 36,
            minWidth: 0,
            padding: '8px 22px 10px',
            marginBottom: -2,
            overflow: 'visible',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: isDark ? DARK.muted : BRAND.inkMuted,
            backgroundColor: isDark ? '#1b2740' : '#d9e2ef',
            border: `1px solid ${isDark ? DARK.divider : BRAND.navyMid}`,
            borderBottom: `2px solid ${isDark ? DARK.divider : BRAND.navy}`,
            borderRadius: '16px 16px 0 0',
            zIndex: 0,
            opacity: 1,
            transition: 'background-color 120ms ease, color 120ms ease, z-index 0s',
            '&.Mui-selected': {
              color: isDark ? '#ffffff' : BRAND.navy,
              backgroundColor: isDark ? DARK.paper : '#ffffff',
              borderColor: isDark ? DARK.divider : BRAND.navy,
              borderBottomColor: isDark ? DARK.paper : '#ffffff',
              zIndex: 1,
              fontWeight: 800,
            },
            '&:hover': {
              color: isDark ? '#ffffff' : BRAND.navy,
              backgroundColor: isDark ? '#243556' : '#c5d3e8',
            },
            '&.Mui-selected:hover': {
              backgroundColor: isDark ? DARK.paper : '#ffffff',
            },
          },
          iconWrapper: {
            marginBottom: '0 !important',
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
}

export const theme = createAppTheme('light')
