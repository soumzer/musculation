import { useState, useMemo } from 'react'
import type { BodyZone } from '../../db/types'
import { bodyZoneLabels } from '../../constants/body-zones'
import {
  getQuestionsForZone,
  matchConditions,
  type SymptomQuestion,
  type ConditionMapping,
} from '../../data/symptom-questions'

interface SymptomQuestionnaireProps {
  zone: BodyZone
  onComplete: (result: QuestionnaireResult) => void
  onCancel: () => void
}

export interface QuestionnaireResult {
  zone: BodyZone
  conditionName: string
  protocolConditionName: string
  confidence: 'high' | 'medium' | 'low'
  indicators: string[]
}

interface QuestionState {
  questionId: string
  selectedOptions: string[]
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const CTA = 'w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 text-white active:scale-95 transition-all duration-200'
const CTA_BACK = 'flex-1 py-4 rounded-2xl font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 active:scale-95 transition-all duration-200'
const TEXT_BTN = 'w-full text-center text-sm text-zinc-500 py-2'

export default function SymptomQuestionnaire({
  zone,
  onComplete,
  onCancel,
}: SymptomQuestionnaireProps) {
  const questions = useMemo(() => getQuestionsForZone(zone), [zone])
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<QuestionState[]>([])
  const [showResults, setShowResults] = useState(false)

  const currentQuestion: SymptomQuestion | undefined = questions[currentStep]
  const isLastQuestion = currentStep === questions.length - 1
  const totalSteps = questions.length

  // Collect all indicators from answers
  const collectedIndicators = useMemo(() => {
    const indicators: string[] = []
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId)
      if (!question) continue
      for (const optionId of answer.selectedOptions) {
        const option = question.options.find(o => o.id === optionId)
        if (option) {
          indicators.push(...option.indicators)
        }
      }
    }
    return indicators
  }, [answers, questions])

  // Get matched conditions
  const matchedConditions = useMemo(() => {
    if (!showResults) return []
    return matchConditions(zone, collectedIndicators)
  }, [zone, collectedIndicators, showResults])

  const currentAnswer = answers.find(a => a.questionId === currentQuestion?.id)
  const selectedOptions = currentAnswer?.selectedOptions ?? []

  const handleOptionToggle = (optionId: string) => {
    if (!currentQuestion) return

    const existingAnswer = answers.find(a => a.questionId === currentQuestion.id)

    if (currentQuestion.multiSelect) {
      // Toggle option in multi-select
      const newSelected = existingAnswer?.selectedOptions.includes(optionId)
        ? existingAnswer.selectedOptions.filter(id => id !== optionId)
        : [...(existingAnswer?.selectedOptions ?? []), optionId]

      setAnswers(prev => {
        const filtered = prev.filter(a => a.questionId !== currentQuestion.id)
        return [...filtered, { questionId: currentQuestion.id, selectedOptions: newSelected }]
      })
    } else {
      // Single select - replace
      setAnswers(prev => {
        const filtered = prev.filter(a => a.questionId !== currentQuestion.id)
        return [...filtered, { questionId: currentQuestion.id, selectedOptions: [optionId] }]
      })
    }
  }

  const handleNext = () => {
    if (isLastQuestion) {
      setShowResults(true)
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (showResults) {
      setShowResults(false)
    } else if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    } else {
      onCancel()
    }
  }

  const handleSelectCondition = (condition: ConditionMapping, confidence: 'high' | 'medium' | 'low') => {
    onComplete({
      zone,
      conditionName: condition.conditionName,
      protocolConditionName: condition.protocolConditionName,
      confidence,
      indicators: collectedIndicators,
    })
  }

  const handleSkipToGeneric = () => {
    const zoneName = bodyZoneLabels[zone] ?? zone
    onComplete({
      zone,
      conditionName: `Douleur ${zoneName}`,
      protocolConditionName: '',
      confidence: 'low',
      indicators: collectedIndicators,
    })
  }

  // Show results screen
  if (showResults) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-black text-white">Resultat de l'analyse</h2>
        <p className="text-sm text-zinc-400">
          Base sur tes reponses, voici les conditions possibles :
        </p>

        {matchedConditions.length > 0 ? (
          <div className="space-y-3">
            {matchedConditions.slice(0, 5).map(({ condition, confidence }, index) => (
              <button
                key={`${condition.conditionName}-${index}`}
                type="button"
                onClick={() => handleSelectCondition(condition, confidence)}
                className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 active:scale-[0.98] transition-all duration-150"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{condition.conditionName}</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      confidence === 'high'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : confidence === 'medium'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {confidence === 'high'
                      ? 'Tres probable'
                      : confidence === 'medium'
                        ? 'Probable'
                        : 'Possible'}
                  </span>
                </div>
                {index === 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Appuie pour selectionner cette condition
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSkipToGeneric}
              className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 active:scale-[0.98] transition-all duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Douleur generale {bodyZoneLabels[zone] ?? zone}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">
                  General
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Appuie pour continuer avec un programme de rehab general
              </p>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleSkipToGeneric}
          className={TEXT_BTN}
        >
          Continuer sans diagnostic precis
        </button>

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={handleBack}
            className={CTA_BACK}
          >
            Modifier mes reponses
          </button>
        </div>
      </div>
    )
  }

  // No questions for this zone
  if (!currentQuestion) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-black text-white">Zone : {bodyZoneLabels[zone] ?? zone}</h2>
        <p className="text-sm text-zinc-400">
          Pas de questionnaire specifique pour cette zone.
        </p>
        <button
          type="button"
          onClick={handleSkipToGeneric}
          className={CTA}
        >
          Continuer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={TEXT_BTN}
        >
          Annuler
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{bodyZoneLabels[zone] ?? zone}</span>
        <span>
          Question {currentStep + 1} / {totalSteps}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Question */}
      <h2 className="text-lg font-bold text-white">{currentQuestion.question}</h2>

      {currentQuestion.multiSelect && (
        <p className="text-xs text-zinc-500">Plusieurs reponses possibles</p>
      )}

      {/* Options */}
      <div className="space-y-2">
        {currentQuestion.options.map(option => {
          const isSelected = selectedOptions.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionToggle(option.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border active:scale-[0.98] transition-all duration-150 ${
                isSelected
                  ? 'bg-zinc-900 border-emerald-500/40'
                  : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                  {option.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={handleBack}
          className={CTA_BACK}
        >
          {currentStep === 0 ? 'Annuler' : 'Retour'}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={selectedOptions.length === 0}
          className={`flex-1 py-4 rounded-2xl font-bold text-lg active:scale-95 transition-all duration-200 ${
            selectedOptions.length > 0
              ? 'bg-emerald-500 text-white'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {isLastQuestion ? 'Analyser' : 'Suivant'}
        </button>
      </div>

      {/* Skip option */}
      <button
        type="button"
        onClick={handleSkipToGeneric}
        className={TEXT_BTN}
      >
        Passer le questionnaire
      </button>
    </div>
  )
}
