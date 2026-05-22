# ARCHITECTURE.md — Health Coach (Musculation)

> Dernière mise à jour : mai 2026

---

## 1. Vue d'ensemble

Application mobile-first (PWA) de coaching musculation personnalisé.
Elle génère un programme d'entraînement adapté à l'équipement disponible et au nombre de jours/semaine.
L'utilisateur suit ses séances via un carnet intégré (poids/reps par série), peut signaler des douleurs pendant l'exercice, et reçoit des routines de rééducation adaptées à ses conditions de santé.
Toutes les données sont stockées localement (IndexedDB via Dexie). Aucun backend.

**Stack** : Vite + React + TypeScript + Tailwind CSS + Dexie (IndexedDB) + React Router
**Déployé sur** : GitHub Pages (`/musculation` basename)

---

## 2. Les pages

| Page | Fichier | Rôle | Hooks principaux |
|---|---|---|---|
| **Onboarding** | `pages/OnboardingPage.tsx` | 5 étapes : profil, conditions santé, équipement, planning, validation. Bouton "Restaurer une sauvegarde" sur l'étape 1. | `useOnboarding` |
| **Home** | `pages/HomePage.tsx` | Écran principal. 5 états : no_program, editing_window (< 10h après séance), rehab_day (intercalé si conditions actives), session active (reprendre), ready (commencer). Carte rehab avec zones actives, champ cardio optionnel, bouton "Passer". | `useNextSession`, `useActiveSession` |
| **Session** | `pages/SessionPage.tsx` | Déroulement complet d'une séance : warmup → exercices → notebook (par exercice) → cooldown → done. Timer, persistence, swap d'exercice, skip avec questionnaire douleur. ~780 lignes, c'est le fichier le plus complexe. | `useSessionPersistence`, `useNotebook`, `useRestTimer` |
| **Dashboard** | `pages/DashboardPage.tsx` | Historique : graphique SVG de tonnage par séance (par intensité), liste des exercices avec tendance de poids (↑↓—), détail expandable des séries passées. | `useDashboardData` |
| **Rehab** | `pages/RehabPage.tsx` | Routine jour de repos. Exercices de rééducation sélectionnés par rotation intelligente. Section SA (spondylarthrite) séparée. Vidéo externe suggérée. Logging poids/reps, ou minuteur de tenue avec compteur de séries (X/N) pour les exercices chronométrés. ~590 lignes — carte d'exercice mutualisée `RehabExerciseCard` (utilisée pour la routine SA *et* le rehab classique). | — (queries Dexie directes) |
| **Calendar** | `pages/CalendarPage.tsx` | Vue mensuelle de l'activité. Chaque jour est coloré selon son statut : vert (séance muscu complétée), indigo (rehab fait), vide (rien — y compris rehab passé). Tap sur un jour avec activité → carte résumé (nom de séance, exercices, tonnage). Navigation mois précédent/suivant. | — (queries Dexie directes : `workoutSessions`, `notebookEntries` rehab) |
| **Profile** | `pages/ProfilePage.tsx` | Paramètres : infos utilisateur, jours/semaine, régénération programme, gestion conditions santé, gestion équipement, backup export/import, reset complet. Modal "Comment ça marche". | `useRegenerateProgram` |

### Routing

```
App.tsx :
  - Pas de profil → <OnboardingPage />
  - Profil existant → routes /session, /dashboard, /profile, /rehab, /calendar, / (Home)
  - basename="/musculation" (GitHub Pages)
```

### Composants partagés

