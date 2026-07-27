import type { FC } from 'react'

type OrnamentVariant = 'solar' | 'woven' | 'simple'

interface OrnamentDividerProps {
  variant?: OrnamentVariant
  className?: string
}

const SolarPattern = () => (
  <svg
    width="100%"
    height="32"
    viewBox="0 0 1200 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
  >
    <line
      x1="0"
      y1="16"
      x2="1200"
      y2="16"
      stroke="url(#goldGradient)"
      strokeWidth="1"
      strokeDasharray="4 8"
    />
    <circle cx="600" cy="16" r="6" stroke="url(#goldGradient)" strokeWidth="1" />
    <circle cx="600" cy="16" r="2" fill="url(#goldGradient)" />
    <line x1="560" y1="16" x2="570" y2="16" stroke="url(#goldGradient)" strokeWidth="0.5" />
    <line x1="630" y1="16" x2="640" y2="16" stroke="url(#goldGradient)" strokeWidth="0.5" />
    <defs>
      <linearGradient id="goldGradient" x1="0" y1="0" x2="1200" y2="0">
        <stop offset="0%" stopColor="#C8A44E" stopOpacity="0" />
        <stop offset="20%" stopColor="#C8A44E" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#C8A44E" stopOpacity="1" />
        <stop offset="80%" stopColor="#C8A44E" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#C8A44E" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
)

const WovenPattern = () => (
  <svg
    width="100%"
    height="24"
    viewBox="0 0 1200 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
  >
    <pattern id="woven" x="0" y="0" width="48" height="24" patternUnits="userSpaceOnUse">
      <path d="M0 12 L12 0 L24 12 L36 0 L48 12" stroke="#C8A44E" strokeWidth="0.5" fill="none" opacity="0.3" />
      <path d="M0 12 L12 24 L24 12 L36 24 L48 12" stroke="#C8A44E" strokeWidth="0.5" fill="none" opacity="0.3" />
    </pattern>
    <rect x="0" y="0" width="1200" height="24" fill="url(#woven)" />
  </svg>
)

const SimplePattern = () => (
  <div className="n15-gold-divider" />
)

export const OrnamentDivider: FC<OrnamentDividerProps> = ({
  variant = 'simple',
  className = '',
}) => {
  const Pattern = {
    solar: SolarPattern,
    woven: WovenPattern,
    simple: SimplePattern,
  }[variant]

  return (
    <div className={`my-16 ${className}`}>
      <Pattern />
    </div>
  )
}
