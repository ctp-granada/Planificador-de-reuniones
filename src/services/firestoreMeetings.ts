import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isUgrEmail,
  OperationType,
} from '../firebase.ts';
import type {
  AvailabilityStatus,
  Meeting,
  ParticipantResponse,
} from '../types/meeting.ts';
import { MAX_SLOTS_PER_MEETING } from '../utils/schedule.ts';

function toSafeId(raw: string, prefix: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${cleaned || prefix}-${rand}`.slice(0, 128);
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function sanitizeSlots(
  slots: Record<string, AvailabilityStatus>
): Record<string, AvailabilityStatus> {
  const clean: Record<string, AvailabilityStatus> = {};
  let count = 0;
  for (const [key, val] of Object.entries(slots)) {
    if (count >= MAX_SLOTS_PER_MEETING) break;
    if (
      typeof key === 'string' &&
      key.length > 0 &&
      key.length <= 40 &&
      (val === 'available' || val === 'adaptable' || val === 'unavailable')
    ) {
      clean[key] = val;
      count++;
    }
  }
  return clean;
}

export function subscribeSharedMeetings(
  onData: (meetings: Omit<Meeting, 'participants'>[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'meetings';
  const q = query(collection(db, path), where('visibility', '==', 'shared'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Omit<Meeting, 'participants'>[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title ?? ''),
          description: String(data.description ?? ''),
          organizer: String(data.organizerName ?? 'Organización'),
          organizerUid: String(data.organizerUid ?? ''),
          location: String(data.location ?? ''),
          durationMinutes: Number(data.durationMinutes ?? 60),
          dates: Array.isArray(data.dates) ? data.dates.map(String) : [],
          startHour: Number(data.startHour ?? 9),
          endHour: Number(data.endHour ?? 17),
          slotMinutes: Number(data.slotMinutes ?? 60),
          confirmedSlotId:
            typeof data.confirmedSlotId === 'string'
              ? data.confirmedSlotId
              : null,
          confirmedNote: String(data.confirmedNote ?? ''),
          createdAt: toIsoString(data.createdAt),
        };
      });

      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    }
  );
}

export function subscribeMeetingParticipants(
  meetingId: string,
  onData: (participants: ParticipantResponse[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `meetings/${meetingId}/participants`;
  const q = query(collection(db, path), where('isShared', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ParticipantResponse[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          meetingId: String(data.meetingId ?? meetingId),
          ownerUid: String(data.ownerUid ?? ''),
          name: String(data.name ?? ''),
          role: String(data.role ?? ''),
          note: String(data.note ?? ''),
          slots:
            data.slots && typeof data.slots === 'object'
              ? sanitizeSlots(data.slots as Record<string, AvailabilityStatus>)
              : {},
          updatedAt: toIsoString(data.updatedAt),
        };
      });

      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    }
  );
}

export async function createMeetingInFirestore(payload: {
  title: string;
  description: string;
  organizer: string;
  location: string;
  durationMinutes: number;
  dates: string[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user || !isUgrEmail(user.email)) {
    throw new Error(
      'Debes iniciar sesión con tu correo de la UGR (@ugr.es, @go.ugr.es o @correo.ugr.es) para crear una reunión.'
    );
  }

  const meetingId = toSafeId(payload.title, 'reunion');
  const title = payload.title.trim().slice(0, 140);
  const description = (
    payload.description.trim() ||
    'Selecciona las franjas que te vienen bien, si te adaptas en caso necesario o aquellas en las que no tienes disponibilidad.'
  ).slice(0, 500);
  const organizerName = (
    payload.organizer.trim() ||
    user.displayName ||
    'Organización'
  ).slice(0, 80);
  const location = (payload.location.trim() || 'Por definir').slice(0, 140);
  const dates = Array.from(
    new Set(payload.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  )
    .sort()
    .slice(0, 14);

  if (!title || dates.length === 0) {
    throw new Error('Se requiere un título y al menos una fecha válida.');
  }

  const startHour = Math.max(6, Math.min(20, Math.round(payload.startHour)));
  const endHour = Math.max(
    startHour + 1,
    Math.min(22, Math.round(payload.endHour))
  );
  const slotMinutes = payload.slotMinutes === 30 ? 30 : 60;
  const durationMinutes = Math.max(
    15,
    Math.min(480, Math.round(payload.durationMinutes || 60))
  );

  const meetingPath = `meetings/${meetingId}`;
  try {
    await setDoc(doc(db, 'meetings', meetingId), {
      id: meetingId,
      title,
      description,
      organizerName,
      organizerUid: user.uid,
      location,
      durationMinutes,
      dates,
      startHour,
      endHour,
      slotMinutes,
      visibility: 'shared',
      confirmedSlotId: null,
      confirmedNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, meetingPath);
  }

  // Register organizer as initial participant using user.uid so each UGR user has one entry
  const participantId = user.uid;
  const participantPath = `meetings/${meetingId}/participants/${participantId}`;
  try {
    await setDoc(doc(db, 'meetings', meetingId, 'participants', participantId), {
      id: participantId,
      meetingId,
      ownerUid: user.uid,
      isShared: true,
      name: organizerName,
      role: 'Organización · UGR',
      note: '',
      slots: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, participantPath);
  }

  return meetingId;
}

export async function updateMeetingInFirestore(
  meetingId: string,
  payload: {
    title: string;
    description: string;
    organizer: string;
    location: string;
    durationMinutes: number;
    dates: string[];
    startHour: number;
    endHour: number;
    slotMinutes: number;
    currentConfirmedSlotId?: string | null;
  }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isUgrEmail(user.email)) {
    throw new Error(
      'Debes iniciar sesión con tu correo de la UGR (@ugr.es, @go.ugr.es o @correo.ugr.es) para editar una reunión.'
    );
  }

  const title = payload.title.trim().slice(0, 140);
  const description = payload.description.trim().slice(0, 500);
  const organizerName = (
    payload.organizer.trim() ||
    user.displayName ||
    'Organización'
  ).slice(0, 80);
  const location = (payload.location.trim() || 'Por definir').slice(0, 140);
  const dates = Array.from(
    new Set(payload.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  )
    .sort()
    .slice(0, 14);

  if (!title || dates.length === 0) {
    throw new Error('Se requiere un título y al menos una fecha válida.');
  }

  const startHour = Math.max(6, Math.min(20, Math.round(payload.startHour)));
  const endHour = Math.max(
    startHour + 1,
    Math.min(22, Math.round(payload.endHour))
  );
  const slotMinutes = payload.slotMinutes === 30 ? 30 : 60;
  const durationMinutes = Math.max(
    15,
    Math.min(480, Math.round(payload.durationMinutes || 60))
  );

  // Check if an existing confirmedSlotId remains valid under the updated schedule
  let shouldClearConfirmation = false;
  if (payload.currentConfirmedSlotId) {
    const validIds = new Set<string>();
    const startMin = startHour * 60;
    const endMin = endHour * 60;
    for (const date of dates) {
      for (let m = startMin; m < endMin; m += slotMinutes) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        validIds.add(`${date}__${hh}:${mm}`);
      }
    }
    if (!validIds.has(payload.currentConfirmedSlotId)) {
      shouldClearConfirmation = true;
    }
  }

  const updateData: Record<string, unknown> = {
    title,
    description,
    organizerName,
    location,
    durationMinutes,
    dates,
    startHour,
    endHour,
    slotMinutes,
    updatedAt: serverTimestamp(),
  };

  if (shouldClearConfirmation) {
    updateData.confirmedSlotId = null;
    updateData.confirmedNote = '';
  }

  const meetingPath = `meetings/${meetingId}`;
  try {
    await updateDoc(doc(db, 'meetings', meetingId), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, meetingPath);
  }
}

export async function saveParticipantAvailabilityInFirestore(
  meetingId: string,
  payload: {
    participantId?: string;
    name: string;
    role: string;
    note: string;
    slots: Record<string, AvailabilityStatus>;
  }
): Promise<string> {
  const user = auth.currentUser;
  if (!user || !isUgrEmail(user.email)) {
    throw new Error(
      'Debes iniciar sesión con tu correo de la UGR (@ugr.es, @go.ugr.es o @correo.ugr.es) para guardar tu disponibilidad.'
    );
  }

  const name = payload.name.trim().slice(0, 80);
  if (!name) {
    throw new Error('Tu nombre de perfil es obligatorio.');
  }
  const role = payload.role.trim().slice(0, 80);
  const note = payload.note.trim().slice(0, 280);
  const slots = sanitizeSlots(payload.slots);

  if (payload.participantId) {
    const path = `meetings/${meetingId}/participants/${payload.participantId}`;
    try {
      await updateDoc(
        doc(db, 'meetings', meetingId, 'participants', payload.participantId),
        {
          name,
          role: role || 'UGR',
          note,
          slots,
          updatedAt: serverTimestamp(),
        }
      );
      return payload.participantId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Self-registration uses user.uid as document ID
  const participantId = user.uid;
  const path = `meetings/${meetingId}/participants/${participantId}`;
  try {
    await setDoc(doc(db, 'meetings', meetingId, 'participants', participantId), {
      id: participantId,
      meetingId,
      ownerUid: user.uid,
      isShared: true,
      name,
      role: role || 'UGR',
      note,
      slots,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return participantId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeParticipantInFirestore(
  meetingId: string,
  participantId: string
): Promise<void> {
  const path = `meetings/${meetingId}/participants/${participantId}`;
  try {
    await deleteDoc(doc(db, 'meetings', meetingId, 'participants', participantId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function confirmMeetingSlotInFirestore(
  meetingId: string,
  slotId: string | null,
  confirmedNote: string
): Promise<void> {
  const path = `meetings/${meetingId}`;
  try {
    await updateDoc(doc(db, 'meetings', meetingId), {
      confirmedSlotId: slotId ? slotId.trim().slice(0, 40) : null,
      confirmedNote: confirmedNote.trim().slice(0, 280),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMeetingInFirestore(
  meetingId: string
): Promise<void> {
  const participantsPath = `meetings/${meetingId}/participants`;
  try {
    const snap = await getDocs(
      query(collection(db, participantsPath), where('isShared', '==', true))
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, participantsPath);
  }

  const meetingPath = `meetings/${meetingId}`;
  try {
    await deleteDoc(doc(db, 'meetings', meetingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, meetingPath);
  }
}

