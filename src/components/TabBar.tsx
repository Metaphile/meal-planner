import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const tabs: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/plan',
    label: 'Plan',
    icon: (
      <path d="M4 7h16M4 12h16M4 17h10" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  {
    to: '/recipes',
    label: 'Recipes',
    icon: (
      <path
        d="M6 4h9a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 5h6M9 13h6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: '/meals',
    label: 'Meals',
    icon: (
      <path
        d="M5 3v7a3 3 0 0 0 3 3m0-10v18M8 13v8M18 3c-2 0-3 2-3 5s1 5 3 5m0 0v8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: '/ingredients',
    label: 'Ingredients',
    icon: (
      <path
        d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Zm3 0V6a3 3 0 0 1 6 0v2"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
              isActive ? 'text-brand' : 'text-muted'
            }`
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="h-6 w-6"
          >
            {tab.icon}
          </svg>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
