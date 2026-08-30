/**
 * Left-nav section header (Home, Schedule, Students, Groups).
 * Expand/collapse, select, and optional "+" add action.
 */
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

export default function NavSectionHeader({
  title,
  expanded = true,
  onToggleExpand,
  onAdd,
  addLabel,
  addDisabled = false,
  addDisabledReason = '',
  selected = false,
  onSelect,
  icon = null,
}) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        bgcolor: selected ? 'action.selected' : 'transparent',
      }}
    >
      <IconButton
        size="small"
        aria-label={
          onToggleExpand
            ? expanded
              ? `Collapse ${title}`
              : `Expand ${title}`
            : `Open ${title}`
        }
        onClick={onToggleExpand ?? onSelect}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 120ms',
          }}
        />
      </IconButton>
      <Box
        onClick={onSelect ?? onToggleExpand}
        sx={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
          cursor: onSelect || onToggleExpand ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {icon}
        <Typography variant="subtitle1" sx={{ py: 0.5 }}>
          {title}
        </Typography>
      </Box>
      {onAdd ? (
        <Tooltip title={addDisabled ? addDisabledReason || addLabel : addLabel}>
          <span>
            <IconButton
              color="primary"
              size="small"
              aria-label={addLabel}
              onClick={onAdd}
              disabled={addDisabled}
            >
              <AddIcon />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
    </Box>
  )
}
