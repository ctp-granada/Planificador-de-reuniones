import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Check,
  Link2,
  Menu,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { AvailabilityEditorGrid } from './components/AvailabilityEditorGrid.tsx';
import { ConsensusCurveChart } from './components/ConsensusCurveChart.tsx';
import { GroupConsensusMatrix } from './components/GroupConsensusMatrix.tsx';
import { NewMeetingDrawer } from './components/NewMeetingDrawer.tsx';
import { NewParticipantDrawer } from './components/NewParticipantDrawer.tsx';
import { ParticipantsPanel } from './components/ParticipantsPanel.tsx';
import { SlidingSlotDrawer } from './components/SlidingSlotDrawer.tsx';
import {
  computeAllConsensus,
  formatDateLong,
  getTopRecommendedSlots,
} from './utils/schedule.ts';
import type { AvailabilityStatus, Meeting } from './types/meeting.ts';

export default function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(
    null
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [isNewParticipantOpen, setIsNewParticipantOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadMeetings = useCallback(async (preferredMeetingId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) {
        throw new Error('No se pudieron cargar las reuniones.');
      }
      const data = (await res.json()) as { meetings: Meeting[] };
      const list = data.meetings ?? [];
      setMeetings(list);

      const urlParams = new URLSearchParams(window.location.search);
      const urlMeetingId = urlParams.get('reunion');
      const targetId = preferredMeetingId ?? urlMeetingId;
      const matched =
        (targetId && list.find((m) => m.id === targetId)) || list[0] || null;

      setActiveMeetingId(matched ? matched.id : null);
      if (matched && matched.participants.length > 0) {
        setActiveParticipantId((prev) =>
          prev && matched.participants.some((p) => p.id === prev)
            ? prev
            : matched.participants[0].id
        );
      } else {
        setActiveParticipantId(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al conectar con el servidor.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeMeetingId) ?? null,
    [meetings, activeMeetingId]
  );

  useEffect(() => {
    if (!activeMeeting) return;
    const url = new URL(window.location.href);
    url.searchParams.set('reunion', activeMeeting.id);
    window.history.replaceState({}, '', url.toString());
  }, [activeMeeting?.id]);

  const activeParticipant = useMemo(() => {
    if (!activeMeeting) return null;
    return (
      activeMeeting.participants.find((p) => p.id === activeParticipantId) ??
      activeMeeting.participants[0] ??
      null
    );
  }, [activeMeeting, activeParticipantId]);

  const consensusList = useMemo(
    () => (activeMeeting ? computeAllConsensus(activeMeeting) : []),
    [activeMeeting]
  );

  const topSlots = useMemo(
    () => getTopRecommendedSlots(consensusList, 1),
    [consensusList]
  );

  const conflictFreeCount = useMemo(
    () =>
      consensusList.filter(
        (c) =>
          c.unavailable.length === 0 &&
          c.available.length + c.adaptable.length > 0
      ).length,
    [consensusList]
  );

  const selectedConsensus = useMemo(() => {
    if (!selectedSlotId) return null;
    return consensusList.find((c) => c.slot.id === selectedSlotId) ?? null;
  }, [consensusList, selectedSlotId]);

  const confirmedConsensus = useMemo(() => {
    if (!activeMeeting?.confirmedSlotId) return null;
    return (
      consensusList.find((c) => c.slot.id === activeMeeting.confirmedSlotId) ??
      null
    );
  }, [consensusList, activeMeeting?.confirmedSlotId]);

  const updateMeetingInState = (updated: Meeting) => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  };

  const handleSelectMeeting = (meeting: Meeting) => {
    setActiveMeetingId(meeting.id);
    setSelectedSlotId(null);
    setActiveParticipantId(meeting.participants[0]?.id ?? null);
    setIsMobileSidebarOpen(false);
  };

  const handleCreateMeeting = async (payload: {
    title: string;
    description: string;
    organizer: string;
    location: string;
    durationMinutes: number;
    dates: string[];
    startHour: number;
    endHour: number;
    slotMinutes: number;
  }) => {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al crear la reunión.');
    }
    const { meeting } = (await res.json()) as { meeting: Meeting };
    setMeetings((prev) => [meeting, ...prev]);
    setActiveMeetingId(meeting.id);
    setActiveParticipantId(meeting.participants[0]?.id ?? null);
    setSelectedSlotId(null);
  };

  const handleSaveAvailability = async (payload: {
    participantId: string;
    name: string;
    role: string;
    note: string;
    slots: Record<string, AvailabilityStatus>;
  }) => {
    if (!activeMeeting) return;
    const res = await fetch(
      `/api/meetings/${activeMeeting.id}/participants`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      throw new Error('No se pudo guardar la disponibilidad.');
    }
    const { meeting } = (await res.json()) as { meeting: Meeting };
    updateMeetingInState(meeting);
  };

  const handleAddParticipant = async (payload: {
    name: string;
    role: string;
  }) => {
    if (!activeMeeting) return;
    const res = await fetch(
      `/api/meetings/${activeMeeting.id}/participants`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          role: payload.role,
          note: '',
          slots: {},
        }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo añadir al participante.');
    }
    const { meeting, participant } = (await res.json()) as {
      meeting: Meeting;
      participant: { id: string };
    };
    updateMeetingInState(meeting);
    setActiveParticipantId(participant.id);
    document
      .getElementById('mi-disponibilidad')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (!activeMeeting) return;
    const res = await fetch(
      `/api/meetings/${activeMeeting.id}/participants/${participantId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) return;
    const { meeting } = (await res.json()) as { meeting: Meeting };
    updateMeetingInState(meeting);
    if (activeParticipantId === participantId) {
      setActiveParticipantId(meeting.participants[0]?.id ?? null);
    }
  };

  const handleConfirmSlot = async (slotId: string | null, note: string) => {
    if (!activeMeeting) return;
    const res = await fetch(`/api/meetings/${activeMeeting.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, confirmedNote: note }),
    });
    if (!res.ok) return;
    const { meeting } = (await res.json()) as { meeting: Meeting };
    updateMeetingInState(meeting);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return;
    const remaining = meetings.filter((m) => m.id !== meetingId);
    setMeetings(remaining);
    if (activeMeetingId === meetingId) {
      const next = remaining[0] ?? null;
      setActiveMeetingId(next?.id ?? null);
      setActiveParticipantId(next?.participants[0]?.id ?? null);
      setSelectedSlotId(null);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!activeMeeting) return;
    const url = new URL(window.location.href);
    url.searchParams.set('reunion', activeMeeting.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const bestMatchPct =
    topSlots[0] && topSlots[0].totalParticipants > 0
      ? Math.round(topSlots[0].feasibleRatio * 100)
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0B1F3A]">
      {/* Top Bar Contract: Brand wordmark — 4 concise nav links — 1 primary CTA */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen((v) => !v)}
            aria-label="Abrir lista de reuniones"
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0B1F3A] rounded-lg cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <a
            href="#resumen"
            className="text-lg font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0"
          >
            Planificador de reuniones
          </a>
        </div>

        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <a
            href="#resumen"
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0"
          >
            Resumen
          </a>
          <a
            href="#mi-disponibilidad"
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0"
          >
            Mi disponibilidad
          </a>
          <a
            href="#consenso-grupal"
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0"
          >
            Consenso
          </a>
          <a
            href="#participantes"
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0"
          >
            Participantes
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsNewMeetingOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva reunión</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Sidebar + Content Viewport */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Sidebar (Desktop fixed column + Mobile slide-over) */}
        <aside
          aria-label="Reuniones activas"
          className={`${
            isMobileSidebarOpen
              ? 'fixed inset-y-0 left-0 z-40 w-72 bg-white shadow-xl flex'
              : 'hidden'
          } lg:static lg:flex lg:w-68 lg:shrink-0 flex-col border-r border-slate-200 bg-white`}
        >
          <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 tracking-wide">
              Reuniones de grupo
            </h2>
            {isMobileSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                aria-label="Cerrar menú"
                className="lg:hidden p-1 text-slate-400 hover:text-[#0B1F3A]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {meetings.length === 0 ? (
              <p className="px-3 py-6 text-xs text-slate-400 text-center">
                No hay reuniones creadas todavía.
              </p>
            ) : (
              meetings.map((m) => {
                const isSelected = m.id === activeMeeting?.id;
                return (
                  <div
                    key={m.id}
                    className={`group relative rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-[#0B1F3A] text-white'
                        : 'hover:bg-slate-50 text-[#0B1F3A]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectMeeting(m)}
                      className="w-full text-left px-3.5 py-3 pr-9 cursor-pointer"
                    >
                      <div className="text-sm font-semibold leading-snug line-clamp-2">
                        {m.title}
                      </div>
                      <div
                        className={`mt-1.5 flex items-center gap-1.5 text-xs tabular-nums ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span>{m.participants.length} participantes</span>
                        <span aria-hidden="true">·</span>
                        <span>{m.dates.length} días</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMeeting(m.id);
                      }}
                      aria-label={`Eliminar ${m.title}`}
                      className={`absolute top-3 right-2.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                        isSelected
                          ? 'text-slate-300 hover:text-white'
                          : 'text-slate-400 hover:text-rose-700'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="bg-white border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <p className="text-sm text-rose-800">{error}</p>
              <button
                type="button"
                onClick={() => loadMeetings()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B1F3A] bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-6" aria-busy="true">
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-44 animate-pulse" />
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-72 animate-pulse" />
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-64 animate-pulse" />
            </div>
          ) : !activeMeeting ? (
            <div className="bg-white border border-slate-200/90 rounded-xl p-12 text-center">
              <h1 className="text-xl font-semibold text-[#0B1F3A]">
                Sin reuniones activas
              </h1>
              <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                Crea una nueva reunión para definir las franjas horarias y recopilar la disponibilidad de tu equipo.
              </p>
              <button
                type="button"
                onClick={() => setIsNewMeetingOpen(true)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear primera reunión</span>
              </button>
            </div>
          ) : (
            <>
              {/* Overview & 4-KPI Strip */}
              <section
                id="resumen"
                className="bg-white border border-slate-200/90 rounded-xl p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Organiza: {activeMeeting.organizer}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeMeeting.durationMinutes} min
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMeeting.location}</span>
                    </div>
                    <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight text-balance">
                      {activeMeeting.title}
                    </h1>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {activeMeeting.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyInviteLink}
                      className="inline-flex items-center gap-2 h-9 px-3.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#059669]" />
                          <span className="text-[#047857]">Enlace copiado</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Copiar enlace de invitación</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirmed Slot Notice */}
                {confirmedConsensus && (
                  <div className="mt-5 p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <CalendarCheck2 className="w-5 h-5 text-[#047857] shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-[#064E3B]">
                          Horario confirmado: {formatDateLong(confirmedConsensus.slot.date)} ·{' '}
                          <span className="font-mono tabular-nums">
                            {confirmedConsensus.slot.startTime} –{' '}
                            {confirmedConsensus.slot.endTime}
                          </span>
                        </div>
                        {activeMeeting.confirmedNote && (
                          <p className="text-xs text-[#047857] mt-0.5">
                            {activeMeeting.confirmedNote}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSlotId(confirmedConsensus.slot.id)
                      }
                      className="text-xs font-semibold text-[#047857] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Ver detalle
                    </button>
                  </div>
                )}

                {/* 4-Column Clinical Metric Strip */}
                <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Participantes activos
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-[#0B1F3A] tabular-nums">
                      {activeMeeting.participants.length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Mayor viabilidad grupal
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-[#059669] tabular-nums">
                      {bestMatchPct}%
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Franjas sin incompatibles
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-[#0B1F3A] tabular-nums">
                      {conflictFreeCount}
                      <span className="text-sm font-normal text-slate-400">
                        /{consensusList.length}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Estado de convocatoria
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[#0B1F3A] leading-8">
                      {confirmedConsensus ? 'Horario fijado' : 'Recogiendo votos'}
                    </div>
                  </div>
                </div>
              </section>

              {/* 1. Availability Editor (Available / Adaptable / Unavailable) */}
              <AvailabilityEditorGrid
                meeting={activeMeeting}
                activeParticipant={activeParticipant}
                onSelectParticipant={(id) => setActiveParticipantId(id)}
                onOpenNewParticipant={() => setIsNewParticipantOpen(true)}
                onSaveAvailability={handleSaveAvailability}
              />

              {/* 2. Smooth Line Chart */}
              <ConsensusCurveChart
                meeting={activeMeeting}
                consensusList={consensusList}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(slotId) => setSelectedSlotId(slotId)}
              />

              {/* 3. Group Consensus Matrix + Top Recommendations */}
              <GroupConsensusMatrix
                meeting={activeMeeting}
                consensusList={consensusList}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(slotId) => setSelectedSlotId(slotId)}
              />

              {/* 4. Participants Summary Table */}
              <ParticipantsPanel
                meeting={activeMeeting}
                activeParticipantId={activeParticipant?.id ?? null}
                onSelectParticipant={(id) => setActiveParticipantId(id)}
                onOpenNewParticipant={() => setIsNewParticipantOpen(true)}
                onRemoveParticipant={handleRemoveParticipant}
              />
            </>
          )}
        </main>
      </div>

      {/* Sliding Detail Card Drawers */}
      {activeMeeting && (
        <SlidingSlotDrawer
          meeting={activeMeeting}
          consensus={selectedConsensus}
          onClose={() => setSelectedSlotId(null)}
          onConfirmSlot={handleConfirmSlot}
          onSelectParticipantForEdit={(id) => {
            setActiveParticipantId(id);
            document
              .getElementById('mi-disponibilidad')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      <NewMeetingDrawer
        isOpen={isNewMeetingOpen}
        onClose={() => setIsNewMeetingOpen(false)}
        onCreateMeeting={handleCreateMeeting}
      />

      <NewParticipantDrawer
        isOpen={isNewParticipantOpen}
        onClose={() => setIsNewParticipantOpen(false)}
        onAddParticipant={handleAddParticipant}
      />
    </div>
  );
}
