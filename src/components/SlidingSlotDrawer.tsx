import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarCheck2, Check, Clock, Minus, X } from 'lucide-react';
import { formatDateLong, getInitials } from '../utils/schedule.ts';
import type { Meeting, ParticipantResponse, SlotConsensus } from '../types/meeting.ts';

interface SlidingSlotDrawerProps {
  meeting: Meeting;
  consensus: SlotConsensus | null;
  currentUserUid: string | null;
  canConfirm: boolean;
  onClose: () => void;
  onConfirmSlot: (slotId: string | null, note: string) => Promise<void>;
  onScrollToMyAvailability: () => void;
}

export const SlidingSlotDrawer: React.FC<SlidingSlotDrawerProps> = ({
  meeting,
  consensus,
  currentUserUid,
  canConfirm,
  onClose,
  onConfirmSlot,
  onScrollToMyAvailability,
}) => {
  const [confirmNote, setConfirmNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (consensus && meeting.confirmedSlotId === consensus.slot.id) {
      setConfirmNote(meeting.confirmedNote || '');
    } else {
      setConfirmNote('');
    }
  }, [consensus?.slot.id, meeting.confirmedSlotId, meeting.confirmedNote]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && consensus) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [consensus, onClose]);

  const isConfirmed =
    consensus !== null && meeting.confirmedSlotId === consensus.slot.id;

  const handleToggleConfirm = async () => {
    if (!consensus) return;
    setIsSubmitting(true);
    try {
      if (isConfirmed) {
        await onConfirmSlot(null, '');
      } else {
        await onConfirmSlot(consensus.slot.id, confirmNote);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGroup = (
    title: string,
    people: ParticipantResponse[],
    accentClass: string,
    icon: React.ReactNode
  ) => (
    <div className="py-4 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center justify-between mb-2.5">
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${accentClass}`}>
          {icon}
          <span>{title}</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {people.length}
        </span>
      </div>

      {people.length === 0 ? (
        <p className="text-xs text-slate-400">Ningún participante en este estado.</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-start justify-between gap-3 py-1.5"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  aria-hidden="true"
                  className="w-7 h-7 rounded-md bg-slate-100 text-[#0B1F3A] text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5"
                >
                  {getInitials(person.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#0B1F3A] truncate">
                    {person.name}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {person.role || 'Participante'}
                  </div>
                  {person.note && (
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      “{person.note}”
                    </p>
                  )}
                </div>
              </div>

              {currentUserUid && person.ownerUid === currentUserUid && (
                <button
                  type="button"
                  onClick={() => {
                    onScrollToMyAvailability();
                    onClose();
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      {consensus && (
        <>
          <motion.div
            key="slot-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#0B1F3A]/20 backdrop-blur-[1px]"
          />

          <motion.aside
            key="slot-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de franja horaria"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {formatDateLong(consensus.slot.date)}
                </div>
                <h3 className="mt-1 font-mono text-xl font-semibold text-[#0B1F3A] tabular-nums">
                  {consensus.slot.startTime} – {consensus.slot.endTime}
                </h3>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span className="text-[#047857] font-medium">
                    {consensus.available.length} disponibles
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-medium">
                    {consensus.adaptable.length} adaptables
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-rose-700">
                    {consensus.unavailable.length} no disponibles
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar tarjeta de detalle"
                className="p-2 text-slate-400 hover:text-[#0B1F3A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Participant Breakdown */}
            <div className="flex-1 overflow-y-auto px-6 py-2">
              {renderGroup(
                'Disponibles',
                consensus.available,
                'text-[#047857]',
                <Check className="w-3.5 h-3.5" />
              )}
              {renderGroup(
                'Se adaptan si es necesario',
                consensus.adaptable,
                'text-amber-700',
                <Clock className="w-3.5 h-3.5" />
              )}
              {renderGroup(
                'No disponibles',
                consensus.unavailable,
                'text-rose-700',
                <X className="w-3.5 h-3.5" />
              )}
              {consensus.pending.length > 0 &&
                renderGroup(
                  'Sin respuesta en esta franja',
                  consensus.pending,
                  'text-slate-500',
                  <Minus className="w-3.5 h-3.5" />
                )}
            </div>

            {/* Organizer Confirmation Footer */}
            <div className="px-6 py-5 border-t border-slate-200 bg-slate-50/70 space-y-3">
              {canConfirm ? (
                <>
                  {!isConfirmed && (
                    <div>
                      <label
                        htmlFor="confirm-slot-note"
                        className="block text-xs font-medium text-slate-600 mb-1.5"
                      >
                        Nota de convocatoria (opcional)
                      </label>
                      <input
                        id="confirm-slot-note"
                        type="text"
                        value={confirmNote}
                        onChange={(e) => setConfirmNote(e.target.value)}
                        placeholder="Ej. Confirmada en Sala 3B · Se enviará enlace"
                        className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0B1F3A]"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleConfirm}
                    disabled={isSubmitting}
                    className={`w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                      isConfirmed
                        ? 'bg-white border border-slate-300 text-[#0B1F3A] hover:bg-slate-100'
                        : 'bg-[#0B1F3A] text-white hover:bg-[#132F54]'
                    }`}
                  >
                    <CalendarCheck2 className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? 'Actualizando...'
                        : isConfirmed
                          ? 'Anular confirmación de esta franja'
                          : 'Confirmar franja definitiva'}
                    </span>
                  </button>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Solo quien organiza la reunión ({meeting.organizer}) puede confirmar o cambiar la franja definitiva.
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
