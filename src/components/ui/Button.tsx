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
    backgroundColor: '#C8A44E',
    color: '#0D0D0F',
    fontWeight: 500,
  },
  secondary: {
    backgroundColor: '#1A1A1E',
    color: '#F5F5F7',
    border: '1px solid rgba(200, 164, 78, 0.3)',
  },
  outline: {
    backgroundColor: 'transparent',
    color: '#C8A44E',
    border: '1px solid rgba(200, 164, 78, 0.4)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#C8C8CC',
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
