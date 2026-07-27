import { type ButtonHTMLAttributes, type FC } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  href?: string
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--n15-gold)] text-[var(--n15-black)] hover:bg-[var(--n15-gold-light)] font-medium',
  secondary:
    'bg-[var(--n15-charcoal)] text-[var(--n15-white)] border border-[var(--n15-gold)]/30 hover:border-[var(--n15-gold)]/60',
  outline:
    'bg-transparent text-[var(--n15-gold)] border border-[var(--n15-gold)]/40 hover:bg-[var(--n15-gold)]/8',
  ghost:
    'bg-transparent text-[var(--n15-silver)] hover:text-[var(--n15-white)] hover:bg-[var(--n15-charcoal)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
}

export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  href,
  ...props
}) => {
  const classes = `
    inline-flex items-center justify-center gap-2 rounded-sm
    transition-all duration-300 ease-out
    tracking-wider uppercase
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${className}
  `.trim()

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
