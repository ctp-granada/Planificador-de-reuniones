import React, { useMemo, useState } from 'react';
import { formatDateShort } from '../utils/schedule.ts';
import type { Meeting, SlotConsensus } from '../types/meeting.ts';

interface ConsensusCurveChartProps {
  meeting: Meeting;
  consensusList: SlotConsensus[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
}

interface Point {
  x: number;
  y: number;
  value: number;
}

function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.28;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

export const ConsensusCurveChart: React.FC<ConsensusCurveChartProps> = ({
  meeting,
  consensusList,
  selectedSlotId,
  onSelectSlot,
}) => {
  const [activeDateFilter, setActiveDateFilter] = useState<string>(
    meeting.dates[0] ?? 'all'
  );
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  const effectiveDate =
    activeDateFilter === 'all' || meeting.dates.includes(activeDateFilter)
      ? activeDateFilter
      : (meeting.dates[0] ?? 'all');

  const visibleData = useMemo(() => {
    if (effectiveDate === 'all') return consensusList;
    return consensusList.filter((c) => c.slot.date === effectiveDate);
  }, [consensusList, effectiveDate]);

  const width = 820;
  const height = 240;
  const padLeft = 40;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxParticipants = Math.max(1, meeting.participants.length);

  const {
    optimalPoints,
    feasiblePoints,
    optimalLinePath,
    optimalAreaPath,
    feasibleLinePath,
  } = useMemo(() => {
    const count = visibleData.length;
    if (count === 0) {
      return {
        optimalPoints: [] as Point[],
        feasiblePoints: [] as Point[],
        optimalLinePath: '',
        optimalAreaPath: '',
        feasibleLinePath: '',
      };
    }

    const getX = (index: number) =>
      count === 1
        ? padLeft + plotW / 2
        : padLeft + (index / (count - 1)) * plotW;

    const getY = (val: number) =>
      padTop + plotH - (val / maxParticipants) * plotH;

    const optPts: Point[] = visibleData.map((item, idx) => ({
      x: getX(idx),
      y: getY(item.available.length),
      value: item.available.length,
    }));

    const feasPts: Point[] = visibleData.map((item, idx) => ({
      x: getX(idx),
      y: getY(item.available.length + item.adaptable.length),
      value: item.available.length + item.adaptable.length,
    }));

    const optLine = buildSmoothPath(optPts);
    const feasLine = buildSmoothPath(feasPts);
    const baselineY = (padTop + plotH).toFixed(2);
    const area =
      optPts.length > 0
        ? `${optLine} L ${optPts[optPts.length - 1].x.toFixed(2)} ${baselineY} L ${optPts[0].x.toFixed(2)} ${baselineY} Z`
        : '';

    return {
      optimalPoints: optPts,
      feasiblePoints: feasPts,
      optimalLinePath: optLine,
      optimalAreaPath: area,
      feasibleLinePath: feasLine,
    };
  }, [visibleData, maxParticipants, plotW, plotH]);

  const activeHover = useMemo(() => {
    const id = hoveredSlotId ?? selectedSlotId;
    if (!id) return null;
    const idx = visibleData.findIndex((c) => c.slot.id === id);
    if (idx === -1) return null;
    return { item: visibleData[idx], idx };
  }, [hoveredSlotId, selectedSlotId, visibleData]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxParticipants > 6 ? Math.ceil(maxParticipants / 4) : 1;
    for (let v = 0; v <= maxParticipants; v += step) {
      ticks.push(v);
    }
    if (ticks[ticks.length - 1] !== maxParticipants) {
      ticks.push(maxParticipants);
    }
    return ticks;
  }, [maxParticipants]);

