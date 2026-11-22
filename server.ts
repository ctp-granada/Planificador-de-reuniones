import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AvailabilityStatus, Meeting, ParticipantResponse } from './src/types/meeting.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'meetings.json');

function createSeedMeetings(): Meeting[] {
  return [];
}

function ensureStore(): Meeting[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const seed = createSeedMeetings();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Recover with empty store if corrupted
  }
  const seed = createSeedMeetings();
  fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf-8');
  return seed;
}

function saveStore(meetings: Meeting[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(meetings, null, 2), 'utf-8');
}

function sanitizeSlots(
  slots: unknown
): Record<string, AvailabilityStatus> {
  const clean: Record<string, AvailabilityStatus> = {};
  if (!slots || typeof slots !== 'object') return clean;
  for (const [key, val] of Object.entries(slots as Record<string, unknown>)) {
    if (
      typeof key === 'string' &&
      key.length <= 40 &&
      (val === 'available' || val === 'adaptable' || val === 'unavailable')
    ) {
      clean[key] = val;
    }
  }
  return clean;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  let meetings: Meeting[] = ensureStore();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/meetings', (_req, res) => {
    res.json({ meetings });
  });

  app.get('/api/meetings/:id', (req, res) => {
    const found = meetings.find((m) => m.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: 'Reunión no encontrada' });
      return;
    }
    res.json({ meeting: found });
  });

  app.post('/api/meetings', (req, res) => {
    const body = req.body ?? {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    const organizer =
      typeof body.organizer === 'string' && body.organizer.trim()
        ? body.organizer.trim()
        : 'Organizador';
    const location =
      typeof body.location === 'string' && body.location.trim()
        ? body.location.trim()
        : 'Por confirmar';
    const dates: string[] = Array.isArray(body.dates)
      ? body.dates
          .filter((d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
          .slice(0, 14)
      : [];
    const startHour = Math.max(6, Math.min(20, Number(body.startHour ?? 9)));
    const endHour = Math.max(startHour + 1, Math.min(22, Number(body.endHour ?? 18)));
    const slotMinutes = body.slotMinutes === 30 ? 30 : 60;
    const durationMinutes = Number(body.durationMinutes) || 60;

    if (!title || dates.length === 0) {
      res.status(400).json({
        error: 'Se requiere un título y al menos una fecha válida.',
      });
      return;
    }

    const sortedDates: string[] = Array.from(new Set<string>(dates)).sort();
    const idSlug =
      title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'reunion';
    const id = `${idSlug}-${crypto.randomBytes(2).toString('hex')}`;

    const newMeeting: Meeting = {
      id,
      title,
      description:
        description ||
        'Selecciona tus franjas disponibles, adaptables o no disponibles para coordinar el horario óptimo.',
      organizer,
      location,
      durationMinutes,
      dates: sortedDates,
      startHour,
      endHour,
      slotMinutes,
      participants: [
        {
          id: `p-${crypto.randomBytes(3).toString('hex')}`,
          name: organizer,
          role: 'Organización',
          note: '',
          slots: {},
          updatedAt: new Date().toISOString(),
        },
      ],
      confirmedSlotId: null,
      confirmedNote: '',
      createdAt: new Date().toISOString(),
    };

    meetings = [newMeeting, ...meetings];
    saveStore(meetings);
    res.status(201).json({ meeting: newMeeting });
  });

  app.put('/api/meetings/:id/participants', (req, res) => {
    const idx = meetings.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Reunión no encontrada' });
      return;
    }

    const body = req.body ?? {};
    const participantId =
      typeof body.participantId === 'string' ? body.participantId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 280) : '';
    const slots = sanitizeSlots(body.slots);

    if (!name) {
      res.status(400).json({ error: 'El nombre del participante es obligatorio.' });
      return;
    }

    const target = meetings[idx];
    const existingIndex = participantId
      ? target.participants.findIndex((p) => p.id === participantId)
      : target.participants.findIndex(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );

    const now = new Date().toISOString();
    let savedParticipant: ParticipantResponse;

    if (existingIndex !== -1) {
      const prev = target.participants[existingIndex];
      savedParticipant = {
        ...prev,
        name,
        role: role || prev.role,
        note,
        slots,
        updatedAt: now,
      };
      target.participants[existingIndex] = savedParticipant;
    } else {
      savedParticipant = {
        id: `p-${crypto.randomBytes(4).toString('hex')}`,
        name,
        role: role || 'Participante',
        note,
        slots,
        updatedAt: now,
      };
      target.participants.push(savedParticipant);
    }

    meetings[idx] = { ...target };
    saveStore(meetings);
    res.json({ meeting: meetings[idx], participant: savedParticipant });
  });

  app.delete('/api/meetings/:id/participants/:participantId', (req, res) => {
    const idx = meetings.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Reunión no encontrada' });
      return;
    }
    const target = meetings[idx];
    target.participants = target.participants.filter(
      (p) => p.id !== req.params.participantId
    );
    meetings[idx] = { ...target };
    saveStore(meetings);
    res.json({ meeting: meetings[idx] });
  });

  app.post('/api/meetings/:id/confirm', (req, res) => {
    const idx = meetings.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Reunión no encontrada' });
      return;
    }
    const body = req.body ?? {};
    const slotId =
      typeof body.slotId === 'string' && body.slotId.trim()
        ? body.slotId.trim()
        : null;
    const confirmedNote =
      typeof body.confirmedNote === 'string'
        ? body.confirmedNote.trim().slice(0, 280)
        : '';

    meetings[idx] = {
      ...meetings[idx],
      confirmedSlotId: slotId,
      confirmedNote,
    };
    saveStore(meetings);
    res.json({ meeting: meetings[idx] });
  });

  app.delete('/api/meetings/:id', (req, res) => {
    const next = meetings.filter((m) => m.id !== req.params.id);
    if (next.length === meetings.length) {
      res.status(404).json({ error: 'Reunión no encontrada' });
      return;
    }
    meetings = next;
    saveStore(meetings);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Planificador de reuniones server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
