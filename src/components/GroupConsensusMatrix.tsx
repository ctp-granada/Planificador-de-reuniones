import React, { useMemo, useState } from 'react';
import { CalendarCheck2, Check, Clock, X } from 'lucide-react';
import {
  buildSlotId,
  formatDateShort,
  generateHourRows,
  getTopRecommendedSlots,
} from '../utils/schedule.ts';
import type { Meeting, SlotConsensus } from '../types/meeting.ts';

type MatrixFilter = 'all' | 'no-conflicts' | 'high-consensus';

interface GroupConsensusMatrixProps {
  meeting: Meeting;
  consensusList: SlotConsensus[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
}

export const GroupConsensusMatrix: React.FC<GroupConsensusMatrixProps> = ({
  meeting,
  consensusList,
  selectedSlotId,
  onSelectSlot,
}) => {
  const [filter, setFilter] = useState<MatrixFilter>('all');

  const hourRows = useMemo(() => generateHourRows(meeting), [meeting]);

  const consensusMap = useMemo(() => {
    const map = new Map<string, SlotConsensus>();
    for (const item of consensusList) {
      map.set(item.slot.id, item);
    }
    return map;
  }, [consensusList]);

  const topSlots = useMemo(
    () => getTopRecommendedSlots(consensusList, 4),
    [consensusList]
  );

  const passesFilter = (item: SlotConsensus | undefined): boolean => {
    if (!item) return true;
    if (filter === 'no-conflicts') {
      return (
        item.unavailable.length === 0 &&
        item.available.length + item.adaptable.length > 0
      );
    }
    if (filter === 'high-consensus') {
      return item.feasibleRatio >= 0.75 && item.available.length > 0;
    }
    return true;
  };

  return (
    <section
      id="consenso-grupal"
      aria-labelledby="group-consensus-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2
            id="group-consensus-heading"
            className="text-base font-semibold text-[#0B1F3A] tracking-tight"
          >
            Matriz de consenso grupal
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Haz clic en cualquier franja para deslizar el desglose por participante y fijar la reunión.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar franjas de consenso"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start lg:self-auto"
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
            Todas las franjas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'no-conflicts'}
            onClick={() => setFilter('no-conflicts')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filter === 'no-conflicts'
                ? 'bg-white text-[#0B1F3A] shadow-xs'
                : 'text-slate-600 hover:text-[#0B1F3A]'
            }`}
          >
            Sin conflictos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'high-consensus'}
            onClick={() => setFilter('high-consensus')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filter === 'high-consensus'
                ? 'bg-white text-[#0B1F3A] shadow-xs'
                : 'text-slate-600 hover:text-[#0B1F3A]'
            }`}
          >
            Consenso ≥ 75%
          </button>
        </div>
      </div>