  return (
    <section
      aria-labelledby="consensus-curve-heading"
      className="bg-white border border-slate-200/90 rounded-xl p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2
            id="consensus-curve-heading"
            className="text-base font-semibold text-[#0B1F3A] tracking-tight"
          >
            Curva de consenso horario
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Evolución de disponibilidad óptima y capacidad con adaptación por franja. Haz clic en cualquier punto para abrir su detalle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filtrar curva por día"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          >
            {meeting.dates.map((date) => {
              const { weekday, dayMonth } = formatDateShort(date);
              const isActive = effectiveDate === date;
              return (
                <button
                  key={date}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveDateFilter(date)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#0B1F3A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0B1F3A]'
                  }`}
                >
                  {weekday} {dayMonth}
                </button>
              );
            })}
            {meeting.dates.length > 1 && (
              <button
                type="button"
                role="tab"
                aria-selected={effectiveDate === 'all'}
                onClick={() => setActiveDateFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  effectiveDate === 'all'
                    ? 'bg-white text-[#0B1F3A] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1F3A]'
                }`}
              >
                Todos los días
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 pb-2 text-xs text-slate-600">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-0.5 bg-[#059669] rounded-full" />
            <span>Disponibilidad óptima</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-0.5 border-t-2 border-dashed border-[#0B1F3A]/70"
            />
            <span>Disponible + Me adapto si es necesario</span>
          </div>
        </div>

        {activeHover ? (
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-[#0B1F3A]">
            <span>
              {formatDateShort(activeHover.item.slot.date).weekday}{' '}
              {activeHover.item.slot.startTime}
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-[#059669] font-medium">
              {activeHover.item.available.length} disponibles
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-amber-700 font-medium">
              {activeHover.item.adaptable.length} adaptables
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-rose-700">
              {activeHover.item.unavailable.length} no disp.
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">
            Selecciona un nodo para inspeccionar participantes
          </span>
        )}
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[540px] h-60 select-none"
          role="img"
          aria-label="Gráfico de líneas suaves de disponibilidad por franja horaria"
        >
          <defs>
            <linearGradient id="emeraldAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal hairline grid */}
          {yTicks.map((tick) => {
            const y = padTop + plotH - (tick / maxParticipants) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-mono tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Active hover/selected vertical crosshair */}
          {activeHover && optimalPoints[activeHover.idx] && (
            <line
              x1={optimalPoints[activeHover.idx].x}
              y1={padTop}
              x2={optimalPoints[activeHover.idx].x}
              y2={padTop + plotH}
              stroke="#0B1F3A"
              strokeOpacity="0.18"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Area under optimal curve */}
          {optimalAreaPath && (
            <path d={optimalAreaPath} fill="url(#emeraldAreaGrad)" />
          )}

          {/* Feasible (available + adaptable) smooth dashed curve */}
          {feasibleLinePath && (
            <path
              d={feasibleLinePath}
              fill="none"
              stroke="#0B1F3A"
              strokeOpacity="0.65"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}

          {/* Optimal (available) smooth solid curve */}
          {optimalLinePath && (
            <path
              d={optimalLinePath}
              fill="none"
              stroke="#059669"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Interactive nodes and X-axis labels */}
          {visibleData.map((item, idx) => {
            const optPt = optimalPoints[idx];
            const feasPt = feasiblePoints[idx];
            if (!optPt || !feasPt) return null;

            const isSelected = selectedSlotId === item.slot.id;
            const isHovered = hoveredSlotId === item.slot.id;
            const isConfirmed = meeting.confirmedSlotId === item.slot.id;
            const showLabel =
              visibleData.length <= 12 || idx % Math.ceil(visibleData.length / 10) === 0;

            return (
              <g
                key={item.slot.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredSlotId(item.slot.id)}
                onMouseLeave={() => setHoveredSlotId(null)}
                onClick={() => onSelectSlot(item.slot.id)}
              >
                {/* Invisible wider hit column */}
                <rect
                  x={optPt.x - 14}
                  y={padTop}
                  width={28}
                  height={plotH + 20}
                  fill="transparent"
                />

                {/* Feasible node */}
                <circle
                  cx={feasPt.x}
                  cy={feasPt.y}
                  r={isSelected || isHovered ? 4.5 : 3}
                  fill="#FFFFFF"
                  stroke="#0B1F3A"
                  strokeWidth={isSelected || isHovered ? 2 : 1.5}
                />

                {/* Optimal node */}
                <circle
                  cx={optPt.x}
                  cy={optPt.y}
                  r={isSelected || isHovered || isConfirmed ? 5.5 : 3.75}
                  fill={isConfirmed ? '#0B1F3A' : '#FFFFFF'}
                  stroke="#059669"
                  strokeWidth={isSelected || isHovered ? 2.5 : 2}
                />

                {showLabel && (
                  <text
                    x={optPt.x}
                    y={height - 10}
                    textAnchor="middle"
                    className={`text-[11px] font-mono tabular-nums ${
                      isSelected || isHovered
                        ? 'fill-[#0B1F3A] font-semibold'
                        : 'fill-slate-400'
                    }`}
                  >
                    {effectiveDate === 'all'
                      ? `${formatDateShort(item.slot.date).weekday.slice(0, 2)} ${item.slot.startTime.slice(0, 2)}h`
                      : item.slot.startTime}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
};
