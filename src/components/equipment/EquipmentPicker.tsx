import {
  type ContextId,
  EQUIPMENT_CONTEXTS,
  contextById,
  defaultTagsForContext,
} from '../../data/equipment-contexts'
import { tagsForOption, type EquipmentOption } from '../../data/equipment-options'

// ---------------------------------------------------------------------------
// Shared equipment picker — context selection (phase 1) + refinement (phase 2).
// Used by the onboarding step and the profile settings. Fully controlled:
// the parent owns phase / context / the selected tags.
// ---------------------------------------------------------------------------

interface Props {
  phase: 'context' | 'refine'
  setPhase: (p: 'context' | 'refine') => void
  contextId: ContextId | null
  setContextId: (id: ContextId) => void
  /** Currently selected equipment tags. */
  selectedTags: string[]
  /** Called with the full new tag list whenever the selection changes. */
  onChange: (tags: string[]) => void
  /** Surface tone — 'base' on a dark page, 'card' inside a zinc-900 card. */
  tone?: 'base' | 'card'
}

export default function EquipmentPicker({
  phase,
  setPhase,
  contextId,
  setContextId,
  selectedTags,
  onChange,
  tone = 'base',
}: Props) {
  const surface = tone === 'card' ? 'bg-zinc-800' : 'bg-zinc-900'
  const borderOff = tone === 'card' ? 'border-zinc-700' : 'border-zinc-800'
  const borderOn = tone === 'card' ? 'border-emerald-500/40' : 'border-emerald-500/30'
  const checkOff = tone === 'card' ? 'border-zinc-600' : 'border-zinc-700'

  // --- Phase 1: context picker ---
  if (phase === 'context' || contextId === null) {
    return (
      <div className="space-y-3">
        {EQUIPMENT_CONTEXTS.map((ctx) => (
          <button
            key={ctx.id}
            type="button"
            onClick={() => {
              setContextId(ctx.id)
              onChange(defaultTagsForContext(ctx))
              setPhase('refine')
            }}
            className={`w-full flex items-center gap-4 ${surface} border ${borderOff} rounded-2xl p-4 text-left active:scale-[0.98] transition-all duration-150`}
          >
            <span className="text-3xl flex-shrink-0">{ctx.emoji}</span>
            <div className="min-w-0">
              <p className="text-white font-bold">{ctx.label}</p>
              <p className="text-zinc-500 text-sm">{ctx.description}</p>
            </div>
          </button>
        ))}
      </div>
    )
  }

  // --- Phase 2: refinement ---
  const ctx = contextById(contextId)
  const selected = new Set(selectedTags)

  const isOn = (opt: EquipmentOption) => tagsForOption(opt).every((t) => selected.has(t))

  const toggle = (opt: EquipmentOption) => {
    const next = new Set(selected)
    const optTags = tagsForOption(opt)
    if (optTags.every((t) => next.has(t))) {
      optTags.forEach((t) => next.delete(t))
    } else {
      optTags.forEach((t) => next.add(t))
    }
    // The context's base tags stay locked-on.
    ctx.baseTags.forEach((t) => next.add(t))
    onChange([...next])
  }

  return (
    <div className="space-y-4">
      {/* Context header */}
      <div className="flex items-center justify-between">
        <p className="text-white font-semibold">{ctx.emoji} {ctx.label}</p>
        <button
          type="button"
          onClick={() => setPhase('context')}
          className="text-zinc-500 text-sm active:text-zinc-300 transition-colors"
        >
          Changer
        </button>
      </div>

      {ctx.baseLabel && (
        <p className="text-zinc-600 text-xs">Inclus : {ctx.baseLabel}</p>
      )}

      {/* Refinement checklist */}
      {ctx.refine.map((cat, ci) => (
        <div key={ci}>
          {cat.title && (
            <h3 className="text-zinc-600 text-xs uppercase tracking-wider mb-2">{cat.title}</h3>
          )}
          <div className="space-y-1.5">
            {cat.items.map((opt) => {
              const on = isOn(opt)
              return (
                <button
                  key={opt.tag}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left border active:scale-[0.98] transition-all duration-150 ${surface} ${
                    on ? `${borderOn} text-white` : `${borderOff} text-zinc-500`
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      on ? 'bg-emerald-500 border-emerald-500' : checkOff
                    }`}
                  >
                    {on && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
