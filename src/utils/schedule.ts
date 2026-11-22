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

export function computeSlotConsensus(
  meeting: Meeting,
  slot: TimeSlot
): SlotConsensus {
  const available: ParticipantResponse[] = [];
  const adaptable: ParticipantResponse[] = [];
  const unavailable: ParticipantResponse[] = [];
  const pending: ParticipantResponse[] = [];

  for (const participant of meeting.participants) {
    const status: AvailabilityStatus | undefined = participant.slots[slot.id];
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

  const totalParticipants = meeting.participants.length;
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

export function computeAllConsensus(meeting: Meeting): SlotConsensus[] {
  return generateMeetingSlots(meeting).map((slot) =>
    computeSlotConsensus(meeting, slot)
  );
}

export function getTopRecommendedSlots(
  consensusList: SlotConsensus[],
  limit = 4
): SlotConsensus[] {
  return [...consensusList]
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
