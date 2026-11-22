import React, { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { generateMeetingSlots, getInitials } from '../utils/schedule.ts';
import type { Meeting } from '../types/meeting.ts';

interface ParticipantsPanelProps {
  meeting: Meeting;
  currentUserUid: string | null;
  isOrganizer: boolean;
  onRemoveParticipant: (participantId: string) => Promise<void>;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  meeting,
  currentUserUid,
  isOrganizer,
  onRemoveParticipant,
}) => {
  const [query, setQuery] = useState('');
  const totalSlots = useMemo(
    () => generateMeetingSlots(meeting).length,
    [meeting]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meeting.participants;
    return meeting.participants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q)
    );
  }, [meeting.participants, query]);

  return (
    <section
      id="participantes"
      aria-labelledby="participants-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2
            id="participants-heading"
            className="text-base font-semibold text-[#0B1F3A] tracking-tight"
          >
            Participantes apuntados
          </h2>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar participante..."
            aria-label="Buscar participante"
            className="h-9 pl-8 pr-3 w-56 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
          />
        </div>
      </div>

      {meeting.participants.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Todavía no se ha apuntado nadie. Entra con tu correo de la UGR y guarda tus franjas arriba para aparecer en la lista.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          No hay participantes que coincidan con “{query}”.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                <th className="py-3 pr-4">Participante</th>
                <th className="py-3 px-3 text-right">Disponibles</th>
                <th className="py-3 px-3 text-right">Adaptables</th>
                <th className="py-3 px-3 text-right">No disp.</th>
                <th className="py-3 px-4">Nota de flexibilidad</th>
                <th className="py-3 pl-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                let avail = 0;
                let adap = 0;
                let unavail = 0;
                for (const status of Object.values(p.slots)) {
                  if (status === 'available') avail++;
                  else if (status === 'adaptable') adap++;
                  else if (status === 'unavailable') unavail++;
                }
                const answered = avail + adap + unavail;
                const isOwn = Boolean(
                  currentUserUid && p.ownerUid === currentUserUid
                );

                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      isOwn ? 'bg-slate-50/90' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div
                          aria-hidden="true"
                          className={`w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center shrink-0 ${
                            isOwn
                              ? 'bg-[#0B1F3A] text-white'
                              : 'bg-slate-100 text-[#0B1F3A]'
                          }`}
                        >
                          {getInitials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#0B1F3A] truncate">
                            {p.name}
                            {isOwn ? ' (Tú)' : ''}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <span>{p.role || 'UGR'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {answered}/{totalSlots} franjas
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-[#047857] tabular-nums">
                      {avail}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-amber-700 tabular-nums">
                      {adap}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-rose-700 tabular-nums">
                      {unavail}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-xs text-slate-600 truncate">
                        {p.note || 'Sin observaciones'}
                      </p>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => {
                              document
                                .getElementById('mi-disponibilidad')
                                ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-[#0B1F3A] bg-slate-100 hover:bg-slate-200/80 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Mis franjas
                          </button>
                        )}
                        {currentUserUid &&
                          (p.ownerUid === currentUserUid || isOrganizer) && (
                            <button
                              type="button"
                              onClick={() => onRemoveParticipant(p.id)}
                              aria-label={`Eliminar a ${p.name}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50/70 hover:bg-rose-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Quitar</span>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