| Composant | Rôle |
|---|---|
| `BottomNav.tsx` | Barre de navigation fixe en bas (Muscu, Rehab, Histo, Agenda, Profil). Indicateur vert si session active. |
| `ExerciseNotebook.tsx` | Carnet d'exercice : saisie poids/reps, timer de repos, warmup sets automatiques, swap exercice, skip avec QCM douleur, note persistante. |
| `SymptomQuestionnaire.tsx` | QCM douleur affiché au skip. Identifie la condition et crée automatiquement une HealthCondition. |
| `BackupSection.tsx` | Export/import JSON dans la page Profil. |
| `HealthConditionsManager.tsx` | CRUD conditions de santé. |
| `EquipmentManager.tsx` | Sélection équipement (page Profil) — délègue à `EquipmentPicker`, gère la régénération du programme. |
| `equipment/EquipmentPicker.tsx` | Sélecteur d'équipement partagé : phase 1 = choix du contexte (🏠 Maison / 🌳 Street Workout / 🏋️ Salle / ⚙️ Home Gym), phase 2 = affinage des tags. Utilisé par l'onboarding (StepGymEquipment) et le Profil. |

---

## 3. L'engine

### 3a. Génération de programme (`engine/program-generator.ts` — 1829 lignes)

**Entrée** : userId, conditions, equipment, daysPerWeek, minutesPerSession, excludeExerciseIds?
**Sortie** : `GeneratedProgram` (name, type, sessions[])

**Logique de sélection du split :**
| Jours/semaine | Split | Séances |
|---|---|---|
| 2-3 | Full Body | A (Force), B (Volume), C (Modéré si 3j) |
| 4 | Upper/Lower | Lower1 (Force), Upper1 (Force), Lower2 (Volume), Upper2 (Volume) |
| 5-6 | Push/Pull/Legs | Push A/B, Pull A/B, Legs A/B (Force + Volume) |

**Cas spéciaux :**
- **Spondylarthrite ankylosante** (détectée dans les conditions) → programme SA fixe 2 séances, machines uniquement, volume only
- **Aucun matériel de force** (équipement vide, ou uniquement des accessoires — tapis, élastique, rouleau — ou du cardio) → programme poids de corps (3 séances)

**Système DUP** (Daily Undulating Periodization) : les séances alternent entre Force (6 reps, 120s repos), Volume (12-15 reps, 90s repos), et Modéré.

**Slot system** : chaque séance est définie par des `ExerciseSlot[]` avec label, candidates (filtres musculaires), preferredName, sets/reps/rest. `buildStructuredSession` pioche les exercices du catalogue et applique les ajustements d'intensité. Le nombre de slots est fixe par séance (6-8), pas de time budget. Si le pool d'un slot est vide (exercices filtrés par le matériel), un **fallback** pioche un exercice non-rehab inutilisé (compound en priorité) — la séance garde son nombre d'exercices au lieu d'être tronquée.

**Slots fixes par séance :**
| Séance | Slots |
|---|---|
| FB A (Force) | 6 : quad, push H, pull H, push V, pull V, ischios |
| FB B (Volume) | 7 : quad uni, push V, pull V, chest acc, fessiers, biceps, triceps |
| FB C (Modéré) | 6 : uni legs, incline push, uni pull, latérales, ischios iso, core |
| Lower Force | 7 : quad, uni leg, hinge, leg ext, leg curl, hip thrust, core |
| Upper Force | 6 : push H, pull H, push V, pull V, biceps, triceps |
| Lower Volume | 7 : quad uni, hip thrust, quad compound, leg ext, leg curl, calf, core |
| Upper Volume | 8 : pull V, incliné, uni pull, écarté pecs, latérales, face pull, biceps, triceps |
| Push A/B | 6 chacun |
| Pull A/B | 6 chacun |
| Legs A (Force) | 7 (avec core) |
| Legs B (Volume) | 6 (sans core) |

**Remplacement d'exercice (swap)** : dans `SessionPage.tsx`, le champ `alternatives` de chaque exercice du catalogue est utilisé pour proposer des swaps (exercices rehab exclus du swap). Le swap modifie directement le `WorkoutProgram` en DB (permanent) et reste en phase `notebook` pour préserver le timer de repos.

### 3b. Warmup (`engine/warmup.ts`)

Calcule des sets d'échauffement progressifs basés sur le poids de travail : paliers à 0%, 40%, 60%, 80% du poids cible.

