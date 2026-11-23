import { useEffect, type ReactNode } from 'react'

/** A page's title, in serif ink on the counter, with an optional action. */
export function PageHeader({
  title,
  action,
  back,
}: {
  title: string
  action?: ReactNode
  /** Before the title: a way back (e.g. to the recipe box). */
  back?: ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 bg-counter px-4 pt-2.5 pb-2 text-ink">
      <div className="flex min-w-0 items-center gap-1">
        {back}
        <h1 className="paper-serif min-w-0 truncate text-[27px] font-semibold leading-9 tracking-[0.2px]">
          {title}
        </h1>
      </div>
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
      <p className="paper-serif text-lg font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-soft">{hint}</p>}
      {action}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  autoFocus,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`rounded-full border border-accent-edge bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition active:scale-95 disabled:opacity-40 ${className}`}
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
      className={`rounded-full border border-paper-edge-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      autoComplete="off"
      {...props}
      className={`w-full rounded-lg border border-paper-edge bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-accent-edge focus:outline-none ${
        props.className ?? ''
      }`}
    />
  )
}

/**
 * Centered confirmation modal. Backdrop tap or Escape cancels.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  saveLabel,
  onSave,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** A third way out, the one to take by default (e.g. Save, beside
   *  Discard). */
  saveLabel?: string
  onSave?: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim px-4"
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
        <div className="mt-2 text-sm text-ink-soft">{message}</div>
        {/* The confirming (destructive) button always on the far left,
            apart from the others. */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            autoFocus={!onSave}
            className="whitespace-nowrap rounded-full bg-danger px-4 py-2 text-sm font-semibold text-on-danger transition active:scale-95"
          >
            {confirmLabel}
          </button>
          <span className="flex-1" />
          <GhostButton onClick={onCancel} className="whitespace-nowrap">
            {cancelLabel}
          </GhostButton>
          {onSave && (
            <PrimaryButton onClick={onSave} autoFocus className="whitespace-nowrap">
              {saveLabel}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  )
}
