import type { MemberDTO } from '../../lib/types';

interface Props {
  members: MemberDTO[];
  selfId: string;
  hostId: string;
  capacity: number;
  onKick?: (userId: string) => void;
  canKick: boolean;
}

export function ParticipantList({ members, selfId, hostId, capacity, onKick, canKick }: Props) {
  return (
    <div className="card-paper p-5 h-fit">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="eyebrow">§ Registry</div>
          <div className="font-display text-lg leading-none mt-0.5">In the room</div>
        </div>
        <span className="font-mono text-[10px] text-ink-muted tabular">{members.length}/{capacity}</span>
      </div>
      <ul className="divide-y divide-ink/10">
        {members.map((m, i) => (
          <li key={m.userId} className="py-2 flex items-center gap-3">
            <span className="font-mono text-[10px] text-ink-muted w-6 tabular">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={'flex-1 font-display ' + (m.userId === selfId ? 'text-focus' : 'text-ink')}>
              {m.username}
              {m.userId === selfId && <span className="text-ink-muted font-italic italic font-normal text-xs"> · you</span>}
            </span>
            {m.userId === hostId && <span className="eyebrow">host</span>}
            {canKick && m.userId !== selfId && m.userId !== hostId && onKick && (
              <button onClick={() => onKick(m.userId)} className="eyebrow hover:text-focus">remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
