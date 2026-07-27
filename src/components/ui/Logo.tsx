import type { FC } from 'react'
import Link from 'next/link'

interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export const Logo: FC<LogoProps> = ({ size = 40, showText = true, className = '' }) => {
  return (
    <Link href="/" className={`flex items-center gap-3 group ${className}`}>
      {/* Solar rosette icon — чистый вектор */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 transition-transform duration-500 group-hover:scale-105"
        style={{ color: 'var(--n15-gold)' }}
      >
        {/* Outer ring */}
        <circle cx="256" cy="256" r="240" stroke="currentColor" strokeWidth="8" />
        {/* Middle ring */}
        <circle cx="256" cy="256" r="200" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        {/* Inner ring */}
        <circle cx="256" cy="256" r="80" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        {/* Solar cross */}
        <line x1="256" y1="16" x2="256" y2="496" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <line x1="16" y1="256" x2="496" y2="256" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <line x1="86" y1="86" x2="426" y2="426" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <line x1="426" y1="86" x2="86" y2="426" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        {/* Ornamental dots at cardinal points */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180
          const cx = 256 + 220 * Math.cos(rad)
          const cy = 256 + 220 * Math.sin(rad)
          return <circle key={angle} cx={cx} cy={cy} r="10" fill="currentColor" />
        })}
        {/* Center dot */}
        <circle cx="256" cy="256" r="24" fill="currentColor" />
      </svg>
      {showText && (
        <span className="text-xl tracking-[0.25em] font-bold text-[var(--n15-white)]" style={{ fontFamily: 'Inter, sans-serif' }}>
          N15
        </span>
      )}
    </Link>
  )
}
