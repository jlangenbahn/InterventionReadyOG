/**
 * Instructor training library splash. Dummy videos until real materials land.
 */
import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled'
import SearchIcon from '@mui/icons-material/Search'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import { BRAND } from '../../theme'

const CATEGORIES = ['All', 'Getting started', 'Lessons', 'Scope & Sequence', 'Data', 'Groups']

const DUMMY_VIDEOS = [
  {
    id: 'welcome',
    title: 'Welcome to ReadyOG',
    category: 'Getting started',
    duration: '6:12',
    featured: true,
    description:
      'A tour of Schedule, Students, and Groups, plus how a typical intervention session is planned in the app.',
  },
  {
    id: 'first-student',
    title: 'Add your first student',
    category: 'Getting started',
    duration: '4:05',
    description: 'Create a student record, set a custom ID, and open their lesson workspace.',
  },
  {
    id: 'build-lesson',
    title: 'Build a lesson plan',
    category: 'Lessons',
    duration: '11:40',
    featured: true,
    description:
      'Choose review and new concepts, pull word lists, and generate connected text with Ask Andrea.',
  },
  {
    id: 'print-share',
    title: 'Print, score, and share a lesson',
    category: 'Lessons',
    duration: '7:28',
    description: 'Export a student page, record accuracy, and send a copy to a colleague.',
  },
  {
    id: 'templates',
    title: 'Lesson templates and galleries',
    category: 'Lessons',
    duration: '8:16',
    description: 'Save a plan as a template, browse published lessons, and reuse what already works.',
  },
  {
    id: 'inventory',
    title: 'Mark concepts in scope',
    category: 'Scope & Sequence',
    duration: '9:03',
    description:
      'Use Concept Inventory to decide what is in scope, set sequence, and apply a level preset.',
  },
  {
    id: 'mastery',
    title: 'Track mastery during the year',
    category: 'Scope & Sequence',
    duration: '5:51',
    description: 'Cycle concepts from unknown to new, review, and mastered as instruction progresses.',
  },
  {
    id: 'reporting',
    title: 'Read the student data dashboard',
    category: 'Data',
    duration: '8:44',
    description: 'Accuracy, cadence, and in-scope mastery — what each chart is telling you.',
  },
  {
    id: 'practice-gaps',
    title: 'Find practice gaps',
    category: 'Data',
    duration: '6:22',
    description: 'Spot new concepts that have never been taught and review items that are overdue.',
  },
  {
    id: 'groups',
    title: 'Bundle students into groups',
    category: 'Groups',
    duration: '4:47',
    description: 'Create a group, schedule a shared lesson, and open each student’s copy afterward.',
  },
  {
    id: 'calendar',
    title: 'Plan the week on the calendar',
    category: 'Getting started',
    duration: '7:09',
    description: 'Schedule individual and group lessons, then jump from an event into the plan.',
  },
  {
    id: 'word-lists',
    title: 'Build word lists and connected text',
    category: 'Lessons',
    duration: '10:18',
    description: 'Catalog words by concept, save student lists, and write sentences and passages.',
  },
]

const THUMB_TONES = [
  { from: BRAND.navy, to: BRAND.navyMid },
  { from: BRAND.navyMid, to: BRAND.sky },
  { from: BRAND.skyDark, to: BRAND.glow },
  { from: BRAND.navyDark, to: BRAND.navy },
  { from: '#1e3a6e', to: BRAND.goldDark },
]

function thumbTone(id) {
  let hash = 0
  for (const char of id) hash = (hash + char.charCodeAt(0)) % THUMB_TONES.length
  return THUMB_TONES[hash]
}

