import {
  buildSlotId,
  formatDateShort,
  generateHourRows,
} from './schedule.ts';
import type { Meeting, SlotConsensus } from '../types/meeting.ts';

function escapeCsvCell(value: string | number): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvLine(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function exportConsensusMatrixCsv(
  meeting: Meeting,
  consensusMap: Map<string, SlotConsensus>,
  passesFilter: (item: SlotConsensus | undefined) => boolean
): void {
  const hourRows = generateHourRows(meeting);
  const lines: string[] = [];

  // 1. 2D Consensus Matrix (mirrors the current filtered table)
  const matrixHeaders = [
    'Franja',
    ...meeting.dates.map((date) => {
      const { weekday, dayMonth } = formatDateShort(date);
      return `${weekday} ${dayMonth} (${date})`;
    }),
  ];
  lines.push(toCsvLine(matrixHeaders));

  for (const row of hourRows) {
    const cells: (string | number)[] = [`${row.startTime} - ${row.endTime}`];
    for (const date of meeting.dates) {
      const slotId = buildSlotId(date, row.startTime);
      const item = consensusMap.get(slotId);
      if (!item || !passesFilter(item)) {
        cells.push('—');
        continue;
      }
      const pct =
        item.totalParticipants > 0
          ? Math.round(item.feasibleRatio * 100)
          : 0;
      const confirmedTag =
        meeting.confirmedSlotId === slotId ? ' [CONFIRMADA]' : '';
      cells.push(
        `${item.available.length} disp. / ${item.adaptable.length} adap. / ${item.unavailable.length} no (${pct}%)${confirmedTag}`
      );
    }
    lines.push(toCsvLine(cells));
  }

  // 2. Detailed breakdown by visible slot
  lines.push('');
  lines.push(toCsvLine(['Detalle por franja']));
  lines.push(
    toCsvLine([
      'Fecha',
      'Día',
      'Franja',
      'Confirmada',
      'Disponibles',
      'Adaptables',
      'No disponibles',
      'Sin responder',
      'Consenso (%)',
      'Participantes disponibles',
      'Participantes adaptables',
      'Participantes no disponibles',
    ])
  );

  for (const date of meeting.dates) {
    const { weekday, dayMonth } = formatDateShort(date);
    for (const row of hourRows) {
      const slotId = buildSlotId(date, row.startTime);
      const item = consensusMap.get(slotId);
      if (!item || !passesFilter(item)) continue;

      const pct =
        item.totalParticipants > 0
          ? Math.round(item.feasibleRatio * 100)
          : 0;

      lines.push(
        toCsvLine([
          date,
          `${weekday} ${dayMonth}`,
          `${row.startTime} - ${row.endTime}`,
          meeting.confirmedSlotId === slotId ? 'Sí' : 'No',
          item.available.length,
          item.adaptable.length,
          item.unavailable.length,
          item.pending.length,
          `${pct}%`,
          item.available.map((p) => p.name).join('; '),
          item.adaptable.map((p) => p.name).join('; '),
          item.unavailable.map((p) => p.name).join('; '),
        ])
      );
    }
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const slug = meeting.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug || meeting.id}-consenso.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
