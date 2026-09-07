import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from './Modal';
import QuestGameSearchStep from './QuestGameSearchStep';
import QuestCreateColumnStep from './QuestCreateColumnStep';
import { playingColumnId, completionColumnId } from '../services/boardService';

// Quests 1 (#9), 2 (#10), 3 (#11) and 4 (#12) are all real, rendered below. This shell only owns
// pagination, progress, skip and the completion flag.
const QUESTS = [
  { title: '¿A qué estás jugando?' },
  { title: '¿Has completado algo últimamente?' },
  { title: '¿Algo que quieras jugar en el futuro?' },
  { title: 'Make it yours' },
];

const QuestOnboarding = ({ isOpen, onComplete, boardActions, boardData, onOpenCreateColumn, canCreateColumn }) => {
  // Unmounted while closed, so its step state never needs resetting explicitly: the next
  // time it opens, React mounts a fresh instance starting at quest 1 — never persists the
  // in-progress step, closing mid-way (browser close, reload before the flag is written)
  // means it starts over next time, by design.
  if (!isOpen) return null;
  return (
    <QuestOnboardingSteps
      onComplete={onComplete}
      boardActions={boardActions}
      boardData={boardData}
      onOpenCreateColumn={onOpenCreateColumn}
      canCreateColumn={canCreateColumn}
    />
  );
};

const QuestOnboardingSteps = ({ onComplete, boardActions, boardData, onOpenCreateColumn, canCreateColumn }) => {
  const [stepIndex, setStepIndex] = useState(0);

  const isLastStep = stepIndex === QUESTS.length - 1;
  const currentQuest = QUESTS[stepIndex];

  const advance = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleSkip = advance;

  return (
    <Modal isOpen={true} title="Your Quest Log" preventClose={true}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <Sparkles size={18} />
            <span className="text-xs font-bold uppercase tracking-wide">
              Quest {stepIndex + 1} of {QUESTS.length}
            </span>
          </div>
          <div className="flex gap-1.5">
            {QUESTS.map((quest, index) => (
              <div
                key={quest.title}
                className={`h-1.5 w-8 rounded-full transition-colors ${index <= stepIndex ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
              />
            ))}
          </div>
        </div>

        {stepIndex === 0 ? (
          <div className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-xl p-6">
            <QuestGameSearchStep
              key={stepIndex}
              title={currentQuest.title}
              description={'The "Currently Playing" column is what you\'re playing right now — track a game there so you (and friends who follow you) can see it at a glance.'}
              targetColumnId={playingColumnId(boardData) || boardData?.columnOrder?.[0]}
              addGameToBoard={boardActions?.addGameToBoard}
              onSelect={advance}
            />
          </div>
        ) : stepIndex === 1 ? (
          <div className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-xl p-6">
            <QuestGameSearchStep
              key={stepIndex}
              title={currentQuest.title}
              description={'"Victory Road" is where finished games go — drop one there to mark it complete and add it to your progression.'}
              targetColumnId={completionColumnId(boardData) || boardData?.columnOrder?.[0]}
              addGameToBoard={boardActions?.addGameToBoard}
              onSelect={advance}
            />
          </div>
        ) : stepIndex === 2 ? (
          <div className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-xl p-6">
            <QuestGameSearchStep
              key={stepIndex}
              title={currentQuest.title}
              description={'"To Play" is your backlog — save a game there to keep track of what\'s next.'}
              targetColumnId={boardData?.columnOrder?.[0]}
              addGameToBoard={boardActions?.addGameToBoard}
              onSelect={advance}
            />
          </div>
        ) : (
          <div className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-xl p-6">
            <QuestCreateColumnStep
              title={currentQuest.title}
              onOpenCreateColumn={onOpenCreateColumn}
              canCreateColumn={canCreateColumn}
            />
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            {isLastStep ? 'Finish' : 'Skip'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default QuestOnboarding;