### 3c. Cooldown (`engine/cooldown.ts`)

Sélectionne 2-3 exercices de mobilité du catalogue dont les muscles primaires matchent ceux travaillés en séance.

### 3d. Filler (`engine/filler.ts`)

Suggestions d'exercices de mobilité pendant l'attente (machine occupée). Évite les conflits musculaires avec l'exercice en cours.

### 3e. Rest day / Rehab (`engine/rest-day.ts`)

Génère une routine de rééducation à partir des `rehabProtocols` matchant les conditions actives. Rotation intelligente (`utils/rehab-rotation.ts`) : priorité par type d'exercice (warmup > stretch > foam rolling), historique en Dexie (`rehabHistory`), max 5 exercices + 2 bonus si zone accentuée (skip récent).

### 3f. Cycle de progression (`hooks/useNextSession.ts`)

Cycle normal : A → B → C → A. Si l'utilisateur a des `healthConditions` actives, un jour rehab est intercalé : A → **Rehab** → B → **Rehab** → C → **Rehab** → A. Le rehab est considéré fait dès qu'une `notebookEntry` avec `sessionIntensity === 'rehab'` existe depuis la dernière séance complétée (que ce soit un rehab complet ou un skip).

---

## 4. La DB (Dexie — IndexedDB)

Base : `HealthCoachDB`, actuellement version 6.

