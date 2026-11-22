import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  HelpCircle,
  LayoutGrid,
  Link2,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { AvailabilityEditorGrid } from './components/AvailabilityEditorGrid.tsx';
import { GroupConsensusMatrix } from './components/GroupConsensusMatrix.tsx';
import { HelpDrawer } from './components/HelpDrawer.tsx';
import { MonthlyCalendarView } from './components/MonthlyCalendarView.tsx';
import {
  NewMeetingDrawer,
  type MeetingFormPayload,
} from './components/NewMeetingDrawer.tsx';
import { ParticipantsPanel } from './components/ParticipantsPanel.tsx';
import { SlidingSlotDrawer } from './components/SlidingSlotDrawer.tsx';
import { auth, googleProvider, isUgrEmail } from './firebase.ts';
import {
  confirmMeetingSlotInFirestore,
  createMeetingInFirestore,
  deleteMeetingInFirestore,
  removeParticipantInFirestore,
  saveParticipantAvailabilityInFirestore,
  subscribeMeetingParticipants,
  subscribeSharedMeetings,
  updateMeetingInFirestore,
} from './services/firestoreMeetings.ts';
import {
  computeAllConsensus,
  filterSlotsForMeeting,
  formatDateLong,
  getMeetingEndTime,
  getTopRecommendedSlots,
} from './utils/schedule.ts';
import type {
  AvailabilityStatus,
  Meeting,
  ParticipantResponse,
} from './types/meeting.ts';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [rawMeetings, setRawMeetings] = useState<
    Omit<Meeting, 'participants'>[]
  >([]);
  const [participantsByMeeting, setParticipantsByMeeting] = useState<
    Record<string, ParticipantResponse[]>
  >({});

  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'detail' | 'calendar'>('detail');
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [defaultNewMeetingDate, setDefaultNewMeetingDate] = useState<
    string | null
  >(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // 1. Track Firebase Auth state and enforce institutional UGR email
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && !isUgrEmail(firebaseUser.email)) {
        void signOut(auth);
        setUser(null);
        setError(
          'Solo se permite el acceso con una cuenta de correo de la UGR (@ugr.es, @go.ugr.es o @correo.ugr.es).'
        );
      } else {
        setUser(firebaseUser);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Real-time Firestore subscription to all shared meetings.
  // Las reglas solo permiten leer a cuentas UGR verificadas, así que no se
  // suscribe nada hasta que hay sesión.
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (!authReady) return;
    if (!userUid) {
      setRawMeetings([]);
      setParticipantsByMeeting({});
      setActiveMeetingId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsub = subscribeSharedMeetings(
      (list) => {
        setRawMeetings(list);
        setIsLoading(false);
        setError(null);

        setActiveMeetingId((prev) => {
          if (prev && list.some((m) => m.id === prev)) return prev;
          const urlParams = new URLSearchParams(window.location.search);
          const urlMeetingId = urlParams.get('reunion');
          if (urlMeetingId && list.some((m) => m.id === urlMeetingId)) {
            return urlMeetingId;
          }
          return list[0]?.id ?? null;
        });
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [authReady, userUid]);

  // 3. Real-time Firestore subscription to participants of the active meeting
  useEffect(() => {
    if (!activeMeetingId || !userUid) return;
    const unsub = subscribeMeetingParticipants(
      activeMeetingId,
      (participants) => {
        setParticipantsByMeeting((prev) => ({
          ...prev,
          [activeMeetingId]: participants,
        }));
      },
      (err) => {
        setError(err.message);
      }
    );
    return () => unsub();
  }, [activeMeetingId, userUid]);

  const meetings: Meeting[] = useMemo(
    () =>
      rawMeetings.map((m) => ({
        ...m,
        participants: participantsByMeeting[m.id] ?? [],
      })),
    [rawMeetings, participantsByMeeting]
  );

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeMeetingId) ?? null,
    [meetings, activeMeetingId]
  );

  // Sync URL query param
  useEffect(() => {
    if (!activeMeeting) return;
    const url = new URL(window.location.href);
    url.searchParams.set('reunion', activeMeeting.id);
    window.history.replaceState({}, '', url.toString());
  }, [activeMeeting?.id]);

  const myParticipant = useMemo(() => {
    if (!activeMeeting || !user) return null;
    return (
      activeMeeting.participants.find((p) => p.ownerUid === user.uid) ?? null
    );
  }, [activeMeeting, user]);

  const isOrganizer = Boolean(
    user && activeMeeting && activeMeeting.organizerUid === user.uid
  );

  const consensusList = useMemo(
    () => (activeMeeting ? computeAllConsensus(activeMeeting) : []),
    [activeMeeting]
  );

  const topSlots = useMemo(
    () => (activeMeeting ? getTopRecommendedSlots(activeMeeting, 1) : []),
    [activeMeeting]
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

  const handleSignIn = useCallback(async (): Promise<User | null> => {
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!isUgrEmail(cred.user.email)) {
        await signOut(auth);
        setError(
          'Solo se permite el acceso con una cuenta de correo de la UGR (@ugr.es, @go.ugr.es o @correo.ugr.es).'
        );
        return null;
      }
      return cred.user;
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      // Cerrar la ventana emergente no es un error para el usuario.
      if (
        code !== 'auth/popup-closed-by-user' &&
        code !== 'auth/cancelled-popup-request'
      ) {
        setError(
          code === 'auth/popup-blocked'
            ? 'El navegador ha bloqueado la ventana de inicio de sesión. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.'
            : 'No se pudo iniciar sesión con tu cuenta de la UGR. Inténtalo de nuevo.'
        );
      }
      return null;
    }
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleOpenNewMeeting = async (preselectedDate?: string | null) => {
    if (!user) {
      const signedIn = await handleSignIn();
      if (!signedIn) return;
    }
    setEditingMeeting(null);
    setDefaultNewMeetingDate(preselectedDate ?? null);
    setIsNewMeetingOpen(true);
  };

  const handleOpenEditMeeting = async (meeting: Meeting) => {
    if (!user) {
      const signedIn = await handleSignIn();
      if (!signedIn) return;
    }
    setDefaultNewMeetingDate(null);
    setEditingMeeting(meeting);
    setIsNewMeetingOpen(true);
    setIsMobileSidebarOpen(false);
  };

  const handleNavigateDetailSection = (sectionId: string) => {
    setViewMode('detail');
    window.setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: 'smooth' });
    }, 40);
  };

  const handleSelectMeeting = (meeting: Meeting) => {
    setActiveMeetingId(meeting.id);
    setSelectedSlotId(null);
    setViewMode('detail');
    setIsMobileSidebarOpen(false);
  };

  const handleCreateMeeting = async (payload: MeetingFormPayload) => {
    const newId = await createMeetingInFirestore(payload);
    setActiveMeetingId(newId);
    setSelectedSlotId(null);
  };

  const handleUpdateMeeting = async (
    meetingId: string,
    payload: MeetingFormPayload
  ) => {
    const target = meetings.find((m) => m.id === meetingId);
    await updateMeetingInFirestore(meetingId, {
      ...payload,
      currentConfirmedSlotId: target?.confirmedSlotId ?? null,
    });
    setSelectedSlotId(null);
  };

  const handleSaveAvailability = async (payload: {
    participantId?: string;
    name: string;
    role: string;
    note: string;
    slots: Record<string, AvailabilityStatus>;
  }) => {
    if (!activeMeeting) return;
    await saveParticipantAvailabilityInFirestore(activeMeeting.id, {
      ...payload,
      // Descarta franjas de fechas u horas que el organizador ya ha quitado.
      slots: filterSlotsForMeeting(activeMeeting, payload.slots),
    });
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (!activeMeeting) return;
    const target = activeMeeting.participants.find((p) => p.id === participantId);
    const isSelf = target?.ownerUid === user?.uid;
    const question = isSelf
      ? '¿Quieres retirarte de esta reunión? Se borrará tu disponibilidad.'
      : `¿Quieres quitar a ${target?.name ?? 'esta persona'} de la reunión? Se borrará su disponibilidad.`;
    if (!window.confirm(question)) return;
    setError(null);
    try {
      await removeParticipantInFirestore(activeMeeting.id, participantId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo eliminar al participante.'
      );
    }
  };

  const handleConfirmSlot = async (slotId: string | null, note: string) => {
    if (!activeMeeting) return;
    await confirmMeetingSlotInFirestore(activeMeeting.id, slotId, note);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    const target = meetings.find((m) => m.id === meetingId);
    if (
      !window.confirm(
        `¿Seguro que quieres eliminar «${target?.title ?? 'esta reunión'}»? Se borrarán también las respuestas de todos los participantes. No se puede deshacer.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteMeetingInFirestore(meetingId);
      if (activeMeetingId === meetingId) {
        setSelectedSlotId(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar la reunión.'
      );
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
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'calendar' ? 'text-[#0B1F3A] font-semibold' : ''
            }`}
          >
            Calendario
          </button>
          <button
            type="button"
            onClick={() => handleNavigateDetailSection('mi-disponibilidad')}
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Mi disponibilidad
          </button>
          <button
            type="button"
            onClick={() => handleNavigateDetailSection('consenso-grupal')}
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Consenso
          </button>
          <button
            type="button"
            onClick={() => handleNavigateDetailSection('participantes')}
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Participantes
          </button>
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ayuda
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => handleOpenNewMeeting()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva reunión</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Sidebar + Content Viewport */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Sidebar */}
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
                const canManage = Boolean(user && m.organizerUid === user.uid);
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
                      className={`w-full text-left px-3.5 py-3 cursor-pointer ${
                        canManage ? 'pr-14' : 'pr-3.5'
                      }`}
                    >
                      <div className="text-sm font-semibold leading-snug line-clamp-2">
                        {m.title}
                      </div>
                      <div
                        className={`mt-1.5 flex items-center gap-1.5 text-xs tabular-nums ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span>{m.dates.length} días</span>
                        {m.confirmedSlotId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Confirmada</span>
                          </>
                        )}
                      </div>
                    </button>

                    {canManage && (
                      <div className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMeetingId(m.id);
                            handleOpenEditMeeting(m);
                          }}
                          aria-label={`Editar ${m.title}`}
                          title="Editar reunión"
                          className={`p-1 rounded cursor-pointer ${
                            isSelected
                              ? 'text-slate-300 hover:text-white'
                              : 'text-slate-400 hover:text-[#0B1F3A]'
                          }`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteMeeting(m.id);
                          }}
                          aria-label={`Eliminar ${m.title}`}
                          title="Eliminar reunión"
                          className={`p-1 rounded cursor-pointer ${
                            isSelected
                              ? 'text-slate-300 hover:text-white'
                              : 'text-slate-400 hover:text-rose-700'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Account Status in Sidebar Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/60">
            {!authReady ? (
              <div className="text-xs text-slate-400">Verificando sesión...</div>
            ) : user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#0B1F3A] truncate">
                    {user.displayName || 'Usuario conectado'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                  className="p-2 text-slate-500 hover:text-[#0B1F3A] hover:bg-slate-200/70 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full h-9 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Acceder con correo UGR</span>
              </button>
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
              <p className="text-sm text-rose-800 break-words">{error}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cerrar</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B1F3A] bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recargar</span>
                </button>
              </div>
            </div>
          )}

          {/* Workspace View Mode Bar */}
          {!isLoading && user && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Cambiar vista del espacio de trabajo"
                className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-lg"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'detail'}
                  onClick={() => setViewMode('detail')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'detail'
                      ? 'bg-[#0B1F3A] text-white'
                      : 'text-slate-600 hover:text-[#0B1F3A]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Detalle de reunión</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'calendar'}
                  onClick={() => setViewMode('calendar')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'calendar'
                      ? 'bg-[#0B1F3A] text-white'
                      : 'text-slate-600 hover:text-[#0B1F3A]'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Vista mensual</span>
                </button>
              </div>

              <span className="text-xs text-slate-500 tabular-nums">
                {meetings.length}{' '}
                {meetings.length === 1
                  ? 'reunión registrada'
                  : 'reuniones registradas'}
              </span>
            </div>
          )}

          {authReady && !user ? (
            <div className="bg-white border border-slate-200/90 rounded-xl p-12 text-center">
              <h1 className="text-xl font-semibold text-[#0B1F3A]">
                Accede con tu cuenta de la UGR
              </h1>
              <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                Las reuniones y la disponibilidad de los participantes solo son visibles para cuentas institucionales (@ugr.es, @go.ugr.es o @correo.ugr.es).
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Cómo funciona</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Acceder con correo UGR</span>
                </button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-6" aria-busy="true">
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-44 animate-pulse" />
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-72 animate-pulse" />
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 h-64 animate-pulse" />
            </div>
          ) : viewMode === 'calendar' ? (
            <MonthlyCalendarView
              meetings={meetings}
              activeMeetingId={activeMeetingId}
              currentUserUid={user?.uid ?? null}
              onOpenMeeting={(meetingId) => {
                setActiveMeetingId(meetingId);
                setSelectedSlotId(null);
                setViewMode('detail');
              }}
              onEditMeeting={(meeting) => handleOpenEditMeeting(meeting)}
              onCreateMeetingOnDate={(date) => handleOpenNewMeeting(date)}
            />
          ) : !activeMeeting ? (
            <div className="bg-white border border-slate-200/90 rounded-xl p-12 text-center">
              <h1 className="text-xl font-semibold text-[#0B1F3A]">
                Sin reuniones activas
              </h1>
              <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                Crea una nueva reunión para definir las franjas horarias y compartir el enlace con los participantes en tiempo real.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Cómo funciona</span>
                </button>
                {!user && (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Acceder con correo UGR</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenNewMeeting()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear primera reunión</span>
                </button>
              </div>
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

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {!user && (
                      <button
                        type="button"
                        onClick={handleSignIn}
                        className="inline-flex items-center gap-2 h-9 px-3.5 text-xs font-medium text-[#0B1F3A] bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Acceder con correo UGR</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsHelpOpen(true)}
                      className="md:hidden inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Ayuda</span>
                    </button>

                    {isOrganizer && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditMeeting(activeMeeting)}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-[#0B1F3A] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar reunión</span>
                      </button>
                    )}

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
                          <span>Copiar enlace</span>
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
                          Horario confirmado:{' '}
                          {formatDateLong(confirmedConsensus.slot.date)} ·{' '}
                          <span className="font-mono tabular-nums">
                            {confirmedConsensus.slot.startTime} –{' '}
                            {getMeetingEndTime(
                            activeMeeting,
                            confirmedConsensus.slot.startTime
                          )}
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

                {/* 3-Column Clinical Summary Strip */}
                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-6">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Participantes
                    </div>
                    <div className="mt-0.5 font-mono text-xl font-semibold text-[#0B1F3A] tabular-nums">
                      {activeMeeting.participants.length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Mejor coincidencia
                    </div>
                    <div className="mt-0.5 font-mono text-xl font-semibold text-[#059669] tabular-nums">
                      {bestMatchPct}%
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Estado
                    </div>
                    <div className="mt-0.5 text-base font-semibold text-[#0B1F3A] leading-7">
                      {confirmedConsensus ? 'Confirmada' : 'Abierta'}
                    </div>
                  </div>
                </div>
              </section>

              {/* 1. Availability Editor (Available / Adaptable / Unavailable) */}
              <AvailabilityEditorGrid
                meeting={activeMeeting}
                myParticipant={myParticipant}
                currentUser={
                  user
                    ? {
                        uid: user.uid,
                        displayName: user.displayName,
                        email: user.email,
                      }
                    : null
                }
                onSignIn={async () => {
                  await handleSignIn();
                }}
                onSaveAvailability={handleSaveAvailability}
              />

              {/* 2. Group Consensus Matrix + Top Recommendations */}
              <GroupConsensusMatrix
                meeting={activeMeeting}
                consensusList={consensusList}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(slotId) => setSelectedSlotId(slotId)}
              />

              {/* 3. Participants Summary Table */}
              <ParticipantsPanel
                meeting={activeMeeting}
                currentUserUid={user?.uid ?? null}
                isOrganizer={isOrganizer}
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
          currentUserUid={user?.uid ?? null}
          canConfirm={isOrganizer}
          onClose={() => setSelectedSlotId(null)}
          onConfirmSlot={handleConfirmSlot}
          onScrollToMyAvailability={() => {
            document
              .getElementById('mi-disponibilidad')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      <NewMeetingDrawer
        isOpen={isNewMeetingOpen}
        editingMeeting={editingMeeting}
        defaultDate={defaultNewMeetingDate}
        onClose={() => {
          setIsNewMeetingOpen(false);
          setEditingMeeting(null);
          setDefaultNewMeetingDate(null);
        }}
        onCreateMeeting={handleCreateMeeting}
        onUpdateMeeting={handleUpdateMeeting}
      />

      <HelpDrawer isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