      {/* Recommended Top Windows Strip */}
      {topSlots.length > 0 && (
        <div className="py-5 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h3 className="text-xs font-semibold text-slate-500 tracking-wide">
              Franjas recomendadas por mayor coincidencia
            </h3>
            <span className="text-xs text-slate-400">
              Ponderación: Disponible (+2) · Adaptable (+1) · No disponible (-1.5)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {topSlots.map((item, rank) => {
              const { weekday, dayMonth } = formatDateShort(item.slot.date);
              const isSelected = selectedSlotId === item.slot.id;
              const isConfirmed = meeting.confirmedSlotId === item.slot.id;

              return (
                <button
                  key={item.slot.id}
                  type="button"
                  onClick={() => onSelectSlot(item.slot.id)}
                  className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    isConfirmed
                      ? 'bg-[#ECFDF5]/70 border-[#059669]'
                      : isSelected
                        ? 'bg-slate-50 border-[#0B1F3A]'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 tabular-nums">
                      0{rank + 1}. {weekday} {dayMonth}
                    </span>
                    {isConfirmed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#047857]">
                        <CalendarCheck2 className="w-3.5 h-3.5" />
                        Confirmada
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-[#0B1F3A] tabular-nums">
                    {item.slot.startTime} – {item.slot.endTime}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs tabular-nums">
                    <span className="text-[#047857] font-medium">
                      {item.available.length} disp.
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-amber-700">
                      {item.adaptable.length} adap.
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-rose-700">
                      {item.unavailable.length} no
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Consensus Matrix Table */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse min-w-[540px]">
          <thead>
            <tr>
              <th className="w-24 pb-3 pr-3 text-left text-xs font-medium text-slate-400">
                Franja
              </th>
              {meeting.dates.map((date) => {
                const { weekday, dayMonth } = formatDateShort(date);
                return (
                  <th
                    key={date}
                    className="pb-3 px-1.5 text-center text-xs font-semibold text-[#0B1F3A]"
                  >
                    {weekday} {dayMonth}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hourRows.map((row) => (
              <tr key={row.startTime}>
                <td className="py-1 pr-3 text-left font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                  {row.startTime} – {row.endTime}
                </td>
                {meeting.dates.map((date) => {
                  const slotId = buildSlotId(date, row.startTime);
                  const item = consensusMap.get(slotId);
                  const visible = passesFilter(item);
                  const isSelected = selectedSlotId === slotId;
                  const isConfirmed = meeting.confirmedSlotId === slotId;

                  if (!item || !visible) {
                    return (
                      <td key={slotId} className="p-1">
                        <div className="h-12 rounded-lg border border-dashed border-slate-100 bg-slate-50/40 flex items-center justify-center text-[11px] text-slate-300">
                          —
                        </div>
                      </td>
                    );
                  }

                  const total = Math.max(1, item.totalParticipants);
                  const optPct = Math.round(
                    (item.available.length / total) * 100
                  );
                  const adapPct = Math.round(
                    (item.adaptable.length / total) * 100
                  );

                  const isPerfect =
                    item.available.length === item.totalParticipants &&
                    item.totalParticipants > 0;
                  const isAllFeasible =
                    item.unavailable.length === 0 &&
                    item.available.length + item.adaptable.length ===
                      item.totalParticipants &&
                    item.totalParticipants > 0;

                  let surfaceClass =
                    'bg-white border-slate-200 hover:border-slate-300';
                  if (isConfirmed) {
                    surfaceClass =
                      'bg-[#ECFDF5] border-[#059669] ring-1 ring-[#059669]/30';
                  } else if (isSelected) {
                    surfaceClass =
                      'bg-slate-50 border-[#0B1F3A] ring-1 ring-[#0B1F3A]/20';
                  } else if (isPerfect) {
                    surfaceClass =
                      'bg-[#ECFDF5]/70 border-[#A7F3D0] hover:border-[#059669]';
                  } else if (isAllFeasible) {
                    surfaceClass =
                      'bg-emerald-50/35 border-emerald-200/80 hover:border-emerald-300';
                  }

                  return (
                    <td key={slotId} className="p-1">
                      <button
                        type="button"
                        onClick={() => onSelectSlot(slotId)}
                        aria-label={`Ver detalle ${formatDateShort(date).weekday} ${row.startTime}: ${item.available.length} disponibles, ${item.adaptable.length} adaptables, ${item.unavailable.length} no disponibles`}
                        className={`w-full h-12 px-2.5 py-1.5 border rounded-lg flex flex-col justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] ${surfaceClass}`}
                      >
                        <div className="w-full flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums">
                          <span className="inline-flex items-center gap-0.5 text-[#047857] font-semibold">
                            <Check className="w-3 h-3" />
                            {item.available.length}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium">
                            <Clock className="w-3 h-3" />
                            {item.adaptable.length}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-rose-700">
                            <X className="w-3 h-3" />
                            {item.unavailable.length}
                          </span>
                        </div>

                        {/* Stacked progress hairline */}
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                          {optPct > 0 && (
                            <div
                              style={{ width: `${optPct}%` }}
                              className="h-full bg-[#059669]"
                            />
                          )}
                          {adapPct > 0 && (
                            <div
                              style={{ width: `${adapPct}%` }}
                              className="h-full bg-amber-400"
                            />
                          )}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
