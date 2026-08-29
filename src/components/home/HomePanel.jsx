/**
 * Signed-in splash: what readyOG is, the four product pillars, and placeholders
 * for a walkthrough video and hero image the instructor can drop in later.
 */
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import Groups3Icon from '@mui/icons-material/Groups3'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt'
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import { BRAND } from '../../theme'
import readyOgLogo from '../../assets/readyog-logo.png'

const PILLARS = [
  {
    id: 'creation',
    title: 'Intelligent Content Creation',
    kicker: 'Meet Andrea',
    icon: AutoAwesomeIcon,
    accent: BRAND.glow,
    points: [
      {
        label: 'AI-Assisted Curation',
        detail:
          'Andrea, your built-in assistant, selects targeted word lists, sentences, and decodable passages so you spend minutes on prep instead of hours.',
      },
      {
        label: 'Precision Targeting',
        detail:
          'Every lesson is customized to the exact scope and sequence of the students in front of you — no generic worksheets, no guesswork.',
      },
    ],
  },
  {
    id: 'workflow',
    title: 'Flexible Workflow & Administration',
    kicker: 'Groups, 1:1, and the week',
    icon: Groups3Icon,
    accent: BRAND.sky,
    points: [
      {
        label: 'Group & 1:1 Support',
        detail:
          'Plan, schedule, and track small groups and individual students in the same workspace — not a one-learner-at-a-time workaround.',
      },
      {
        label: 'Integrated Scheduling & Export',
        detail:
          'Map the week, then bulk-export every lesson in a single click as Word docs, PDFs, or a direct print.',
      },
      {
        label: 'Case-File Ready',
        detail:
          'Generated records and lesson plans print cleanly, formatted for physical or digital case files the moment you need them.',
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics & Progress Tracking',
    kicker: 'Teach, log, see growth',
    icon: InsightsOutlinedIcon,
    accent: BRAND.gold,
    points: [
      {
        label: 'Frictionless Data Entry',
        detail:
          'Log student data on the lesson plan itself, during the session or right after — no separate spreadsheet, no later reconstruction.',
      },
      {
        label: 'Analytics Dashboard',
        detail:
          'Lesson data rolls up automatically so you can visualize progress over time and know what to reteach next.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy by Design',
    kicker: 'Zero PII, by default',
    icon: ShieldOutlinedIcon,
    accent: BRAND.navyMid,
    points: [
      {
        label: 'Zero-PII Architecture',
        detail:
          'readyOG is engineered to run fully without Personally Identifiable Information, so student-data privacy compliance is the starting point — not a retrofit.',
      },
    ],
  },
]

function welcomeLabel(instructor) {
  const raw = String(instructor ?? '').trim()
  if (!raw) return 'Welcome to readyOG'
  const local = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw
  const pretty = local.replace(/[._]+/g, ' ').trim()
  if (!pretty) return 'Welcome to readyOG'
  return `Welcome, ${pretty}`
}

function MediaPlaceholder({ kind, label, hint }) {
  const isVideo = kind === 'video'
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        minHeight: { xs: 220, md: 280 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: BRAND.navyDark,
        backgroundImage: isVideo
          ? `linear-gradient(135deg, ${BRAND.navyDark} 0%, ${BRAND.navy} 55%, ${BRAND.navyMid} 100%)`
          : `linear-gradient(160deg, ${BRAND.navy} 0%, #1a3a72 50%, ${BRAND.goldDark} 140%)`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(168,198,250,0.18) 0%, transparent 42%), radial-gradient(circle at 80% 80%, rgba(212,175,55,0.16) 0%, transparent 46%)',
        }}
      />
      <Stack alignItems="center" spacing={1} sx={{ position: 'relative', px: 3, py: 4, textAlign: 'center' }}>
        {isVideo ? (
          <PlayCircleFilledIcon sx={{ fontSize: 72, color: 'rgba(255,255,255,0.92)' }} />
        ) : (
          <ImageOutlinedIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.88)' }} />
        )}
        <Chip
          size="small"
          label={isVideo ? 'Video placeholder' : 'Image placeholder'}
          sx={{ bgcolor: 'rgba(0,0,0,0.45)', color: '#fff', fontWeight: 700 }}
        />
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.03em' }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)', maxWidth: 360 }}>
          {hint}
        </Typography>
      </Stack>
    </Paper>
  )
}

