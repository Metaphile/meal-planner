import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const tabs: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/plan',
    label: 'Meals',
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
    to: '/recipes-v2',
    label: 'Recipes v2',
    // A stack of index cards.
    icon: (
      <path
        d="M7 4h10M5.5 7h13M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: '/account',
    label: 'Account',
    icon: (
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
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
