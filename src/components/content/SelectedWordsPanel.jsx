/**
 * Sticky sidebar of currently selected word-list words (e.g. Random 10).
 */
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { wordRowId } from '../../lib/wordSelection'

export default function SelectedWordsPanel({
  words = [],
  onRemove,
  title = 'Selected words',
  emptyLabel = 'No words selected yet. Use Random 10, Ask Andrea, or check rows in the grid.',
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        minWidth: 0,
        height: { xs: 220, md: '100%' },
        maxHeight: { md: 'calc(100vh - 220px)' },
        position: { md: 'sticky' },
        top: { md: 8 },
        overflow: 'auto',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle2">{title}</Typography>
        <Chip size="small" variant="outlined" label={`${words.length}`} />
      </Stack>
      {words.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {words.map((row, index) => {
            const label = typeof row === 'string' ? row : row?.word || ''
            const key = wordRowId(row) || `${label}-${index}`
            return (
              <Chip
                key={key}
                size="small"
                label={label}
                onDelete={onRemove ? () => onRemove(row) : undefined}
                sx={{ justifyContent: 'space-between', width: '100%' }}
              />
            )
          })}
        </Box>
      )}
    </Paper>
  )
}
