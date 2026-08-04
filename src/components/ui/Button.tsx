import { type ButtonHTMLAttributes, type FC } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  href?: string
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--n15-gold)',
    color: 'var(--on-accent)',
    fontWeight: 500,
  },
  secondary: {
    backgroundColor: 'var(--n15-charcoal)',
    color: 'var(--n15-white)',
    border: '1px solid color-mix(in srgb, var(--n15-gold) 30%, transparent)',
  },
  outline: {
    backgroundColor: 'transparent',
    color: 'var(--n15-gold)',
    border: '1px solid color-mix(in srgb, var(--n15-gold) 40%, transparent)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--n15-silver)',
  },
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-sm transition-all duration-300 ease-out tracking-wider uppercase'

export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  href,
  style,
  ...props
}) => {
  const mergedStyle = { ...variantStyles[variant], ...style }

  const classes = `${baseClasses} btn-${variant} ${sizeClasses[size]} ${className}`.trim()

  if (href) {
    return (
      <a href={href} className={classes} style={mergedStyle}>
        {children}
      </a>
    )
  }

  return (
    <button className={classes} style={mergedStyle} {...props}>
      {children}
    </button>
  )
}
