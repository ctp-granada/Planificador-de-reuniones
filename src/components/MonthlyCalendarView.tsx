import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { formatDateLong, padTime, parseIsoDate } from '../utils/schedule.ts';
import type { Meeting } from '../types/meeting.ts';

type CalendarFilter = 'all' | 'confirmed' | 'open';

interface CalendarEventItem {
  meeting: Meeting;
  isConfirmed: boolean;
  timeLabel: string;
}

interface MonthlyCalendarViewProps {
  meetings: Meeting[];
  activeMeetingId: string | null;
  currentUserUid: string | null;
  onOpenMeeting: (meetingId: string) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onCreateMeetingOnDate: (date: string) => void;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function toIsoLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getInitialYearMonth(
  meetings: Meeting[],
  activeMeetingId: string | null
): { year: number; month: number } {
  const active = meetings.find((m) => m.id === activeMeetingId) ?? meetings[0];
  if (active) {
    const refDate = active.confirmedSlotId
      ? active.confirmedSlotId.split('__')[0]
      : active.dates[0];
    if (refDate && /^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
      const parsed = parseIsoDate(refDate);
      return { year: parsed.getFullYear(), month: parsed.getMonth() };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function buildConfirmedTimeLabel(meeting: Meeting, slotId: string): string {
  const [, startTime] = slotId.split('__');
  if (!startTime) return '';
  const [hh, mm] = startTime.split(':').map(Number);
  const startMin = (hh || 0) * 60 + (mm || 0);
  const endMin = Math.min(
    meeting.endHour * 60,
    startMin + (meeting.slotMinutes || 60)
  );
  return `${startTime} – ${padTime(endMin)}`;
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  meetings,
  activeMeetingId,
  currentUserUid,
  onOpenMeeting,
  onEditMeeting,
  onCreateMeetingOnDate,
}) => {
  const initialYM = useMemo(
    () => getInitialYearMonth(meetings, activeMeetingId),
    []
  );
  const [viewYear, setViewYear] = useState(initialYM.year);
  const [viewMonth, setViewMonth] = useState(initialYM.month);
  const [filter, setFilter] = useState<CalendarFilter>('all');

  const todayIso = useMemo(() => toIsoLocal(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const active = meetings.find((m) => m.id === activeMeetingId) ?? meetings[0];
    if (active) {
      return active.confirmedSlotId
        ? active.confirmedSlotId.split('__')[0]
        : active.dates[0] ?? todayIso;
    }
    return todayIso;
  });

  // Map YYYY-MM-DD -> calendar events
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();

    const pushEvent = (date: string, item: CalendarEventItem) => {
      const list = map.get(date);
      if (list) {
        list.push(item);
      } else {
        map.set(date, [item]);
      }
    };

    for (const meeting of meetings) {
      const isConfirmed = Boolean(meeting.confirmedSlotId);
      if (filter === 'confirmed' && !isConfirmed) continue;
      if (filter === 'open' && isConfirmed) continue;

      if (meeting.confirmedSlotId) {
        const [confirmedDate, startTime] = meeting.confirmedSlotId.split('__');
        if (confirmedDate) {
          pushEvent(confirmedDate, {
            meeting,
            isConfirmed: true,
            timeLabel: startTime || '',
          });
        }
      } else {
        const rangeLabel = `${String(meeting.startHour).padStart(2, '0')}:00–${String(meeting.endHour).padStart(2, '0')}:00`;
        for (const date of meeting.dates) {
          pushEvent(date, {
            meeting,
            isConfirmed: false,
            timeLabel: rangeLabel,
          });
        }
      }
    }

    // Sort confirmed events first, then by time label / title
    map.forEach((items) => {
      items.sort((a, b) => {
        if (a.isConfirmed !== b.isConfirmed) return a.isConfirmed ? -1 : 1;
        if (a.timeLabel !== b.timeLabel) {
          return a.timeLabel.localeCompare(b.timeLabel);
        }
        return a.meeting.title.localeCompare(b.meeting.title, 'es');
      });
    });

    return map;
  }, [meetings, filter]);

  // Build Monday-first 6-row (or 5-row) calendar cells
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastOfMonth.getDate();

    // Convert JS getDay() (0 Sun..6 Sat) to Monday-first index (0 Mon..6 Sun)
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: {
      iso: string;
      dayNumber: number;
      inCurrentMonth: boolean;
    }[] = [];

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(viewYear, viewMonth, 1 - startOffset + i);
      cells.push({
        iso: toIsoLocal(cellDate),
        dayNumber: cellDate.getDate(),
        inCurrentMonth: cellDate.getMonth() === viewMonth,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  // Month stats
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;
  const monthStats = useMemo(() => {
    const seenMeetingIds = new Set<string>();
    const confirmedMeetingIds = new Set<string>();
    let activeDaysCount = 0;

    eventsByDate.forEach((items, date) => {
      if (!date.startsWith(monthPrefix) || items.length === 0) return;
      activeDaysCount++;
      for (const item of items) {
        seenMeetingIds.add(item.meeting.id);
        if (item.isConfirmed) {
          confirmedMeetingIds.add(item.meeting.id);
        }
      }
    });

    return {
      totalMeetings: seenMeetingIds.size,
      confirmedCount: confirmedMeetingIds.size,
      activeDaysCount,
    };
  }, [eventsByDate, monthPrefix]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(toIsoLocal(now));
  };

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];

  return (
    <section
      id="vista-mensual"
      aria-labelledby="monthly-calendar-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      {/* Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <h2
              id="monthly-calendar-heading"
              className="text-lg font-semibold text-[#0B1F3A] tracking-tight"
            >
              {MONTH_NAMES_ES[viewMonth]}{' '}
              <span className="font-mono tabular-nums">{viewYear}</span>
            </h2>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="Mes anterior"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-8 px-2.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="Mes siguiente"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {monthStats.totalMeetings === 0
              ? 'Sin eventos en este mes'
              : `${monthStats.totalMeetings} ${
                  monthStats.totalMeetings === 1 ? 'reunión' : 'reuniones'
                } · ${monthStats.confirmedCount} ${
                  monthStats.confirmedCount === 1 ? 'confirmada' : 'confirmadas'
                } · ${monthStats.activeDaysCount} ${
                  monthStats.activeDaysCount === 1
                    ? 'día con actividad'
                    : 'días con actividad'
                }`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
          <div
            role="tablist"
            aria-label="Filtrar reuniones en calendario"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-[#0B1F3A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1F3A]'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'confirmed'}
              onClick={() => setFilter('confirmed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'confirmed'
                  ? 'bg-white text-[#0B1F3A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1F3A]'
              }`}
            >
              Confirmadas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'open'}
              onClick={() => setFilter('open')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'open'
                  ? 'bg-white text-[#0B1F3A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1F3A]'
              }`}
            >
              Abiertas
            </button>
          </div>
        </div>
      </div>

      {/* Main Layout: 7-col Month Grid + Selected Day Agenda */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Month Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px] border border-slate-200 rounded-xl overflow-hidden">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 bg-slate-50/80 border-b border-slate-200">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-2.5 px-2 text-center text-xs font-semibold text-slate-500"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-white">
              {calendarDays.map((cell) => {
                const dayEvents = eventsByDate.get(cell.iso) ?? [];
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedDate;
                const visibleEvents = dayEvents.slice(0, 3);
                const overflowCount = dayEvents.length - visibleEvents.length;

                return (
                  <div
                    key={cell.iso}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDate(cell.iso)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDate(cell.iso);
                      }
                    }}
                    aria-label={`${cell.iso}, ${dayEvents.length} reuniones`}
                    aria-pressed={isSelected}
                    className={`min-h-[112px] p-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0B1F3A] ${
                      isSelected
                        ? 'bg-slate-50/90 ring-1 ring-inset ring-[#0B1F3A]/40'
                        : cell.inCurrentMonth
                          ? 'bg-white hover:bg-slate-50/60'
                          : 'bg-slate-50/40 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 text-xs font-mono tabular-nums rounded-md ${
                          isToday
                            ? 'bg-[#0B1F3A] text-white font-semibold'
                            : cell.inCurrentMonth
                              ? 'text-[#0B1F3A] font-medium'
                              : 'text-slate-400'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {dayEvents.length > 0 && (
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {visibleEvents.map((item) => {
                        const isActiveMeeting =
                          item.meeting.id === activeMeetingId;
                        return (
                          <button
                            key={item.meeting.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(cell.iso);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              onOpenMeeting(item.meeting.id);
                            }}
                            title={`${item.meeting.title} · ${item.timeLabel}`}
                            className={`w-full px-1.5 py-1 rounded text-left text-[11px] leading-tight border flex items-center gap-1 transition-colors cursor-pointer ${
                              item.isConfirmed
                                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#064E3B] hover:border-[#059669]'
                                : isActiveMeeting
                                  ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                                  : 'bg-slate-50 border-slate-200 text-[#0B1F3A] hover:border-slate-300'
                            }`}
                          >
                            {item.isConfirmed && (
                              <CalendarCheck2 className="w-3 h-3 text-[#047857] shrink-0" />
                            )}
                            <span className="font-mono tabular-nums shrink-0 opacity-80">
                              {item.isConfirmed
                                ? item.timeLabel
                                : `${String(item.meeting.startHour).padStart(2, '0')}h`}
                            </span>
                            <span className="truncate font-medium">
                              {item.meeting.title}
                            </span>
                          </button>
                        );
                      })}

                      {overflowCount > 0 && (
                        <div className="px-1 text-[11px] font-medium text-slate-500 tabular-nums">
                          +{overflowCount} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quiet Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck2 className="w-3.5 h-3.5 text-[#059669]" />
              <span>Horario confirmado</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#0B1F3A]" />
              <span>Día candidato (en votación)</span>
            </span>
          </div>
        </div>

        {/* Selected Day Agenda Inspector */}
        <aside
          aria-label="Agenda del día seleccionado"
          className="border-t xl:border-t-0 xl:border-l border-slate-200 pt-5 xl:pt-0 xl:pl-6"
        >
          <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Día seleccionado
              </div>
              <h3 className="mt-0.5 text-sm font-semibold text-[#0B1F3A]">
                {formatDateLong(selectedDate)}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => onCreateMeetingOnDate(selectedDate)}
              className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear aquí</span>
            </button>
          </div>

          {selectedDayEvents.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarDays className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="mt-2.5 text-xs font-medium text-slate-600">
                No hay reuniones para este día
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Selecciona otro día en el calendario o crea una reunión nueva en esta fecha.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedDayEvents.map((item) => {
                const { meeting, isConfirmed } = item;
                const isOrganizer = Boolean(
                  currentUserUid && meeting.organizerUid === currentUserUid
                );
                const fullTime =
                  isConfirmed && meeting.confirmedSlotId
                    ? buildConfirmedTimeLabel(meeting, meeting.confirmedSlotId)
                    : `${String(meeting.startHour).padStart(2, '0')}:00 – ${String(meeting.endHour).padStart(2, '0')}:00`;

                return (
                  <div key={meeting.id} className="py-4 first:pt-3 last:pb-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          isConfirmed ? 'text-[#047857]' : 'text-slate-500'
                        }`}
                      >
                        {isConfirmed ? 'Confirmada' : 'En votación'}
                      </span>
                      <span className="font-mono tabular-nums text-[#0B1F3A] font-medium">
                        {fullTime}
                      </span>
                    </div>

                    <h4 className="mt-1 text-sm font-semibold text-[#0B1F3A] leading-snug">
                      {meeting.title}
                    </h4>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      <span>Organiza: {meeting.organizer}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        {meeting.durationMinutes} min
                      </span>
                      {meeting.id === activeMeetingId && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Users className="w-3 h-3" />
                            {meeting.participants.length} participantes
                          </span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{meeting.location}</span>
                      </span>
                    </div>

                    {isConfirmed && meeting.confirmedNote && (
                      <p className="mt-2 text-xs text-[#047857]">
                        {meeting.confirmedNote}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenMeeting(meeting.id)}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>Abrir reunión</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>

                      {isOrganizer && (
                        <button
                          type="button"
                          onClick={() => onEditMeeting(meeting)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
