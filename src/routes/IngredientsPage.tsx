import { useLayoutEffect, useRef } from 'react'
import { DAY, load, num, onLeave, save, type Slice } from '../lib/uiState'
import { PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import { useWantedIngredients } from '../store/selectors'
import { AddOnsList } from '../components/AddOnsList'
import { useAuth } from '../auth/AuthProvider'
import { WantBoxPicture } from '../components/ListCard'
import { ReconcileButton } from '../components/Reconcile'

/**
 * Ingredients: everything the wanted recipes call for (each as many times
 * over as it's wanted), added up — on a notepad sheet (read only; recipes
 * are wanted, and how many times, on their cards). Then Add-ons: anything
 * else wanted, written in by hand.
 */
/** How far down the page was, kept on the device: back from another tab,
 *  or the app opened again (discarded meanwhile, or a new version put in
 *  place), it's where it was. */
const SCROLL: Slice<number> = {
  key: 'ingredients-scroll',
  version: 1,
  maxAgeMs: DAY,
  parse: (x) => num(x) ?? null,
}

export default function IngredientsPage() {
  const ingredients = useWantedIngredients()
  const { canWrite } = useAuth()
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const sc = scrollRef.current!
    const to = load(SCROLL) ?? 0
    // (Its lists may still be filling in: tried again for a moment, till
    // there's that far to go — or something's been scrolled by hand.)
    let tries = 0
    let raf = 0
    const restore = () => {
      if (sc.scrollHeight - sc.clientHeight >= to || tries++ > 30) {
        sc.scrollTop = to
        return
      }
      raf = requestAnimationFrame(restore)
    }
    if (to > 0) restore()
    let at = to
    const onScroll = () => {
      at = sc.scrollTop
    }
    const stopRestoring = () => cancelAnimationFrame(raf)
    sc.addEventListener('scroll', onScroll, { passive: true })
    sc.addEventListener('touchstart', stopRestoring, { passive: true })
    sc.addEventListener('wheel', stopRestoring, { passive: true })
    const keep = () => save(SCROLL, at)
    const stop = onLeave(keep)
    return () => {
      cancelAnimationFrame(raf)
      sc.removeEventListener('scroll', onScroll)
      sc.removeEventListener('touchstart', stopRestoring)
      sc.removeEventListener('wheel', stopRestoring)
      stop()
      keep()
    }
  }, [])
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ingredients" />
      <div ref={scrollRef} className="scroll-y flex-1 px-4 pt-3 pb-6">
        <IngredientsList
          ingredients={ingredients}
          checkable
          canEdit={canWrite}
          empty={
            <>
              Tick <WantBoxPicture /> to include that recipe’s ingredients.
            </>
          }
        />

        {/* Add-ons: anything else, jotted on a sheet of its own, behind a
            divider tab. */}
        <div className="relative mt-7 h-[30px]">
          <span className="paper-serif absolute bottom-[-1px] left-[18px] z-[1] rounded-t-lg border border-b-0 border-kraft-edge bg-kraft px-3 pt-1 pb-[5px] text-sm font-semibold text-kraft-ink">
            Add-ons
          </span>
        </div>
        <div className="kraft-pocket rounded-tl-none p-2">
          <AddOnsList canEdit={canWrite} />
        </div>
        <ReconcileButton ingredients={ingredients} canEdit={canWrite} />
      </div>
    </div>
  )
}
