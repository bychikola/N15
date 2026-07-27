import type { FC, ReactNode } from 'react'

interface OrnamentBorderProps {
  children: ReactNode
  cornerOrnament?: boolean
  className?: string
}

export const OrnamentBorder: FC<OrnamentBorderProps> = ({
  children,
  cornerOrnament = false,
  className = '',
}) => {
  return (
    <div
      className={`relative border border-[var(--n15-gold)]/20 transition-all duration-400 ease-out
        hover:border-[var(--n15-gold)]/50 hover:shadow-[0_0_30px_rgba(200,164,78,0.06)]
        ${className}`}
    >
      {cornerOrnament && (
        <>
          {/* Top-left solar quarter */}
          <svg
            className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M0 8 Q8 8 8 0" stroke="#C8A44E" strokeWidth="1" opacity="0.6" />
            <circle cx="8" cy="8" r="1.5" fill="#C8A44E" opacity="0.6" />
          </svg>
          {/* Top-right solar quarter */}
          <svg
            className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M16 8 Q8 8 8 0" stroke="#C8A44E" strokeWidth="1" opacity="0.6" />
            <circle cx="8" cy="8" r="1.5" fill="#C8A44E" opacity="0.6" />
          </svg>
          {/* Bottom-left solar quarter */}
          <svg
            className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M0 8 Q8 8 8 16" stroke="#C8A44E" strokeWidth="1" opacity="0.6" />
            <circle cx="8" cy="8" r="1.5" fill="#C8A44E" opacity="0.6" />
          </svg>
          {/* Bottom-right solar quarter */}
          <svg
            className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M16 8 Q8 8 8 16" stroke="#C8A44E" strokeWidth="1" opacity="0.6" />
            <circle cx="8" cy="8" r="1.5" fill="#C8A44E" opacity="0.6" />
          </svg>
        </>
      )}
      {children}
    </div>
  )
}
