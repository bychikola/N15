import type { FC, ReactNode } from 'react'

type SectionVariant = 'dark' | 'charcoal' | 'pattern'
type OrnamentType = 'solar' | 'floral'

interface SectionWrapperProps {
  children: ReactNode
  variant?: SectionVariant
  ornament?: OrnamentType
  className?: string
  id?: string
}

const variantBg: Record<SectionVariant, string> = {
  dark: 'bg-[var(--n15-black)]',
  charcoal: 'bg-[var(--n15-charcoal)]',
  pattern: 'bg-[var(--n15-black)]',
}

export const SectionWrapper: FC<SectionWrapperProps> = ({
  children,
  variant = 'dark',
  ornament,
  className = '',
  id,
}) => {
  return (
    <section
      id={id}
      className={`relative overflow-hidden n15-section ${variantBg[variant]} ${className}`}
    >
      {/* Ornament background pattern */}
      {ornament === 'solar' && (
        <div
          className="absolute inset-0 pointer-events-none select-none"
          style={{ opacity: 0.03 }}
        >
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="solar-bg" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
                <circle cx="100" cy="100" r="80" stroke="#C8A44E" strokeWidth="0.5" fill="none" />
                <circle cx="100" cy="100" r="50" stroke="#C8A44E" strokeWidth="0.3" fill="none" />
                <circle cx="100" cy="100" r="20" stroke="#C8A44E" strokeWidth="0.3" fill="none" />
                <line x1="100" y1="20" x2="100" y2="180" stroke="#C8A44E" strokeWidth="0.2" />
                <line x1="20" y1="100" x2="180" y2="100" stroke="#C8A44E" strokeWidth="0.2" />
                <line x1="45" y1="45" x2="155" y2="155" stroke="#C8A44E" strokeWidth="0.2" />
                <line x1="155" y1="45" x2="45" y2="155" stroke="#C8A44E" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#solar-bg)" />
          </svg>
        </div>
      )}

      {ornament === 'floral' && (
        <div
          className="absolute inset-0 pointer-events-none select-none"
          style={{ opacity: 0.04 }}
        >
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="floral-bg" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <path
                  d="M60 20 Q70 40 60 60 Q50 40 60 20Z M60 100 Q70 80 60 60 Q50 80 60 100Z"
                  stroke="#C8A44E"
                  strokeWidth="0.5"
                  fill="none"
                />
                <path
                  d="M20 60 Q40 70 60 60 Q40 50 20 60Z M100 60 Q80 70 60 60 Q80 50 100 60Z"
                  stroke="#C8A44E"
                  strokeWidth="0.5"
                  fill="none"
                />
              </pattern>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#floral-bg)" />
          </svg>
        </div>
      )}

      <div className="n15-container relative z-10">
        {children}
      </div>
    </section>
  )
}
