import type { ReactNode } from 'react'

export function PageHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
      <h1 className="text-lg font-semibold">{title}</h1>
      {action}
    </header>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-base font-medium text-text">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition active:scale-95 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-border px-4 py-2 text-sm font-medium text-text transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  )
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted/60 focus:border-brand focus:outline-none ${
        props.className ?? ''
      }`}
    />
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
      {children}
    </span>
  )
}
