import { useEffect, type ReactNode } from 'react'

/** A page's title, in serif ink on the counter, with an optional action. */
export function PageHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 bg-backdrop px-4 pt-2.5 pb-2 text-ink">
      <h1 className="paper-serif min-w-0 truncate text-[27px] font-semibold leading-9 tracking-[0.2px]">
        {title}
      </h1>
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
      <p className="paper-serif text-lg font-semibold text-text">{title}</p>
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
      className={`rounded-full border border-kraft-edge bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition active:scale-95 disabled:opacity-40 ${className}`}
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
      className={`rounded-full border border-[#d8cdb6] bg-surface px-4 py-2 text-sm font-medium text-text transition active:scale-95 ${className}`}
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
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted/60 focus:border-kraft-edge focus:outline-none ${
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

/**
 * Centered confirmation modal. Backdrop tap or Escape cancels.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="paper-card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="paper-serif text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
