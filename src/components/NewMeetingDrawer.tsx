import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Plus, Save, X } from 'lucide-react';
import { formatDateShort, padTime } from '../utils/schedule.ts';
import type { Meeting } from '../types/meeting.ts';

export interface MeetingFormPayload {
  title: string;
  description: string;
  organizer: string;
  location: string;
  durationMinutes: number;
  dates: string[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
}

interface NewMeetingDrawerProps {
  isOpen: boolean;
  editingMeeting?: Meeting | null;
  defaultDate?: string | null;
  onClose: () => void;
  onCreateMeeting: (payload: MeetingFormPayload) => Promise<void>;
  onUpdateMeeting?: (
    meetingId: string,
    payload: MeetingFormPayload
  ) => Promise<void>;
}

function toIsoLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateUpcomingDates(daysCount = 14): string[] {
  const list: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    list.push(toIsoLocal(d));
  }
  return list;
}

function getNextWorkweekDates(): string[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const diffToMonday = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  const monday = new Date(base);
  monday.setDate(
    base.getDate() + (diffToMonday < 0 ? 7 + diffToMonday : diffToMonday)
  );
  const list: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    list.push(toIsoLocal(d));
  }
  return list;
}

export const NewMeetingDrawer: React.FC<NewMeetingDrawerProps> = ({
  isOpen,
  editingMeeting = null,
  defaultDate = null,
  onClose,
  onCreateMeeting,
  onUpdateMeeting,
}) => {
  const isEditMode = Boolean(editingMeeting);
  const upcomingDates = useMemo(() => generateUpcomingDates(14), []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>(() =>
    getNextWorkweekDates().slice(0, 4)
  );
  const [customDate, setCustomDate] = useState('');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync form state whenever drawer opens or target meeting changes
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCustomDate('');
    if (editingMeeting) {
      setTitle(editingMeeting.title);
      setDescription(editingMeeting.description);
      setOrganizer(editingMeeting.organizer);
      setLocation(editingMeeting.location);
      setSelectedDates([...editingMeeting.dates].sort());
      setStartHour(editingMeeting.startHour);
      setEndHour(editingMeeting.endHour);
      setSlotMinutes(editingMeeting.slotMinutes);
      setDurationMinutes(editingMeeting.durationMinutes);
    } else {
      setTitle('');
      setDescription('');
      setOrganizer('');
      setLocation('');
      setSelectedDates(
        defaultDate && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)
          ? [defaultDate]
          : getNextWorkweekDates().slice(0, 4)
      );
      setStartHour(9);
      setEndHour(17);
      setSlotMinutes(60);
      setDurationMinutes(60);
    }
  }, [isOpen, editingMeeting, defaultDate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const availableDates = useMemo(
    () => Array.from(new Set([...upcomingDates, ...selectedDates])).sort(),
    [upcomingDates, selectedDates]
  );

  const durationOptions = useMemo(() => {
    const base = [15, 30, 45, 60, 90, 120, 180];
    if (
      editingMeeting &&
      !base.includes(editingMeeting.durationMinutes) &&
      editingMeeting.durationMinutes >= 15 &&
      editingMeeting.durationMinutes <= 480
    ) {
      return [...base, editingMeeting.durationMinutes].sort((a, b) => a - b);
    }
    return base;
  }, [editingMeeting]);

  const willClearConfirmedSlot = useMemo(() => {
    if (!editingMeeting?.confirmedSlotId) return false;
    const step = slotMinutes || 60;
    const startMin = startHour * 60;
    const endMin = endHour * 60;
    for (const date of selectedDates) {
      for (let m = startMin; m < endMin; m += step) {
        if (`${date}__${padTime(m)}` === editingMeeting.confirmedSlotId) {
          return false;
        }
      }
    }
    return true;
  }, [editingMeeting, selectedDates, startHour, endHour, slotMinutes]);

  const toggleDate = (date: string) => {
    setError(null);
    setSelectedDates((prev) => {
      if (prev.includes(date)) {
        return prev.filter((d) => d !== date);
      }
      if (prev.length >= 14) {
        setError('Puedes seleccionar un máximo de 14 días candidatos.');
        return prev;
      }
      return [...prev, date].sort();
    });
  };

  const handleAddCustomDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return;
    setError(null);
    if (selectedDates.includes(customDate)) {
      setCustomDate('');
      return;
    }
    if (selectedDates.length >= 14) {
      setError('Puedes seleccionar un máximo de 14 días candidatos.');
      return;
    }
    setSelectedDates((prev) => [...prev, customDate].sort());
    setCustomDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Introduce un título para la reunión.');
      return;
    }
    if (selectedDates.length === 0) {
      setError('Selecciona al menos un día candidato.');
      return;
    }
    if (endHour <= startHour) {
      setError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const payload: MeetingFormPayload = {
      title: title.trim(),
      description: description.trim(),
      organizer: organizer.trim() || 'Organización',
      location: location.trim() || 'Por definir',
      durationMinutes,
      dates: selectedDates,
      startHour,
      endHour,
      slotMinutes,
    };

    try {
      if (editingMeeting && onUpdateMeeting) {
        await onUpdateMeeting(editingMeeting.id, payload);
      } else {
        await onCreateMeeting(payload);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditMode
          ? 'No se pudo actualizar la reunión.'
          : 'No se pudo crear la reunión.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="new-meeting-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#0B1F3A]/20 backdrop-blur-[1px]"
          />

          <motion.aside
            key="new-meeting-panel"
            role="dialog"
            aria-modal="true"
            aria-label={
              isEditMode
                ? 'Editar reunión de grupo'
                : 'Crear nueva reunión de grupo'
            }
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0B1F3A] tracking-tight">
                  {isEditMode ? 'Editar reunión' : 'Nueva reunión de grupo'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isEditMode
                    ? 'Actualiza los detalles, los días candidatos o el rango horario.'
                    : 'Define los días candidatos y el rango horario para recoger disponibilidad.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar panel"
                className="p-2 text-slate-400 hover:text-[#0B1F3A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
            >
              <div>
                <label
                  htmlFor="meeting-title"
                  className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                >
                  Título de la reunión
                </label>
                <input
                  id="meeting-title"
                  type="text"
                  required
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Sesión clínica interdisciplinar"
                  className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                />
              </div>

              <div>
                <label
                  htmlFor="meeting-description"
                  className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                >
                  Objetivo o agenda breve
                </label>
                <textarea
                  id="meeting-description"
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexto para los participantes..."
                  className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A] resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="meeting-organizer"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Organizador
                  </label>
                  <input
                    id="meeting-organizer"
                    type="text"
                    maxLength={80}
                    value={organizer}
                    onChange={(e) => setOrganizer(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="meeting-location"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Sala o enlace
                  </label>
                  <input
                    id="meeting-location"
                    type="text"
                    maxLength={140}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ej. Sala 2A · Videollamada"
                    className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                  />
                </div>
              </div>

              {/* Date selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#0B1F3A]">
                    Días candidatos ({selectedDates.length}/14 seleccionados)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSelectedDates(getNextWorkweekDates());
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-[#0B1F3A] cursor-pointer"
                  >
                    Semana laboral
                  </button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {availableDates.map((date) => {
                    const { weekday, dayMonth } = formatDateShort(date);
                    const active = selectedDates.includes(date);
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => toggleDate(date)}
                        className={`py-2 px-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-[10px] opacity-80">{weekday}</div>
                        <div className="text-xs font-semibold tabular-nums mt-0.5">
                          {dayMonth}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Add custom date */}
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Añadir otra fecha"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomDate}
                    disabled={!customDate}
                    className="inline-flex items-center gap-1 h-9 px-3 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir fecha</span>
                  </button>
                </div>
              </div>

              {/* Hours & Granularity */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="start-hour"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Desde
                  </label>
                  <select
                    id="start-hour"
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    className="w-full h-10 px-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {Array.from({ length: 15 }, (_, i) => 6 + i).map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="end-hour"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Hasta
                  </label>
                  <select
                    id="end-hour"
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    className="w-full h-10 px-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {Array.from({ length: 16 }, (_, i) => 7 + i).map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="slot-minutes"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Bloques
                  </label>
                  <select
                    id="slot-minutes"
                    value={slotMinutes}
                    onChange={(e) => setSlotMinutes(Number(e.target.value))}
                    className="w-full h-10 px-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value={60}>60 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="duration-minutes"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                  >
                    Duración
                  </label>
                  <select
                    id="duration-minutes"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full h-10 px-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {durationOptions.map((d) => (
                      <option key={d} value={d}>
                        {d} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {willClearConfirmedSlot && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  El horario confirmado actual quedará sin confirmar porque ya no está incluido en los días o franjas seleccionados.
                </p>
              )}

              {error && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] disabled:opacity-60 cursor-pointer"
                >
                  {isEditMode ? (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="w-4 h-4" />
                      <span>
                        {isSubmitting ? 'Creando...' : 'Crear reunión'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
