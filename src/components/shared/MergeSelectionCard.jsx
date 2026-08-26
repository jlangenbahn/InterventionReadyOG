/**
 * Reusable card for assigning items into named slots (kept for stepper-style UIs).
 */
import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'

export default function MergeSelectionCard({
  title,
  helperText,
  slots,
  assignments,
  items,
  getItemLabel,
  columns,
  noRowsLabel,
  loading = false,
  onAssign,
  onClear,
}) {
  const [selectedId, setSelectedId] = useState(null)

  const itemsById = useMemo(() => {
    const map = new Map()
    for (const item of items ?? []) {
      if (item?.id) map.set(item.id, item)
    }
    return map
  }, [items])

  const columnFields = useMemo(
    () => new Set(['id', ...((columns ?? []).map((column) => column.field)), 'assignedTo']),
    [columns],
  )

  const rows = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item?.id)
        .map((item) => {
          const assignedTo = (slots ?? [])
            .filter((slot) => assignments?.[slot.key] === item.id)
            .map((slot) => slot.shortLabel)
            .join(', ')
          const row = { id: item.id, assignedTo }
          for (const field of columnFields) {
            if (field !== 'id' && field !== 'assignedTo' && field in item) {
              row[field] = item[field]
            }
          }
          return row
        }),
    [items, slots, assignments, columnFields],
  )

  const gridColumns = useMemo(
    () => [
      ...(columns ?? []),
      {
        field: 'assignedTo',
        headerName: 'Assigned',
        width: 110,
      },
    ],
    [columns],
  )

  function handleSlotClick(slotKey) {
    if (!selectedId) return
    onAssign(slotKey, selectedId)
  }

  return (
    <Card variant="outlined" sx={{ mb: 1.5, '@media print': { display: 'none' } }}>
      <CardHeader
        title={title}
        subheader={helperText}
        sx={{ pb: 0.5, '& .MuiCardHeader-title': { fontSize: 16 } }}
        titleTypographyProps={{ variant: 'h6' }}
        subheaderTypographyProps={{ variant: 'body2' }}
      />
      <CardContent sx={{ pt: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="stretch">
          <Stack spacing={0.75} sx={{ width: 168, flexShrink: 0 }}>
            {(slots ?? []).map((slot) => {
              const assignedId = assignments?.[slot.key] ?? null
              const assignedItem = assignedId ? itemsById.get(assignedId) : null
              const assignedLabel = assignedItem ? getItemLabel(assignedItem) : ''
              return (
                <Stack key={slot.key} direction="row" spacing={0.25} alignItems="flex-start">
                  <Button
                    fullWidth
                    size="small"
                    variant={assignedId ? 'contained' : 'outlined'}
                    color="primary"
                    onClick={() => handleSlotClick(slot.key)}
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      textTransform: 'none',
                      minHeight: 32,
                      px: 1,
                      py: 0.5,
                      lineHeight: 1.2,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <Box sx={{ minWidth: 0, width: '100%' }}>
                      <Box
                        sx={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {slot.label}
                      </Box>
                      {assignedLabel ? (
                        <Box
                          sx={{
                            fontSize: 10,
                            fontWeight: 500,
                            opacity: 0.85,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {assignedLabel}
                        </Box>
                      ) : null}
                    </Box>
                  </Button>
                  {assignedId ? (
                    <IconButton
                      size="small"
                      onClick={() => onClear(slot.key)}
                      aria-label={`Clear ${slot.label}`}
                      sx={{ p: 0.25, mt: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  ) : null}
                </Stack>
              )
            })}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0, height: 260 }}>
            <DataGridPro
              rows={rows}
              columns={gridColumns}
              getRowId={(row) => row.id}
              onRowClick={(params) => setSelectedId(params.id)}
              getRowClassName={(params) => {
                const assigned = (slots ?? []).some((slot) => assignments?.[slot.key] === params.id)
                const selected = params.id === selectedId
                return [assigned ? 'merge-assigned-row' : '', selected ? 'Mui-selected' : '']
                  .filter(Boolean)
                  .join(' ')
              }}
              loading={loading}
              pagination
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: { showQuickFilter: true },
              }}
              density="compact"
              localeText={{
                noRowsLabel: noRowsLabel || 'No rows',
              }}
              sx={{
                '& .merge-assigned-row': {
                  bgcolor: 'action.selected',
                },
              }}
            />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
