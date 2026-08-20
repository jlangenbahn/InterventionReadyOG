import { IconButton, Tooltip } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'

export default function HelpTip({ title }) {
  if (!title) return null
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label="More information" sx={{ color: 'text.secondary', p: 0.25 }}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}
