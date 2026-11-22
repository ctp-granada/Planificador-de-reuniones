import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Eraser,
  Save,
  UserPlus,
  X,
} from 'lucide-react';
import {
  buildSlotId,
  formatDateShort,
  generateHourRows,
  getInitials,
} from '../utils/schedule.ts';
import type {
  AvailabilityStatus,
  Meeting,
  ParticipantResponse,
} from '../types/meeting.ts';

type BrushTool = AvailabilityStatus | 'clear';

interface AvailabilityEditorGridProps {
  meeting: Meeting;
  activeParticipant: ParticipantResponse | null;
  onSelectParticipant: (participantId: string) => void;
  onOpenNewParticipant: () => void;
  onSaveAvailability: (payload: {
    participantId: string;
    name: string;
    role: string;
    note: string;
    slots: Record<string, AvailabilityStatus>;
  }) => Promise<void>;
}

export const AvailabilityEditorGrid: React.FC<AvailabilityEditorGridProps> = ({
  meeting,
  activeParticipant,
  onSelectParticipant,
  onOpenNewParticipant,
  onSaveAvailability,
}) => {
  const [brush, setBrush] = useState<BrushTool>('available');
  const [draftSlots, setDraftSlots] = useState<
    Record<string, AvailabilityStatus>
  >({});
  const [draftNote, setDraftNote] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'paint' | 'erase'>('paint');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeParticipant) {
      setDraftSlots({ ...activeParticipant.slots });
      setDraftNote(activeParticipant.note || '');
      setSaveMessage(null);
    } else {
      setDraftSlots({});
      setDraftNote('');
    }
  }, [activeParticipant?.id, meeting.id]);

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false);
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const hourRows = useMemo(() => generateHourRows(meeting), [meeting]);

  const counts = useMemo(() => {
    let available = 0;
    let adaptable = 0;
    let unavailable = 0;
    for (const val of Object.values(draftSlots)) {
      if (val === 'available') available++;
      else if (val === 'adaptable') adaptable++;
      else if (val === 'unavailable') unavailable++;
    }
    return { available, adaptable, unavailable };
  }, [draftSlots]);

  const hasChanges = useMemo(() => {
    if (!activeParticipant) return false;
    if ((activeParticipant.note || '') !== draftNote) return true;
    const prevKeys = Object.keys(activeParticipant.slots);
    const nextKeys = Object.keys(draftSlots);
    if (prevKeys.length !== nextKeys.length) return true;
    return nextKeys.some((k) => activeParticipant.slots[k] !== draftSlots[k]);
  }, [activeParticipant, draftSlots, draftNote]);

  const applyToolToSlot = (
    slotId: string,
    mode: 'paint' | 'erase' | 'toggle'
  ) => {
    setSaveMessage(null);
    setDraftSlots((prev) => {
      const next = { ...prev };
      if (brush === 'clear' || mode === 'erase') {
        delete next[slotId];
        return next;
      }
      if (mode === 'toggle' && next[slotId] === brush) {
        delete next[slotId];
        return next;
      }
      next[slotId] = brush;
      return next;
    });
  };

  const handleCellPointerDown = (slotId: string) => {
    if (!activeParticipant) return;
    const current = draftSlots[slotId];
    const shouldErase = brush === 'clear' || current === brush;
    setDragMode(shouldErase ? 'erase' : 'paint');
    setIsDragging(true);
    applyToolToSlot(slotId, shouldErase ? 'erase' : 'paint');
  };

  const handleCellPointerEnter = (slotId: string) => {
    if (!isDragging || !activeParticipant) return;
    applyToolToSlot(slotId, dragMode);
  };

  const fillColumn = (date: string) => {
    if (!activeParticipant) return;
    setSaveMessage(null);
    setDraftSlots((prev) => {
      const next = { ...prev };
      for (const row of hourRows) {
        const slotId = buildSlotId(date, row.startTime);
        if (brush === 'clear') {
          delete next[slotId];
        } else {
          next[slotId] = brush;
        }
      }
      return next;
    });
  };

  const fillAll = (targetStatus: BrushTool) => {
    if (!activeParticipant) return;
    setSaveMessage(null);
    if (targetStatus === 'clear') {
      setDraftSlots({});
      return;
    }
    const next: Record<string, AvailabilityStatus> = {};
    for (const date of meeting.dates) {
      for (const row of hourRows) {
        next[buildSlotId(date, row.startTime)] = targetStatus;
      }
    }
    setDraftSlots(next);
  };

  const handleSave = async () => {
    if (!activeParticipant) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onSaveAvailability({
        participantId: activeParticipant.id,
        name: activeParticipant.name,
        role: activeParticipant.role,
        note: draftNote,
        slots: draftSlots,
      });
      setSaveMessage('Disponibilidad guardada');
    } finally {
      setIsSaving(false);
    }
  };

  const brushOptions: {
    id: BrushTool;
    label: string;
    shortHint: string;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      id: 'available',
      label: 'Disponible',
      shortHint: 'Me viene bien',
      icon: <Check className="w-3.5 h-3.5" />,
      activeClass:
        'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0] shadow-xs',
    },
    {
      id: 'adaptable',
      label: 'Me adapto si es necesario',
      shortHint: 'Flexible',
      icon: <Clock className="w-3.5 h-3.5" />,
      activeClass:
        'bg-amber-50 text-amber-800 border-amber-200 shadow-xs',
    },
    {
      id: 'unavailable',
      label: 'No disponible',
      shortHint: 'Imposible',
      icon: <X className="w-3.5 h-3.5" />,
      activeClass:
        'bg-rose-50 text-rose-800 border-rose-200 shadow-xs',
    },
    {
      id: 'clear',
      label: 'Borrar',
      shortHint: 'Limpiar celda',
      icon: <Eraser className="w-3.5 h-3.5" />,
      activeClass:
        'bg-white text-[#0B1F3A] border-slate-300 shadow-xs',
    },
  ];

  return (
    <section
      id="mi-disponibilidad"
      aria-labelledby="availability-editor-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      {/* Header & Participant Selector */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2
            id="availability-editor-heading"
            className="text-base font-semibold text-[#0B1F3A] tracking-tight"
          >
            Mi disponibilidad
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Elige un estado y haz clic o arrastra sobre las franjas horarias para marcar tu respuesta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="participant-switcher"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Responder como:
            </label>
            <select
              id="participant-switcher"
              value={activeParticipant?.id ?? ''}
              onChange={(e) => onSelectParticipant(e.target.value)}
              className="h-9 px-3 pr-8 text-sm font-medium text-[#0B1F3A] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20"
            >
              {meeting.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.role ? `(${p.role})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenNewParticipant}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Añadir participante</span>
          </button>
        </div>
      </div>

      {!activeParticipant ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-600 mb-4">
            Aún no hay participantes en esta reunión.
          </p>
          <button
            type="button"
            onClick={onOpenNewParticipant}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Registrar primer participante</span>
          </button>
        </div>
      ) : (
        <>
          {/* Brush Selector & Quick Summary */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 py-4 border-b border-slate-100">
            <div
              role="radiogroup"
              aria-label="Estado de disponibilidad a marcar"
              className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-lg"
            >
              {brushOptions.map((opt) => {
                const isActive = brush === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setBrush(opt.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? opt.activeClass
                        : 'border-transparent text-slate-600 hover:text-[#0B1F3A]'
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 tabular-nums">
              <span className="font-medium text-[#047857]">
                {counts.available} disponibles
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-medium text-amber-700">
                {counts.adaptable} adaptables
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-medium text-rose-700">
                {counts.unavailable} no disponibles
              </span>
            </div>
          </div>

          {/* Interactive Paintable Schedule Matrix */}
          <div className="mt-5 overflow-x-auto select-none">
            <table className="w-full border-collapse min-w-[520px]">
              <thead>
                <tr>
                  <th className="w-24 pb-3 pr-3 text-left text-xs font-medium text-slate-400">
                    Franja
                  </th>
                  {meeting.dates.map((date) => {
                    const { weekday, dayMonth } = formatDateShort(date);
                    return (
                      <th key={date} className="pb-3 px-1.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-semibold text-[#0B1F3A]">
                            {weekday} {dayMonth}
                          </span>
                          <button
                            type="button"
                            onClick={() => fillColumn(date)}
                            className="text-[11px] font-medium text-slate-400 hover:text-[#0B1F3A] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Aplicar a todo el día
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {hourRows.map((row) => (
                  <tr key={row.startTime}>
                    <td className="py-1 pr-3 text-left font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                      {row.startTime} – {row.endTime}
                    </td>
                    {meeting.dates.map((date) => {
                      const slotId = buildSlotId(date, row.startTime);
                      const status = draftSlots[slotId];

                      let cellStyle =
                        'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50';
                      let cellLabel = 'Sin marcar';
                      let cellIcon: React.ReactNode = null;

                      if (status === 'available') {
                        cellStyle =
                          'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857] hover:bg-[#D1FAE5]';
                        cellLabel = 'Disponible';
                        cellIcon = <Check className="w-3.5 h-3.5 shrink-0" />;
                      } else if (status === 'adaptable') {
                        cellStyle =
                          'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/80';
                        cellLabel = 'Me adapto';
                        cellIcon = <Clock className="w-3.5 h-3.5 shrink-0" />;
                      } else if (status === 'unavailable') {
                        cellStyle =
                          'bg-rose-50/90 border-rose-200 text-rose-800 hover:bg-rose-100/70';
                        cellLabel = 'No disponible';
                        cellIcon = <X className="w-3.5 h-3.5 shrink-0" />;
                      }

                      return (
                        <td key={slotId} className="p-1">
                          <button
                            type="button"
                            onPointerDown={() => handleCellPointerDown(slotId)}
                            onPointerEnter={() =>
                              handleCellPointerEnter(slotId)
                            }
                            aria-label={`${formatDateShort(date).weekday} ${row.startTime}: ${cellLabel}`}
                            className={`w-full h-10 px-2.5 border rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] ${cellStyle}`}
                          >
                            {cellIcon}
                            <span className="truncate">{cellLabel}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Participant Note & Save Bar */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 flex items-center gap-3">
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold flex items-center justify-center shrink-0"
              >
                {getInitials(activeParticipant.name)}
              </div>
              <input
                type="text"
                value={draftNote}
                onChange={(e) => {
                  setDraftNote(e.target.value);
                  setSaveMessage(null);
                }}
                maxLength={240}
                placeholder="Añade una nota sobre tu disponibilidad (ej. puedo mover otra cita el martes tarde)..."
                aria-label="Nota sobre tu disponibilidad"
                className="w-full h-10 px-3.5 text-sm text-[#0B1F3A] placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => fillAll('available')}
                className="h-10 px-3 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap cursor-pointer"
              >
                Todo disponible
              </button>
              <button
                type="button"
                onClick={() => fillAll('clear')}
                className="h-10 px-3 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap cursor-pointer"
              >
                Limpiar todo
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSaving
                    ? 'Guardando...'
                    : hasChanges
                      ? 'Guardar disponibilidad'
                      : 'Disponibilidad guardada'}
                </span>
              </button>
            </div>
          </div>

          {saveMessage && (
            <p
              role="status"
              className="mt-3 text-xs font-medium text-[#047857] text-right"
            >
              {saveMessage} — El consenso grupal y la curva de disponibilidad se han actualizado.
            </p>
          )}
        </>
      )}
    </section>
  );
};
