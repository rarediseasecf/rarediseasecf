import { faCheck } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface Step {
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number // 0-indexed
}

export default function StepIndicator({
  steps,
  currentStep,
}: StepIndicatorProps) {
  return (
    <nav className="step-indicator" aria-label="Form progress">
      <ol className="step-indicator__list">
        {steps.map((step, idx) => {
          const status =
            idx < currentStep
              ? 'complete'
              : idx === currentStep
                ? 'active'
                : 'upcoming'
          return (
            <li
              key={idx}
              className={`step-indicator__step step-indicator__step--${status}`}
              aria-current={status === 'active' ? 'step' : undefined}
            >
              <span className="step-indicator__number" aria-hidden="true">
                {status === 'complete' ? (
                  <FaIcon icon={faCheck} size="sm" />
                ) : (
                  idx + 1
                )}
              </span>
              <span className="step-indicator__label">{step.label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
