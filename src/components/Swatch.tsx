interface SwatchProps {
  color: string
  label: string
  size?: 'small' | 'medium' | 'large'
}

export function Swatch({ color, label, size = 'medium' }: SwatchProps) {
  return (
    <span
      className={`swatch swatch--${size}`}
      style={{ backgroundColor: color }}
      role="img"
      aria-label={`${label} 색상`}
    />
  )
}
