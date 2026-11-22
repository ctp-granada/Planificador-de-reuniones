export type AvailabilityStatus = 'available' | 'adaptable' | 'unavailable';

export interface ParticipantResponse {
  id: string;
  name: string;
  role: string;
  note: string;
  slots: Record<string, AvailabilityStatus>;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  organizer: string;
  location: string;
  durationMinutes: number;
  dates: string[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
  participants: ParticipantResponse[];
  confirmedSlotId: string | null;
  confirmedNote: string;
  createdAt: string;
}

export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  minutesFromMidnight: number;
}

export interface SlotConsensus {
  slot: TimeSlot;
  available: ParticipantResponse[];
  adaptable: ParticipantResponse[];
  unavailable: ParticipantResponse[];
  pending: ParticipantResponse[];
  totalParticipants: number;
  score: number;
  optimalRatio: number;
  feasibleRatio: number;
}
