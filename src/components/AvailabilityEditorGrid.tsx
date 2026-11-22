import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  LogIn,
  Save,
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

interface CurrentUserInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
}

interface AvailabilityEditorGridProps {
  meeting: Meeting;
  myParticipant: ParticipantResponse | null;
  currentUser: CurrentUserInfo | null;
  onSignIn: () => Promise<void>;
  onSaveAvailability: (payload: {
    participantId?: string;
    name: string;
    role: string;
    note: string;
    slots: Record<string, AvailabilityStatus>;
  }) => Promise<void>;
}

export const AvailabilityEditorGrid: React.FC<AvailabilityEditorGridProps> = ({
  meeting,
  myParticipant,
  currentUser,
  onSignIn,
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [meeting.id, meeting.dates.length]);

  const scrollDaysBy = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const userDisplayName = useMemo(() => {
    if (myParticipant?.name) return myParticipant.name;
    if (currentUser?.displayName?.trim()) return currentUser.displayName.trim();
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return 'Cuenta UGR';
  }, [myParticipant?.name, currentUser?.displayName, currentUser?.email]);

  useEffect(() => {
    if (myParticipant) {
      setDraftSlots({ ...myParticipant.slots });
      setDraftNote(myParticipant.note || '');
    } else {
      setDraftSlots({});
      setDraftNote('');
    }
    setSaveMessage(null);
    setSaveError(null);
  }, [myParticipant?.id, meeting.id, currentUser?.uid]);

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
    if (!myParticipant) {
      return Object.keys(draftSlots).length > 0 || draftNote.trim().length > 0;
    }
    if ((myParticipant.note || '') !== draftNote) return true;
    const prevKeys = Object.keys(myParticipant.slots);
    const nextKeys = Object.keys(draftSlots);
    if (prevKeys.length !== nextKeys.length) return true;
    return nextKeys.some((k) => myParticipant.slots[k] !== draftSlots[k]);
  }, [myParticipant, draftSlots, draftNote]);

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
    if (!currentUser) {
      void onSignIn();
      return;
    }
    const current = draftSlots[slotId];
    const shouldErase = brush === 'clear' || current === brush;
    setDragMode(shouldErase ? 'erase' : 'paint');
    setIsDragging(true);
    applyToolToSlot(slotId, shouldErase ? 'erase' : 'paint');
  };

  const handleCellPointerEnter = (slotId: string) => {
    if (!isDragging || !currentUser) return;
    applyToolToSlot(slotId, dragMode);
  };

  const fillColumn = (date: string) => {
    if (!currentUser) {
      void onSignIn();
      return;
    }
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
    if (!currentUser) {
      void onSignIn();
      return;
    }
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
    if (!currentUser) {
      await onSignIn();
      return;
    }
    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      await onSaveAvailability({
        participantId: myParticipant?.id,
        name: userDisplayName,
        role: myParticipant?.role || 'UGR',
        note: draftNote,
        slots: draftSlots,
      });
      setSaveMessage('Disponibilidad guardada en Firebase');
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la disponibilidad.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const brushOptions: {
    id: BrushTool;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      id: 'available',
      label: 'Disponible',
      icon: <Check className="w-3.5 h-3.5" />,
      activeClass: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0] shadow-xs',
    },
    {
      id: 'adaptable',
      label: 'Me adapto',
      icon: <Clock className="w-3.5 h-3.5" />,
      activeClass: 'bg-amber-50 text-amber-800 border-amber-200 shadow-xs',
    },
    {
      id: 'unavailable',
      label: 'No disponible',
      icon: <X className="w-3.5 h-3.5" />,
      activeClass: 'bg-rose-50 text-rose-800 border-rose-200 shadow-xs',
    },
    {
      id: 'clear',
      label: 'Borrar',
      icon: <Eraser className="w-3.5 h-3.5" />,
      activeClass: 'bg-white text-[#0B1F3A] border-slate-300 shadow-xs',
    },
  ];

  return (
    <section
      id="mi-disponibilidad"
      aria-labelledby="availability-editor-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      {/* Header & Signed-in UGR Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2
            id="availability-editor-heading"
            className="text-base font-semibold text-[#0B1F3A] tracking-tight"
          >
            Mi disponibilidad
          </h2>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <div
              aria-hidden="true"
              className="w-7 h-7 rounded-md bg-[#0B1F3A] text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
            >
              {getInitials(userDisplayName)}
            </div>
            <span className="font-semibold text-[#0B1F3A]">
              {userDisplayName}
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className={myParticipant ? 'text-[#047857] font-medium' : 'text-slate-500'}>
              {myParticipant ? 'Apuntado en esta reunión' : 'Marca tus franjas para apuntarte'}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Acceder con correo UGR</span>
          </button>
        )}
      </div>

      {!currentUser && (
        <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-slate-600">
            Inicia sesión con tu correo de la UGR (<span className="font-mono">@ugr.es</span> o <span className="font-mono">@go.ugr.es</span>) para apuntarte directamente y marcar tu disponibilidad en el calendario.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Acceder con correo UGR
          </button>
        </div>
      )}

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

      {/* Horizontal day scroll buttons when days overflow */}
      {(canScrollLeft || canScrollRight) && (
        <div className="mt-4 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => scrollDaysBy(-280)}
            disabled={!canScrollLeft}
            aria-label="Desplazar días a la izquierda"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollDaysBy(280)}
            disabled={!canScrollRight}
            aria-label="Desplazar días a la derecha"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Interactive Paintable Schedule Matrix */}
      <div
        ref={scrollContainerRef}
        onScroll={updateScrollState}
        className="mt-4 overflow-x-auto select-none"
      >
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white border-r border-slate-200/80 w-28 min-w-[112px] pb-3 pr-3 text-left text-xs font-medium text-slate-400">
                Franja
              </th>
              {meeting.dates.map((date) => {
                const { weekday, dayMonth } = formatDateShort(date);
                return (
                  <th key={date} className="min-w-[136px] pb-3 px-1.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-[#0B1F3A] whitespace-nowrap">
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
                <td className="sticky left-0 z-10 bg-white border-r border-slate-200/80 py-1 pr-3 text-left font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
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
                        onPointerEnter={() => handleCellPointerEnter(slotId)}
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
            {getInitials(userDisplayName)}
          </div>
          <input
            type="text"
            value={draftNote}
            onChange={(e) => {
              setDraftNote(e.target.value);
              setSaveMessage(null);
            }}
            disabled={!currentUser}
            maxLength={240}
            placeholder="Añade una nota sobre tu disponibilidad (ej. puedo mover otra cita el martes tarde)..."
            aria-label="Nota sobre tu disponibilidad"
            className="w-full h-10 px-3.5 text-sm text-[#0B1F3A] placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A] disabled:opacity-60"
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
            className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>
              {!currentUser
                ? 'Acceder y apuntarme'
                : isSaving
                  ? 'Guardando...'
                  : !myParticipant
                    ? 'Apuntarme y guardar'
                    : hasChanges
                      ? 'Guardar disponibilidad'
                      : 'Disponibilidad guardada'}
            </span>
          </button>
        </div>
      </div>

      {saveError && (
        <p
          role="alert"
          className="mt-3 text-xs font-medium text-rose-700 text-right"
        >
          {saveError}
        </p>
      )}

      {saveMessage && (
        <p
          role="status"
          className="mt-3 text-xs font-medium text-[#047857] text-right"
        >
          {saveMessage} — Todos los participantes pueden verla en tiempo real.
        </p>
      )}
    </section>
  );
};
