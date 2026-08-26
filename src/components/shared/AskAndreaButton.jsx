/**
 * AI helper button used when generating word sets, sentences, and passages.
 */
import { Button, CircularProgress, Tooltip } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

export const ASK_ANDREA_TOOLTIP = 'Andrea is our AI helper.'

export default function AskAndreaButton({
  onClick,
  disabled = false,
  size = 'small',
  variant = 'contained',
  color = 'secondary',
  loading = false,
  children = 'Ask Andrea',
  tooltip = ASK_ANDREA_TOOLTIP,
  ...buttonProps
}) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <Button
          size={size}
          variant={variant}
          color={color}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
          onClick={onClick}
          disabled={disabled || loading}
          {...buttonProps}
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  )
}
