/**
 * Reusable DataGrid used inside the create-lesson stepper.
 */
import { useMemo } from 'react'
import { Box, Chip, IconButton, Stack, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { BRAND } from '../../theme'

function limitIds(ids, maxCount) {
  const unique = []
  for (const id of ids ?? []) {
    if (!id || unique.includes(id)) continue
    unique.push(id)
    if (unique.length >= maxCount) break
  }
  return unique
}

function idsFromSelectionModel(model) {
  if (!model) return []
  if (model instanceof Set) return [...model]
  if (Array.isArray(model)) return model.filter(Boolean)
  if (model.ids instanceof Set) return [...model.ids]
  if (Array.isArray(model.ids)) return model.ids.filter(Boolean)
  return []
}

function mergeLimitedIds(previousIds, nextIds, maxCount) {
  const incoming = new Set(nextIds ?? [])
  const merged = []
  for (const id of previousIds ?? []) {
    if (!incoming.has(id) || merged.includes(id)) continue
    merged.push(id)
    if (merged.length >= maxCount) return merged
  }
  for (const id of nextIds ?? []) {
    if (merged.includes(id)) continue
    merged.push(id)
    if (merged.length >= maxCount) break
  }
  return merged
}

export default function StepperSelectionGrid({
  items = [],
  columns = [],
  selectedIds = [],
  onChange,
  maxCount = 1,
  loading = false,
  noRowsLabel,
  excludeIds = [],
  getItemLabel,
  getItemClassName,
  getChipSx,
  gridSx,
  header = null,
  onDeleteItem,
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const atMax = selectedIds.length >= maxCount
  const checkboxSelection = maxCount > 1

  const rows = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item?.id && !excluded.has(item.id))
        .map((item) => {
          const row = { id: item.id, selected: selectedSet.has(item.id) }
          for (const column of columns) {
            if (column.field && column.field in item) row[column.field] = item[column.field]
          }
          return row
        }),
    [items, columns, excluded, selectedSet],
  )

  const itemsById = useMemo(() => {
    const map = new Map()
    for (const item of items ?? []) {
      if (item?.id) map.set(item.id, item)
    }
    return map
  }, [items])

  const selectionModel = useMemo(
    () => ({
      type: 'include',
      ids: selectedSet,
    }),
    [selectedSet],
  )

  function toggleId(id) {
    if (!id) return
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((value) => value !== id))
      return
    }
    if (maxCount <= 1) {
      onChange([id])
      return
    }
    if (atMax) return
    onChange(limitIds([...selectedIds, id], maxCount))
  }

  function handleRowClick(params, event) {
    if (checkboxSelection) return
    if (event?.target?.closest?.('button')) return
    toggleId(params.id)
  }

  function handleSelectionModelChange(model) {
    if (!checkboxSelection) return
    onChange(mergeLimitedIds(selectedIds, idsFromSelectionModel(model), maxCount))
  }

  function removeId(id) {
    onChange(selectedIds.filter((value) => value !== id))
  }

  const gridColumns = useMemo(() => {
    if (!onDeleteItem) return columns
    return [
      ...columns,
      {
        field: 'actions',
        headerName: '',
        width: 52,
        minWidth: 52,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        resizable: false,
        renderCell: (params) => (
          <IconButton
            size="small"
            aria-label="Delete"
            onClick={(event) => {
              event.stopPropagation()
              const item = itemsById.get(params.id)
              if (item) onDeleteItem(item)
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        ),
      },
    ]
  }, [columns, onDeleteItem, itemsById])

  return (
    <Box>
      {header ? <Box sx={{ mb: 1 }}>{header}</Box> : null}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1, minHeight: 32 }}>
        {selectedIds.length ? (
          selectedIds.map((id) => {
            const item = itemsById.get(id)
            const label = item && getItemLabel ? getItemLabel(item) : id
            return (
              <Chip
                key={id}
                size="small"
                label={label}
                onDelete={() => removeId(id)}
                sx={item && getChipSx ? getChipSx(item) : undefined}
              />
            )
          })
        ) : (
          <Typography variant="body2" color="text.secondary">
            {checkboxSelection
              ? `Check up to ${maxCount} rows to select them. Uncheck a row to remove it.`
              : maxCount <= 1
                ? 'Click a row to select it. Click again to remove it.'
              : `Click up to ${maxCount} rows to select them. Click a selected row to remove it.`}
          </Typography>
        )}
      </Stack>
      <Box sx={{ height: 280, width: '100%' }}>
        <DataGridPro
          rows={rows}
          columns={gridColumns}
          getRowId={(row) => row.id}
          checkboxSelection={checkboxSelection}
          disableRowSelectionExcludeModel={checkboxSelection}
          disableMultipleRowSelection={!checkboxSelection}
          disableRowSelectionOnClick
          hideFooterSelectedRowCount={checkboxSelection}
          rowSelectionModel={selectionModel}
          onRowSelectionModelChange={handleSelectionModelChange}
          onRowClick={handleRowClick}
          isRowSelectable={(params) => selectedSet.has(params.id) || !atMax}
          getRowClassName={(params) => {
            const item = itemsById.get(params.id)
            const slotClass = item && getItemClassName ? getItemClassName(item) : ''
            return [
              selectedSet.has(params.id) ? 'Mui-selected stepper-selected-row' : '',
              slotClass,
              atMax && !selectedSet.has(params.id) ? 'stepper-row-disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')
          }}
          loading={loading}
          pagination
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
            pinnedColumns: onDeleteItem ? { right: ['actions'] } : undefined,
          }}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true },
          }}
          density="compact"
          localeText={{
            noRowsLabel: noRowsLabel || 'No rows',
          }}
          sx={[
            {
              '& .MuiDataGrid-row': {
                cursor: checkboxSelection ? 'default' : 'pointer',
              },
              '& .stepper-selected-row': {
                bgcolor: 'action.selected',
              },
              '& .stepper-row-disabled': {
                opacity: 0.45,
                cursor: 'not-allowed',
              },
            },
            gridSx,
            (theme) =>
              theme.palette.mode === 'dark'
                ? {
                    '& .MuiDataGrid-row.Mui-selected, & .stepper-selected-row': {
                      bgcolor: `${BRAND.navyMid} !important`,
                      color: '#ffffff !important',
                      '&:hover': { bgcolor: `${BRAND.navy} !important` },
                      '& .MuiDataGrid-cell': {
                        bgcolor: 'transparent !important',
                        color: '#ffffff !important',
                      },
                      '& .MuiCheckbox-root': { color: '#ffffff' },
                    },
                  }
                : {},
          ]}
        />
      </Box>
    </Box>
  )
}
