/**
 * Data Quality dictionary hover card: classic entry plus tagged OG concepts.
 */
import { memo, type ReactNode } from 'react'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import { Box, Divider, Stack, Tooltip, Typography } from '@mui/material'
import { parseDictionaryData, type DictionaryData, type TaggedConcept } from '../../lib/dictionaryData'
import ConceptChip from '../content/ConceptTooltip'

type DictionaryWordTooltipProps = {
  word?: string
  dictionaryData?: DictionaryData | unknown | null
  taggedConcepts?: TaggedConcept[]
  children: ReactNode
}

const tooltipSx = {
  bgcolor: '#f7f4ee',
  color: '#1c1917',
  maxWidth: 420,
  p: 2,
  borderRadius: 1.5,
  border: '1px solid rgba(28, 25, 23, 0.14)',
  boxShadow: '0 10px 28px rgba(28, 25, 23, 0.16)',
}

export function DictionaryEntryCard({
  word,
  data,
  taggedConcepts = [],
  conceptTooltip = true,
}: {
  word: string
  data: DictionaryData
  taggedConcepts?: TaggedConcept[]
  conceptTooltip?: boolean
}) {
  const concepts = (taggedConcepts ?? []).filter((concept) => String(concept?.concept ?? '').trim())

  return (
    <Stack spacing={1} sx={{ minWidth: 240 }}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
          <Typography
            component="span"
            sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: 0.2, fontFamily: 'Segoe UI, system-ui, sans-serif' }}
          >
            {word}
          </Typography>
          <Typography component="span" sx={{ color: 'rgba(28, 25, 23, 0.62)', fontSize: '0.92rem' }}>
            {data.syllabication}
          </Typography>
          <Typography
            component="span"
            sx={{ fontFamily: 'Georgia, Times New Roman, serif', fontSize: '0.9rem', color: 'rgba(28, 25, 23, 0.78)' }}
          >
            [{data.ipa}]
          </Typography>
        </Stack>
        <Typography sx={{ fontStyle: 'italic', color: 'rgba(28, 25, 23, 0.72)', fontSize: '0.85rem', mt: 0.25 }}>
          {data.partOfSpeech}
        </Typography>
      </Box>

      <Box component="ol" sx={{ m: 0, pl: 2.25 }}>
        {data.definitions.map((definition, index) => (
          <Typography
            key={`${index}-${definition}`}
            component="li"
            sx={{ fontSize: '0.9rem', lineHeight: 1.45, mb: 0.4 }}
          >
            {definition}
          </Typography>
        ))}
      </Box>

      {data.exampleSentence ? (
        <Typography sx={{ fontStyle: 'italic', fontSize: '0.86rem', color: 'rgba(28, 25, 23, 0.78)' }}>
          {data.exampleSentence}
        </Typography>
      ) : null}

      {data.etymology ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(28, 25, 23, 0.62)', lineHeight: 1.4 }}>
          {data.etymology}
        </Typography>
      ) : null}

      <Divider sx={{ borderColor: 'rgba(28, 25, 23, 0.14)' }} />

      <Box>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', mb: 0.75 }}>
          Tagged Concepts
        </Typography>
        {concepts.length ? (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {concepts.map((concept, index) => (
              <ConceptChip
                key={concept.id || `${concept.concept}-${index}`}
                concept={concept}
                tooltip={conceptTooltip}
                variant="outlined"
                sx={{
                  height: 22,
                  bgcolor: 'transparent',
                  borderColor: 'rgba(28, 25, 23, 0.28)',
                  color: '#1c1917',
                  '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
                }}
              />
            ))}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(28, 25, 23, 0.55)' }}>None tagged</Typography>
        )}
      </Box>
    </Stack>
  )
}

function DictionaryWordTooltip({
  word,
  dictionaryData,
  taggedConcepts = [],
  children,
}: DictionaryWordTooltipProps) {
  const data = parseDictionaryData(dictionaryData)
  const label = String(word ?? '').trim()
  if (!data || !label) return children

  return (
    <Tooltip
      arrow
      placement="right-start"
      enterDelay={250}
      leaveDelay={120}
      describeChild
      title={<DictionaryEntryCard word={label} data={data} taggedConcepts={taggedConcepts} conceptTooltip={false} />}
      slotProps={{
        tooltip: { sx: tooltipSx },
        arrow: { sx: { color: '#f7f4ee' } },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          minWidth: 0,
          borderBottom: '1px dotted rgba(28, 25, 23, 0.45)',
          cursor: 'help',
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

const MemoDictionaryWordTooltip = memo(DictionaryWordTooltip)
export default MemoDictionaryWordTooltip

export const DictionaryWordCell = memo(function DictionaryWordCell({
  word,
  dictionaryData,
  taggedConcepts = [],
}: {
  word?: string
  dictionaryData?: DictionaryData | unknown | null
  taggedConcepts?: TaggedConcept[]
}) {
  const data = parseDictionaryData(dictionaryData)
  const label = String(word ?? '').trim()
  const content = (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, py: 0.25 }}>
      {data ? (
        <AutoStoriesIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} aria-hidden />
      ) : null}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </Box>
    </Stack>
  )

  if (!data) return content
  return (
    <MemoDictionaryWordTooltip word={label} dictionaryData={data} taggedConcepts={taggedConcepts}>
      {content}
    </MemoDictionaryWordTooltip>
  )
})
