/**
 * Parchment hover card for a catalog concept (mirrors DictionaryWordTooltip).
 */
import { Box, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material'

const tooltipSx = {
  bgcolor: '#f7f4ee',
  color: '#1c1917',
  maxWidth: 420,
  p: 2,
  borderRadius: 1.5,
  border: '1px solid rgba(28, 25, 23, 0.14)',
  boxShadow: '0 10px 28px rgba(28, 25, 23, 0.16)',
}

const labelSx = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  mb: 0.5,
}

export function ConceptEntryCard({ concept }) {
  const name = String(concept?.concept ?? '').trim() || 'Untitled concept'
  const meta = [concept?.category, concept?.subcategory].filter(Boolean).join(' · ')
  const level = String(concept?.level ?? '').trim()
  const ogDescription = String(concept?.ogDescription ?? '').trim()
  const definition = String(concept?.definition ?? '').trim()

  return (
    <Stack spacing={1} sx={{ minWidth: 240 }}>
      <Stack spacing={0.25}>
        <Typography
          component="span"
          sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: 0.2, fontFamily: 'Segoe UI, system-ui, sans-serif' }}
        >
          {name}
        </Typography>
        {meta ? (
          <Typography sx={{ color: 'rgba(28, 25, 23, 0.62)', fontSize: '0.85rem' }}>
            {meta}
          </Typography>
        ) : null}
        {level ? (
          <Chip
            size="small"
            label={`Level ${level}`}
            sx={{
              alignSelf: 'flex-start',
              mt: 0.5,
              height: 22,
              bgcolor: 'transparent',
              border: '1px solid rgba(28, 25, 23, 0.28)',
              color: '#1c1917',
              '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
            }}
          />
        ) : null}
      </Stack>

      <Divider sx={{ borderColor: 'rgba(28, 25, 23, 0.14)' }} />

      <Stack spacing={0.5}>
        <Typography sx={labelSx}>OG description</Typography>
        <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
          {ogDescription || 'No OG description yet.'}
        </Typography>
      </Stack>

      {definition ? (
        <Stack spacing={0.5}>
          <Typography sx={labelSx}>Definition</Typography>
          <Typography sx={{ fontSize: '0.86rem', lineHeight: 1.45, color: 'rgba(28, 25, 23, 0.78)' }}>
            {definition}
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  )
}

export default function ConceptChip({ concept, tooltip = true, ...chipProps }) {
  const label = String(concept?.concept ?? '').trim() || 'Untitled'
  const chip = <Chip size="small" label={label} {...chipProps} />
  if (!tooltip) return chip

  return (
    <Tooltip
      arrow
      placement="top-start"
      enterDelay={250}
      leaveDelay={120}
      describeChild
      title={<ConceptEntryCard concept={concept} />}
      slotProps={{
        tooltip: { sx: tooltipSx },
        arrow: { sx: { color: '#f7f4ee' } },
        popper: { sx: { zIndex: 2000 } },
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}>
        {chip}
      </Box>
    </Tooltip>
  )
}