| Table | Clé | Rôle | Indexée sur |
|---|---|---|---|
| `userProfiles` | `++id` | Profil utilisateur (nom, daysPerWeek, minutesPerSession) | name |
| `healthConditions` | `++id` | Conditions de santé actives (zone, diagnostic, notes) | userId, bodyZone, isActive |
| `gymEquipment` | `++id` | Équipement disponible (name = tag machine, type, isAvailable) | userId, type, isAvailable |
| `exercises` | `++id` | Catalogue d'exercices (seed au démarrage). ~130 exercices. | name, category, isRehab, *primaryMuscles, *tags |
| `workoutPrograms` | `++id` | Programme généré (sessions avec exerciseId, sets, reps, rest). Un seul actif à la fois. | userId, isActive |
| `workoutSessions` | `++id` | Sessions complétées (log de séance avec exercices faits/skippés) | userId, programId, startedAt, completedAt |
| `exerciseNotes` | `++id` | Notes persistantes par exercice ("garder les coudes serrés") | userId, exerciseId, [userId+exerciseId] |
| `notebookEntries` | `++id` | Carnet : séries (weightKg, reps) par exercice et par date. Intensité de session incluse. | userId, exerciseId, date, [userId+exerciseId], sessionIntensity |
| `painReports` | `++id` | Rapports de douleur (zone, exercice skippé, jours d'accentuation rehab restants) | userId, zone, date, [userId+zone] |
| `activeSession` | `id` (singleton, toujours 1) | État de session en cours (phase, exercice actuel, statuts, draft sets, timer). Expire après 12h. | — |
| `rehabHistory` | `++id` | Historique de rotation des exercices rehab (exerciseName, doneAt). Unique sur exerciseName. | &exerciseName, doneAt |

**Tables supprimées** (migrations) : `availableWeights` (v3), `exerciseProgress`, `painLogs`, `trainingPhases` (v4).

---

## 5. Les hooks

| Hook | Fichier | Ce qu'il fait | Ce qu'il retourne |
|---|---|---|---|
| `useOnboarding` | `hooks/useOnboarding.ts` | Machine à états pour le flow d'onboarding (5 étapes). Gère le state local body/conditions/equipment/schedule. `submit()` crée le profil + conditions + equipment + génère le programme. | `{ state, totalSteps, nextStep, prevStep, updateBody, updateConditions, updateEquipment, updateSchedule, submit }` |
| `useNextSession` | `hooks/useNextSession.ts` | Détermine la prochaine séance à faire. Calcule l'index (cycle), le temps de repos, le deload reminder (> 5 sessions), le preview, la fenêtre d'édition (10h). Intercale un jour rehab si conditions actives. | `NextSessionInfo` — status ('ready' / 'editing_window' / 'no_program' / 'rehab_day'), preview, estimatedMinutes, deloadReminder, activeZones |
| `useActiveSession` | `hooks/useActiveSession.ts` | Lit le singleton `activeSession` en DB. Retourne `null` si absent ou expiré (> 12h). | `ActiveSessionState | null` |
| `useSessionPersistence` | `hooks/useSessionPersistence.ts` | Save/load/clear de l'état de session dans la table `activeSession`. Save débounce à 500ms. Expiration 12h. | `{ saveSessionState, saveSessionStateImmediate, loadSessionState, clearSessionState }` |
| `useNotebook` | `hooks/useNotebook.ts` | Gère le carnet d'un exercice : sets en cours, historique (3 dernières), save (upsert NotebookEntry), skip (crée PainReport + optionnellement HealthCondition via QCM). Détection de PR poids par intensité. `lastWeight` filtré par même intensité. Progression bodyweight (+1 set si tous ≥ 20 reps). | `{ currentSets, history, lastWeight, isSaving, addSet, updateSet, removeLastSet, saveAndNext, skipExercise }` |
| `useExerciseNote` | `hooks/useExerciseNote.ts` | CRUD pour les notes persistantes par exercice. | `{ note, update, save, isDirty }` |
| `useRestTimer` | `hooks/useRestTimer.ts` | Timer de repos entre séries. Wall-clock (survit au background iOS). Son (oscillator 880Hz) + vibration à la fin. Pause/resume/reset. | `{ remaining, isRunning, endTime, start, pause, reset, formatTime }` |
| `useDashboardData` | `hooks/useDashboardData.ts` | Agrège les NotebookEntries pour le dashboard : historique par exercice (trend, best/current weight), tonnage par jour de session, intensité dominante. | `DashboardData` — exercises[], sessionVolumes[], hasData, isLoading |
| `useRegenerateProgram` | `hooks/useRegenerateProgram.ts` | Régénère le programme (désactive l'ancien, crée le nouveau). `refresh()` exclut les exercices actuels pour obtenir des variations. | `{ regenerate, refresh, isRegenerating }` |

---

## 6. Les data files

| Fichier | Lignes | Contenu |
|---|---|---|
| `data/exercises.ts` | ~3430 | Catalogue complet (~135 exercices). Compound, isolation, rehab, mobility, core. Chaque exercice : muscles, equipment, contraindications, alternatives, instructions FR, tags. Inclut variantes hip thrust (barre, haltère, smith, élastique) et glute bridge. |
| `data/rehab-protocols.ts` | 2230 | Protocoles de rééducation par condition (golf elbow, tendinite rotulienne, SA, canal carpien, etc.). Chaque protocole : zone cible, exercices avec sets/reps/intensité/notes, fréquence, critères de progression. |
| `data/symptom-questions.ts` | 1035 | QCM de diagnostic par zone. Questions avec options et indicateurs de condition. Mappings condition → protocole rehab. |
| `data/equipment-options.ts` | ~90 | Liste des équipements sélectionnables (machines, poids libres, accessoires, cardio). Tags pour matcher avec `equipmentNeeded` des exercices. `TAG_TYPES` mappe tag → type. |
| `data/equipment-contexts.ts` | ~95 | Les 4 contextes d'équipement (base tags + options d'affinage) consommés par `EquipmentPicker`. |
| `data/warmup-routine.ts` | 25 | Routine d'échauffement fixe (17 exercices avec haltères légères/barre à vide). |
| `data/seed.ts` | 13 | Idempotent : peuple la table `exercises` au démarrage si vide. |

---

## 7. Design system

Thème sombre, mobile-first, Tailwind v4. Pas de fichier de tokens central : les classes récurrentes sont déclarées en constantes en tête de chaque page (`CTA`, `CARD`, `CTA_SECONDARY`, `SECTION_LABEL`…).

### Tokens visuels

| Élément | Classe de référence |
|---|---|
| Fond de l'app | `bg-zinc-950` (`#09090b`) |
| Carte | `bg-zinc-900 border border-zinc-800 rounded-2xl` |
| Champ de saisie | `bg-zinc-800 border border-zinc-700 rounded-xl` |
| Bouton principal (CTA) | `w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200` |
| Bouton secondaire | idem CTA + `border border-zinc-700 text-zinc-300` (sans fond plein) |
| Label de section | `text-zinc-600 text-xs uppercase tracking-wider` |
| Titre de page | `text-2xl font-black text-white` |
| Coche / état sélectionné | fond `bg-emerald-500`, icône blanche |
| Spinner de chargement | `w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin` |

**Accent** : `emerald-500`. **Intensités** : Force → `indigo`, Volume → `emerald`, Modéré → `amber`. **Sémantique** : avertissement / zone sensible → `amber` ; danger / skip → `red`.

**Animations** (définies dans `index.css`) : `fadeIn`, `scaleIn`, `slideIn`, `slideUp`.

### État de migration (refactor UX mai 2026)

Migration terminée pour tous les composants (mai 2026, 255/255 tests verts) : les 6 pages, `BottomNav`, les 4 étapes d'onboarding, `BackupSection`, `ExerciseNotebook`, `SymptomQuestionnaire`, `HealthConditionsManager` et `EquipmentManager`. Restent quelques détails cosmétiques — voir §8.

---

## 8. Ce qui est cassé / incomplet

### Bugs potentiels

1. **`saveAndNext` n'appelle pas `onNext()`** — Dans `useNotebook.ts`, `onNext` est dans les dépendances du useCallback mais n'est jamais appelé dans le corps de `saveAndNext`. C'est `ExerciseNotebook.tsx` qui appelle manuellement `onNext` après `saveAndNext()`, donc ça marche — mais c'est fragile.

2. **`onFileChange` dans `BackupSection` ne gère pas le reload post-import** — L'import remplace tout le profil, mais le composant `BackupSection` reçoit toujours l'ancien `userId` en prop jusqu'au re-render parent. Le `useLiveQuery` devrait rattraper.

3. **Seed + Import = exercices dupliqués** — `seedExercises()` ne fait rien si `count > 0`, mais l'import backup fait un `clear()` puis `bulkAdd()`. Au prochain lancement, `seedExercises()` re-seed si le backup n'incluait pas d'exercices (ancien backup v1/v2). Pas un vrai bug en v4 mais attention avec les vieux backups.

4. **Tonnage dashboard inclut les rehab** — `useDashboardData` filtre `sessionIntensity !== 'rehab'` uniquement pour l'intensité dominante, mais le tonnage inclut TOUTES les entrées (y compris rehab à 0kg). Impact mineur.

### Incomplet

5. **Pas de modification du profil** — On peut voir ses infos dans ProfilePage mais pas les modifier (nom, sexe). Seuls `daysPerWeek` est modifiable.

6. **Pas de suppression de PainReport** — Les `accentDaysRemaining` sont décrémentés en RehabPage lors d'une sauvegarde, mais il n'y a pas de mécanisme pour supprimer les anciens rapports. Ils s'accumulent indéfiniment.

7. **Pas de PWA offline complète** — Le `manifest.webmanifest` et le service worker existent dans `dist/` mais pas de stratégie de cache configurée dans le code source. Le SW est auto-généré par le plugin Vite PWA.

8. **~~Timer de repos perdu au swap~~** — Corrigé : le swap reste en phase `notebook` (pas d'unmount).

### Dette technique

9. **SessionPage.tsx trop gros** — ~780 lignes avec `SessionRunner`, `DoneScreen`, `ElapsedTimer`, `SessionErrorBoundary` — devrait être découpé en sous-composants.

10. **Pas de test pour ExerciseNotebook** — Le composant le plus complexe de l'app n'a aucun test unitaire.

### Détails cosmétiques (non bloquants)

Titre de `HomePage` en `text-3xl` (les autres pages : `text-2xl`) ; `CTA_SECONDARY` de `ProfilePage` en `py-3.5` (ailleurs : `py-4`) ; cercle de confirmation en `w-16` sur l'onboarding mais `w-20` ailleurs ; la table des couleurs d'intensité est redéfinie dans plusieurs fichiers.

### Corrigés (mai 2026)

- ~~`/Healthcare` hardcodé~~ → renommé `/musculation` partout (vite.config, App.tsx)
- ~~`WorkoutSession.exercises` toujours vide~~ → `handleFinishSession` lit les `notebookEntries` récentes et peuple les `SessionSet[]`
- ~~Rehab rotation en localStorage~~ → migré dans table Dexie `rehabHistory` (v6), couvert par backup
- ~~`exerciseId=0` sur les exos rehab~~ → résolution par nom dans le catalogue + dashboard groupe par `exerciseName`
- ~~Redirect cassé au reset~~ → utilise `import.meta.env.BASE_URL`
- ~~`minutesPerSession` ignoré~~ → supprimé le time budget, slots fixes par séance (6-8)
- ~~Timer de repos perdu au swap~~ → swap reste en phase `notebook`, pas d'unmount
- ~~Badge "Rehab" sur exercices normaux après swap~~ → swap exclut les exercices rehab + nettoyage des alternatives
- ~~Historique notebook sans distinction d'intensité~~ → 3 dernières entrées, poids pré-rempli par même intensité, PR par intensité
- ~~Champs height/weight/age inutilisés~~ → supprimés du profil, onboarding, backup
- Ajout du cycle rehab intercalé (A → Rehab → B → Rehab → C) pour les utilisateurs avec conditions actives
- Ajout de Hip thrust haltère et Hip thrust élastique au catalogue, Glute bridge accessible dans les slots fessiers
- Refactor UX des 6 pages sur le nouveau design system (§7) — 255/255 tests verts
- ~~RehabPage.tsx trop gros (~910 lignes, duplication SA / rehab classique)~~ → carte mutualisée `RehabExerciseCard` + `VideoCheckbox` + factory `makeUpdater` pour les deux états de log, ~590 lignes
- ~~5 composants en ancien style (ExerciseNotebook, SymptomQuestionnaire, StepHealthConditions, HealthConditionsManager, EquipmentManager)~~ → migrés sur le design system ; tutoiement + accents harmonisés sur les composants Santé / Équipement
- ~~6 erreurs de build (`const` inutilisées dans program-generator.ts et OnboardingPage.tsx)~~ → supprimées, `npm run build` OK
- ~~Keyframe `slideUp` absente~~ → ajoutée à `index.css` ; la modale "Comment ça marche" glisse depuis le bas
- ~~`SymptomQuestionnaire` vouvoyait~~ → passé au tutoiement, accents retirés (cohérent avec toute l'app)
- ~~Champ `sex` du profil~~ → supprimé (non utilisé par l'engine) : retiré de `UserProfile`, onboarding (StepBody), ProfilePage, backup. Pas de migration DB (`sex` n'était pas indexé)
- ~~Séances tronquées (3-4 exercices au lieu de 6-7) pour les profils à matériel limité~~ → un slot sans candidat était silencieusement abandonné. Corrigé en 2 temps : (A) routage bodyweight élargi — accessoires seuls → programme poids de corps ; (B) fallback de slot dans `buildStructuredSession` pour les profils à matériel partiel
- ~~RehabPage : exercices chronométrés jamais détectés~~ → `isTimeBased` testait la regex `/^\d+s$/` (« 30s ») alors que les protocoles stockent « 30 sec » → détection morte. Corrigé : champ `durationSeconds` ajouté sur ~57 exercices de `rehab-protocols.ts` (+ `RehabExercise` / `RestDayExercise`), détection basée sur ce champ, et minuteur de tenue (réutilise `useRestTimer`) dans `RehabExerciseCard`
