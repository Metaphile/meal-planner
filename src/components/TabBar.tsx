import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const tabs: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/plan',
    label: 'Plan',
    icon: (
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    ),
  },
  {
    to: '/recipes',
    label: 'Recipes',
    icon: (
      <path
        d="M6 4h9a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 5h6M9 13h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: '/meals',
    label: 'Meals',
    // Fork + spoon. Fork = three tines + head bar + stem (so the middle tine
    // is explicit). Spoon = an elliptical bowl (rounded on all sides) + handle.
    icon: (
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3v4M8 3v4M11 3v4" />
        <path d="M5 7h6" />
        <path d="M8 7v13" />
        <ellipse cx="16" cy="7" rx="3" ry="4" />
        <path d="M16 11v9" />
      </g>
    ),
  },
]

export function TabBar() {
  return (
    <nav
      className="flex shrink-0 border-t border-border bg-surface"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
              isActive ? 'font-semibold text-brand' : 'font-normal text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={isActive ? 2.4 : 2}
                className={`h-6 w-6 transition-transform duration-200 ease-out ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
              >
                {tab.icon}
              </svg>
              {tab.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