function VideoThumb({ video, height = 168, large = false }) {
  const tone = thumbTone(video.id)
  return (
    <Box
      sx={{
        position: 'relative',
        height,
        bgcolor: tone.from,
        backgroundImage: `linear-gradient(135deg, ${tone.from} 0%, ${tone.to} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Typography
        sx={{
          position: 'absolute',
          inset: 16,
          color: 'rgba(255,255,255,0.12)',
          fontWeight: 800,
          fontSize: large ? 42 : 28,
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          userSelect: 'none',
        }}
      >
        {video.title}
      </Typography>
      <PlayCircleFilledIcon
        sx={{
          fontSize: large ? 84 : 58,
          color: 'rgba(255,255,255,0.92)',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))',
          zIndex: 1,
        }}
      />
      <Chip
        size="small"
        label={video.duration}
        sx={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          bgcolor: 'rgba(0,0,0,0.72)',
          color: '#fff',
          fontWeight: 700,
          height: 22,
        }}
      />
    </Box>
  )
}

function VideoCard({ video, onOpen }) {
  return (
    <Paper
      component="button"
      onClick={() => onOpen(video)}
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        cursor: 'pointer',
        bgcolor: 'background.paper',
        p: 0,
        font: 'inherit',
        color: 'inherit',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: 2,
        },
      }}
    >
      <VideoThumb video={video} />
      <Box sx={{ p: 1.5 }}>
        <Chip size="small" variant="outlined" label={video.category} sx={{ mb: 0.75 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
          {video.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {video.description}
        </Typography>
      </Box>
    </Paper>
  )
}

export default function ResourcesPanel() {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [activeVideo, setActiveVideo] = useState(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return DUMMY_VIDEOS.filter((video) => {
      if (category !== 'All' && video.category !== category) return false
      if (!needle) return true
      return `${video.title} ${video.description} ${video.category}`.toLowerCase().includes(needle)
    })
  }, [category, query])

  const featured = filtered.filter((video) => video.featured)
  const rest = filtered.filter((video) => !video.featured)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <VideoLibraryIcon color="primary" />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5">Resources</Typography>
          <Typography variant="body2" color="text.secondary">
            Training videos for instructors. Sample titles for now — playback is a placeholder.
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label={`${DUMMY_VIDEOS.length} videos`} />
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {CATEGORIES.map((item) => (
          <Chip
            key={item}
            label={item}
            clickable
            color={category === item ? 'primary' : 'default'}
            variant={category === item ? 'filled' : 'outlined'}
            onClick={() => setCategory(item)}
          />
        ))}
        <TextField
          size="small"
          placeholder="Search training videos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ ml: { md: 'auto' }, minWidth: 240 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>

      {featured.length ? (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, letterSpacing: 0.4 }}>
            FEATURED
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {featured.map((video) => (
              <Paper
                key={video.id}
                component="button"
                onClick={() => setActiveVideo(video)}
                elevation={0}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'minmax(220px, 42%) 1fr' },
                  textAlign: 'left',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  p: 0,
                  font: 'inherit',
                  color: 'inherit',
                  bgcolor: 'background.paper',
                  '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                }}
              >
                <VideoThumb video={video} height={200} large />
                <Box sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Chip size="small" color="primary" label={video.category} sx={{ alignSelf: 'flex-start' }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {video.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {video.description}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 'auto' }}>
                    <PlayArrowIcon fontSize="small" color="primary" />
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {video.duration} · Watch
                    </Typography>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      ) : null}

      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, letterSpacing: 0.4 }}>
          {category === 'All' ? 'ALL VIDEOS' : category.toUpperCase()}
        </Typography>
        {filtered.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">No videos match that search.</Typography>
          </Paper>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                lg: 'repeat(3, 1fr)',
              },
              gap: 2,
            }}
          >
            {(featured.length ? rest : filtered).map((video) => (
              <VideoCard key={video.id} video={video} onOpen={setActiveVideo} />
            ))}
          </Box>
        )}
      </Box>

      <Dialog
        open={Boolean(activeVideo)}
        onClose={() => setActiveVideo(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{activeVideo?.title}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          {activeVideo ? (
            <>
              <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
                <VideoThumb video={activeVideo} height={280} large />
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={activeVideo.category} />
                <Chip size="small" variant="outlined" label={activeVideo.duration} />
                <Chip size="small" color="warning" variant="outlined" label="Sample" />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {activeVideo.description} Video playback is not wired yet — this card is a stand-in
                so the library layout can be reviewed.
              </Typography>
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveVideo(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
