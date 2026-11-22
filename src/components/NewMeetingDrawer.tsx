import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, X } from 'lucide-react';
import { formatDateShort } from '../utils/schedule.ts';

interface NewMeetingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateMeeting: (payload: {
    title: string;
    description: string;
    organizer: string;
    location: string;
    durationMinutes: number;
    dates: string[];
    startHour: number;
    endHour: number;
    slotMinutes: number;
  }) => Promise<void>;
}

function generateUpcomingDates(daysCount = 14): string[] {
  const list: string[] = [];
  const base = new Date(2026, 10, 23); // Monday 2026-11-23
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    list.push(`${yyyy}-${mm}-${dd}`);
  }
  return list;
}

export const NewMeetingDrawer: React.FC<NewMeetingDrawerProps> = ({
  isOpen,
  onClose,
  onCreateMeeting,
}) => {
  const availableDates = useMemo(() => generateUpcomingDates(14), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
  ]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const toggleDate = (date: string) => {
    setError(null);
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date].sort()
    );
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
    try {
      await onCreateMeeting({
        title: title.trim(),
        description: description.trim(),
        organizer: organizer.trim() || 'Organización',
        location: location.trim() || 'Por definir',
        durationMinutes,
        dates: selectedDates,
        startHour,
        endHour,
        slotMinutes,
      });
      setTitle('');
      setDescription('');
      setOrganizer('');
      setLocation('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo crear la reunión.'
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
            aria-label="Crear nueva reunión de grupo"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0B1F3A] tracking-tight">
                  Nueva reunión de grupo
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define los días candidatos y el rango horario para recoger disponibilidad.
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
                    Días candidatos ({selectedDates.length} seleccionados)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDates([
                        '2026-11-23',
                        '2026-11-24',
                        '2026-11-25',
                        '2026-11-26',
                        '2026-11-27',
                      ])
                    }
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
                    {[7, 8, 9, 10, 11, 12, 13, 14].map((h) => (
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
                    {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
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
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                  </select>
                </div>
              </div>

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
                  <CalendarPlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Creando...' : 'Crear reunión'}</span>
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
