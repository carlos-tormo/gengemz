import { ListPlus } from 'lucide-react';

/**
 * Quest 4: unlike quests 1-3, this doesn't search for a game — it points at the
 * existing "Create New List" modal (issue #12) so the user learns custom columns
 * exist without us reimplementing that flow here.
 */
const QuestCreateColumnStep = ({ title, onOpenCreateColumn, canCreateColumn }) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] mt-1">
        Beyond your three starting lists, you can create your own to track anything you want —
        like <span className="text-[var(--text)] font-semibold">"Jugando en co-op"</span> for
        games you play with friends, or <span className="text-[var(--text)] font-semibold">"Platinados"</span> for
        the ones you've 100%'d.
      </p>
    </div>

    {canCreateColumn ? (
      <button
        type="button"
        onClick={onOpenCreateColumn}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-bold rounded-lg shadow-lg transition-colors"
      >
        <ListPlus size={20} />
        Create your own list
      </button>
    ) : (
      <div className="text-sm text-[var(--text-muted)] px-2 py-2">
        You've already reached the 5-list limit — you can manage your lists any time from the board.
      </div>
    )}
  </div>
);

export default QuestCreateColumnStep;
