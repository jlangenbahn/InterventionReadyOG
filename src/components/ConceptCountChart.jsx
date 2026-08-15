import { Box, Chip, Paper, Stack, Typography } from '@mui/material'

const BAR_COLORS = ['#0f4c5c', '#1b6b7a', '#3d8b99', '#e36414', '#7aadb8', '#c45c26']

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 100)}%`
}

export default function ConceptCountChart({
  rows = [],
  totalTokens = 0,
  title = 'Concept count',
  emptyLabel = 'No catalog concepts found in this text yet.',
  maxBars = 12,
  compact = false,
  caption,
}) {
  const visible = (rows ?? []).slice(0, maxBars)
  const hiddenCount = Math.max(0, (rows ?? []).length - visible.length)
  const maxCount = Math.max(totalTokens, ...visible.map((row) => row.count || 0), 1)
  const barHeight = compact ? 10 : 18

  return (
    <Paper variant="outlined" sx={{ p: compact ? 1.25 : 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: compact ? 0.75 : 1.5 }} spacing={1}>
        <Typography variant={compact ? 'subtitle2' : 'subtitle1'}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {caption || (totalTokens ? `${totalTokens} words` : 'No words yet')}
        </Typography>
      </Stack>
      {!visible.length ? (
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      ) : (
        <Stack spacing={compact ? 0.6 : 1.25}>
          {visible.map((row, index) => {
            const width = `${Math.max(4, ((row.count || 0) / maxCount) * 100)}%`
            const color = BAR_COLORS[index % BAR_COLORS.length]
            return (
              <Box key={row.id || row.name || index}>
                <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.25 }}>
                  <Typography variant="caption" noWrap title={row.name} sx={{ fontWeight: 600 }}>
                    {row.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {row.count}/{totalTokens || row.count} ({formatPercent(row.percentOfTokens)})
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    height: barHeight,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      width,
                      height: '100%',
                      bgcolor: color,
                      borderRadius: 1,
                      transition: 'width 200ms ease',
                    }}
                  />
                </Box>
              </Box>
            )
          })}
          {hiddenCount ? (
            <Chip size="small" variant="outlined" label={`${hiddenCount} more`} />
          ) : null}
        </Stack>
      )}
    </Paper>
  )
}
