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
      <div
        className="flex-shrink-0 transition-transform duration-500 group-hover:scale-105"
        style={{
          width: size,
          height: size,
          backgroundColor: 'var(--n15-gold)',
          WebkitMask: `url(/logo.png) no-repeat center / contain`,
          mask: `url(/logo.png) no-repeat center / contain`,
        }}
      />
      {showText && (
        <span className="text-xl tracking-[0.3em] font-[family-name:var(--font-display)] text-[var(--n15-white)]">
          N15
        </span>
      )}
    </Link>
  )
}