function PillarCard({ pillar }) {
  const Icon = pillar.icon
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        height: '100%',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderTop: `4px solid ${pillar.accent}`,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'secondary.light',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary', display: 'block' }}
          >
            {pillar.kicker.toUpperCase()}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {pillar.title}
          </Typography>
        </Box>
      </Stack>
      <Stack spacing={1.5} sx={{ mt: 0.5 }}>
        {pillar.points.map((point) => (
          <Box key={point.label}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {point.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.45 }}>
              {point.detail}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  )
}

export default function HomePanel({
  instructor = '',
  onAddStudent,
  onOpenSchedule,
  onOpenResources,
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 5 }}>
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderBottom: `3px solid ${BRAND.glow}`,
          bgcolor: BRAND.navy,
          color: '#fff',
          px: { xs: 2.5, md: 4 },
          py: { xs: 3.5, md: 5 },
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              radial-gradient(ellipse at 12% 20%, rgba(168,198,250,0.28) 0%, transparent 42%),
              radial-gradient(ellipse at 92% 0%, rgba(212,175,55,0.22) 0%, transparent 38%),
              linear-gradient(180deg, ${BRAND.navy} 0%, ${BRAND.navyDark} 100%)
            `,
          }}
        />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          sx={{ position: 'relative' }}
        >
          <Box
            component="img"
            src={readyOgLogo}
            alt="readyOG"
            sx={{
              width: { xs: 88, md: 112 },
              height: { xs: 88, md: 112 },
              borderRadius: 2,
              objectFit: 'contain',
              flexShrink: 0,
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Chip
              size="small"
              label="For Orton-Gillingham practitioners"
              sx={{
                mb: 1.25,
                bgcolor: 'rgba(168,198,250,0.18)',
                color: BRAND.glow,
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}
            />
            <Typography
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.03em',
                fontSize: { xs: '1.55rem', md: '2.05rem' },
                lineHeight: 1.15,
                mb: 0.75,
              }}
            >
              {welcomeLabel(instructor)}
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.05rem', md: '1.2rem' },
                lineHeight: 1.3,
                color: BRAND.glow,
                mb: 1.25,
                maxWidth: 640,
              }}
            >
              Less prep. Sharper lessons. Every student on sequence.
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.86)', maxWidth: 680, lineHeight: 1.5, mb: 2.25 }}>
              readyOG is a purpose-built lesson plan management platform for Orton-Gillingham
              practitioners. It dramatically reduces prep time so you can create, manage, and
              customize high-quality lessons tailored to a student&apos;s exact scope and sequence.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<PersonAddAltIcon />}
                onClick={onAddStudent}
                sx={{ color: BRAND.navyDark, fontWeight: 800 }}
              >
                Add a student
              </Button>
              <Button
                variant="outlined"
                startIcon={<CalendarMonthIcon />}
                onClick={onOpenSchedule}
                sx={{
                  color: '#fff',
                  borderColor: 'rgba(168,198,250,0.7)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Open schedule
              </Button>
              <Button
                variant="outlined"
                startIcon={<VideoLibraryIcon />}
                onClick={onOpenResources}
                sx={{
                  color: '#fff',
                  borderColor: 'rgba(168,198,250,0.7)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Training videos
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
          gap: 2,
        }}
      >
        <MediaPlaceholder
          kind="video"
          label="See readyOG in a session"
          hint="Drop your product-tour video here. Until then, this is a stand-in for the walkthrough instructors see on day one."
        />
        <MediaPlaceholder
          kind="image"
          label="A lesson, ready to teach"
          hint="Placeholder for a classroom or student-page photo. Swap this for a still of a printed plan or a live session."
        />
      </Box>

      <Box>
        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800 }}>
          What is readyOG?
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 0.75 }}>
          Built for the way OG instruction actually works
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760, lineHeight: 1.5 }}>
          You already know the method. readyOG takes the administrative drag out of it — so the
          next word list, the next passage, and the next week of lessons are waiting when you are.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
        }}
      >
        {PILLARS.map((pillar) => (
          <PillarCard key={pillar.id} pillar={pillar} />
        ))}
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 2,
          border: '1px solid',
          borderColor: BRAND.goldBorder,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'background.paper' : BRAND.goldBg),
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: BRAND.goldHover,
              color: BRAND.navy,
              flexShrink: 0,
            }}
          >
            <ShieldOutlinedIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Privacy that is designed in, not bolted on
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              First names and last initials. Custom IDs you control. No Social Security numbers, no
              home addresses, no extra identifiers the work does not need. Teach with confidence
              that the platform was built to stay out of the PII business.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Chip size="small" label="Zero PII" sx={{ fontWeight: 800, bgcolor: BRAND.goldHover, color: BRAND.navy }} />
            <Chip size="small" variant="outlined" label="Case-file ready" icon={<PrintOutlinedIcon />} />
          </Stack>
        </Stack>
      </Paper>

      <Box>
        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800 }}>
          Start here
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
          Three doors into a lighter week of prep
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {[
            {
              title: 'Roster a student',
              body: 'Add a first name and last initial. Scope and sequence is ready the moment they exist.',
              icon: PersonAddAltIcon,
              action: onAddStudent,
              label: 'Add student',
            },
            {
              title: 'Lay out the week',
              body: 'Schedule 1:1 and group lessons, then export the whole week as Word, PDF, or print.',
              icon: CalendarMonthIcon,
              action: onOpenSchedule,
              label: 'Open schedule',
            },
            {
              title: 'Learn the workflow',
              body: 'Short training clips for lessons, mastery, data, and groups — watch when you need them.',
              icon: VideoLibraryIcon,
              action: onOpenResources,
              label: 'Browse resources',
            },
          ].map((card) => {
            const Icon = card.icon
            return (
              <Paper
                key={card.title}
                elevation={0}
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  bgcolor: 'background.paper',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Icon fontSize="small" color="primary" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {card.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, lineHeight: 1.45 }}>
                  {card.body}
                </Typography>
                <Button size="small" variant="contained" onClick={card.action} sx={{ alignSelf: 'flex-start' }}>
                  {card.label}
                </Button>
              </Paper>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
