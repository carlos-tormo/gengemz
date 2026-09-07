import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from './Modal';
import QuestGameSearchStep from './QuestGameSearchStep';
import { playingColumnId } from '../services/boardService';

// Placeholder content — issues #10-#12 replace quests 2-4's title/description/interaction.
// Quest 1 (#9) is real, rendered via QuestGameSearchStep below. This shell only owns
// pagination, progress, skip and the completion flag.
const QUESTS = [
  { title: '¿A qué estás jugando?' },
  { title: 'Quest 2', description: 'Coming soon.' },
  { title: 'Quest 3', description: 'Coming soon.' },
  { title: 'Quest 4', description: 'Coming soon.' },
];

const QuestOnboarding = ({ isOpen, onComplete, boardActions, boardData }) => {
  // Unmounted while closed, so its step state never needs resetting explicitly: the next
  // time it opens, React mounts a fresh instance starting at quest 1 — never persists the
  // in-progress step, closing mid-way (browser close, reload before the flag is written)
  // means it starts over next time, by design.
  if (!isOpen) return null;
  return <QuestOnboardingSteps onComplete={onComplete} boardActions={boardActions} boardData={boardData} />;
};

const QuestOnboardingSteps = ({ onComplete, boardActions, boardData }) => {
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
              title={currentQuest.title}
              description={'The "Currently Playing" column is what you\'re playing right now — track a game there so you (and friends who follow you) can see it at a glance.'}
              targetColumnId={playingColumnId(boardData) || boardData?.columnOrder?.[0]}
              addGameToBoard={boardActions?.addGameToBoard}
              onSelect={advance}
            />
          </div>
        ) : (
          <div className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-xl p-6 min-h-[200px] flex flex-col justify-center gap-2">
            <h3 className="text-lg font-bold text-[var(--text)]">{currentQuest.title}</h3>
            <p className="text-sm text-[var(--text-muted)]">{currentQuest.description}</p>
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
