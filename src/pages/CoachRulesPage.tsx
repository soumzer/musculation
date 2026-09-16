import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { getCoachProgramDef } from '../data/coach-program'

const CARD = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-5'

/**
 * Règles du programme coach actif — page de relecture, zéro suivi.
 * Contenu dans data/coach-program.ts (`rules` de chaque programme).
 */
export default function CoachRulesPage() {
  const navigate = useNavigate()
  const activeProgram = useLiveQuery(async () => {
    const user = await db.userProfiles.toCollection().first()
    if (!user?.id) return undefined
    return db.workoutPrograms.where('userId').equals(user.id).and((p) => p.isActive).first()
  })
  const def = getCoachProgramDef(activeProgram?.coachId)

  return (
    <div className="flex flex-col h-[var(--content-h)] overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-sm mb-1">{def.name}</p>
            <h1 className="text-2xl font-black text-white">Règles du programme</h1>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="text-zinc-500 text-sm active:text-zinc-300 transition-colors py-2 pl-3"
          >
            Fermer
          </button>
        </div>

        {def.rules.map((section) => (
          <section key={section.title} className={CARD + ' space-y-3'}>
            <h2 className="text-white font-bold">{section.title}</h2>

            {section.items && (
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                    <span className="text-emerald-400 flex-shrink-0">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.table && (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-600 text-xs uppercase tracking-wider">
                      <th className="text-left font-medium pb-1.5 px-1">{section.table.head[0]}</th>
                      <th className="text-left font-medium pb-1.5 px-1">{section.table.head[1]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map(([a, b]) => (
                      <tr key={a} className="border-t border-zinc-800">
                        <td className="py-1.5 px-1 text-zinc-400 align-top whitespace-nowrap">{a}</td>
                        <td className="py-1.5 px-1 text-white">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {section.highlight && (
              <p className="text-amber-400 text-sm leading-relaxed border-l-2 border-amber-500/50 pl-3">
                {section.highlight}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
