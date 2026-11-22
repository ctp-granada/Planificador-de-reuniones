import type {
  AvailabilityStatus,
  Meeting,
  ParticipantResponse,
  SlotConsensus,
  TimeSlot,
} from '../types/meeting.ts';

export function padTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function buildSlotId(date: string, startTime: string): string {
  return `${date}__${startTime}`;
}

export function generateMeetingSlots(meeting: Meeting): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const step = meeting.slotMinutes || 60;
  const startMin = meeting.startHour * 60;
  const endMin = meeting.endHour * 60;

  for (const date of meeting.dates) {
    for (let m = startMin; m < endMin; m += step) {
      const startTime = padTime(m);
      const endTime = padTime(Math.min(m + step, endMin));
      slots.push({
        id: buildSlotId(date, startTime),
        date,
        startTime,
        endTime,
        minutesFromMidnight: m,
      });
    }
  }
  return slots;
}

export function generateHourRows(meeting: Meeting): {
  startTime: string;
  endTime: string;
  minutesFromMidnight: number;
}[] {
  const rows: {
    startTime: string;
    endTime: string;
    minutesFromMidnight: number;
  }[] = [];
  const step = meeting.slotMinutes || 60;
  const startMin = meeting.startHour * 60;
  const endMin = meeting.endHour * 60;

  for (let m = startMin; m < endMin; m += step) {
    rows.push({
      startTime: padTime(m),
      endTime: padTime(Math.min(m + step, endMin)),
      minutesFromMidnight: m,
    });
  }
  return rows;
}

/** Máximo de franjas que puede tener una reunión (14 días × 16 h × 2 franjas/h). */
export const MAX_SLOTS_PER_MEETING = 14 * 16 * 2;

/**
 * Participantes que han marcado al menos una franja de la reunión.
 * Quien no ha respondido nada (p. ej. la persona organizadora recién creada)
 * no cuenta en los porcentajes de consenso.
 */
export function getRespondents(meeting: Meeting): ParticipantResponse[] {
  return meeting.participants.filter(
    (p) => Object.keys(p.slots ?? {}).length > 0
  );
}

/** Número de franjas consecutivas que ocupa la reunión según su duración. */
export function getSlotsPerMeeting(meeting: Meeting): number {
  const step = meeting.slotMinutes || 60;
  return Math.max(1, Math.ceil((meeting.durationMinutes || step) / step));
}

/** Hora de fin real de una reunión que empieza en `startTime`. */
export function getMeetingEndTime(meeting: Meeting, startTime: string): string {
  const [hh, mm] = startTime.split(':').map(Number);
  const startMin = (hh || 0) * 60 + (mm || 0);
  const step = meeting.slotMinutes || 60;
  const length = Math.max(step, meeting.durationMinutes || step);
  return padTime(Math.min(meeting.endHour * 60, startMin + length));
}

function buildConsensus(
  meeting: Meeting,
  slot: TimeSlot,
  statusOf: (participant: ParticipantResponse) => AvailabilityStatus | undefined
): SlotConsensus {
  const available: ParticipantResponse[] = [];
  const adaptable: ParticipantResponse[] = [];
  const unavailable: ParticipantResponse[] = [];
  const pending: ParticipantResponse[] = [];

  for (const participant of meeting.participants) {
    const status = statusOf(participant);
    if (status === 'available') {
      available.push(participant);
    } else if (status === 'adaptable') {
      adaptable.push(participant);
    } else if (status === 'unavailable') {
      unavailable.push(participant);
    } else {
      pending.push(participant);
    }
  }

  const totalParticipants = getRespondents(meeting).length;
  // Optimal availability gets full weight (2.0), adaptable gets partial weight (1.0),
  // unavailable penalizes consensus (-1.5) to surface friction-free slots first.
  const score =
    available.length * 2 + adaptable.length * 1 - unavailable.length * 1.5;

  const optimalRatio =
    totalParticipants > 0 ? available.length / totalParticipants : 0;
  const feasibleRatio =
    totalParticipants > 0
      ? (available.length + adaptable.length) / totalParticipants
      : 0;

  return {
    slot,
    available,
    adaptable,
    unavailable,
    pending,
    totalParticipants,
    score,
    optimalRatio,
    feasibleRatio,
  };
}

export function computeSlotConsensus(
  meeting: Meeting,
  slot: TimeSlot
): SlotConsensus {
  return buildConsensus(meeting, slot, (p) => p.slots[slot.id]);
}

export function computeAllConsensus(meeting: Meeting): SlotConsensus[] {
  return generateMeetingSlots(meeting).map((slot) =>
    computeSlotConsensus(meeting, slot)
  );
}

/**
 * Consenso para cada posible hora de inicio teniendo en cuenta la duración
 * de la reunión: una persona solo está disponible si lo está en todas las
 * franjas consecutivas que ocupa la reunión. El id de cada ventana es el de
 * su primera franja, para que se pueda seleccionar y confirmar igual que antes.
 */
export function computeWindowConsensus(meeting: Meeting): SlotConsensus[] {
  const rows = generateHourRows(meeting);
  const span = getSlotsPerMeeting(meeting);
  const result: SlotConsensus[] = [];

  for (const date of meeting.dates) {
    for (let i = 0; i + span <= rows.length; i++) {
      const ids = rows
        .slice(i, i + span)
        .map((r) => buildSlotId(date, r.startTime));
      const first = rows[i];
      const slot: TimeSlot = {
        id: ids[0],
        date,
        startTime: first.startTime,
        endTime: getMeetingEndTime(meeting, first.startTime),
        minutesFromMidnight: first.minutesFromMidnight,
      };

      result.push(
        buildConsensus(meeting, slot, (p) => {
          const statuses = ids.map((id) => p.slots[id]);
          if (statuses.some((s) => s === 'unavailable')) return 'unavailable';
          if (statuses.some((s) => s === undefined)) return undefined;
          if (statuses.every((s) => s === 'available')) return 'available';
          return 'adaptable';
        })
      );
    }
  }
  return result;
}

export function getTopRecommendedSlots(
  meeting: Meeting,
  limit = 4
): SlotConsensus[] {
  return computeWindowConsensus(meeting)
    .filter((item) => item.available.length + item.adaptable.length > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.available.length !== a.available.length) {
        return b.available.length - a.available.length;
      }
      if (a.unavailable.length !== b.unavailable.length) {
        return a.unavailable.length - b.unavailable.length;
      }
      return a.slot.id.localeCompare(b.slot.id);
    })
    .slice(0, limit);
}

/** Elimina del mapa las franjas que ya no existen en la reunión. */
export function filterSlotsForMeeting(
  meeting: Meeting,
  slots: Record<string, AvailabilityStatus>
): Record<string, AvailabilityStatus> {
  const valid = new Set(generateMeetingSlots(meeting).map((s) => s.id));
  const clean: Record<string, AvailabilityStatus> = {};
  for (const [key, val] of Object.entries(slots)) {
    if (valid.has(key)) clean[key] = val;
  }
  return clean;
}

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_LONG = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const MONTHS_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function parseIsoDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatDateShort(dateStr: string): {
  weekday: string;
  dayMonth: string;
} {
  const d = parseIsoDate(dateStr);
  return {
    weekday: WEEKDAYS_SHORT[d.getDay()],
    dayMonth: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
  };
}

export function formatDateLong(dateStr: string): string {
  const d = parseIsoDate(dateStr);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
