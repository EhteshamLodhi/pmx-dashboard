import { formatDisplayTime } from '@/lib/time';

export type AttendanceSnapshotRow = {
  employeeName: string;
  position?: string;
  project?: string;
  reportingTime?: string;
  checkIn?: string;
  checkOut?: string;
  statusLabel: string;
  status: string;
};

export type AttendanceSnapshotSummary = {
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  total: number;
};

function statusColor(status: string) {
  if (status === 'present' || status === 'checked-in-only') return '#0ABF53';
  if (status === 'late') return '#F59E0B';
  if (status === 'on-leave') return '#0EA5E9';
  if (status === 'holiday') return '#0284C7';
  if (status === 'weekly-off') return '#6B7280';
  return '#FF3347';
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let value = text;
  while (context.measureText(value).width > maxWidth && value.length > 3) {
    value = `${value.slice(0, -4)}...`;
  }
  context.fillText(value, x, y);
}

function minutesFromTime(value?: string) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function rankColor(rank?: number | null) {
  if (!rank) return '#F8FAFC';
  if (rank <= 3) return '#86D18B';
  if (rank <= 7) return '#FDE68A';
  return '#FDA4AF';
}

function timeCellColor(row: AttendanceSnapshotRow, key: 'checkIn' | 'checkOut') {
  if (row.status === 'absent') return '#FCA5A5';
  if (row.status === 'on-leave' || row.status === 'holiday' || row.status === 'weekly-off') return '#E5E7EB';
  if (key === 'checkIn' && row.status === 'late') return '#FDBA74';
  if (key === 'checkOut' && row.checkOut) return '#FCA5A5';
  if (key === 'checkOut' && row.checkIn && !row.checkOut) return '#FDE68A';
  return '#FFFFFF';
}

export function downloadAttendanceSnapshot(options: {
  dateLabel: string;
  generatedAt: string;
  rows: AttendanceSnapshotRow[];
  summary: AttendanceSnapshotSummary;
}) {
  const width = 1080;
  const rowHeight = 58;
  const visibleRows = options.rows;
  const headerHeight = 156;
  const summaryTop = 192;
  const tableTop = 302;
  const height = tableTop + 54 + visibleRows.length * rowHeight + 46;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.scale(scale, scale);
  context.fillStyle = '#F8FAFC';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#0B8F3B';
  roundRect(context, 24, 22, width - 48, headerHeight, 22);
  context.fill();

  context.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(context, 54, 54, 62, 62, 16);
  context.fill();
  context.fillStyle = '#FFFFFF';
  context.font = '700 40px Arial';
  context.fillText('P', 77, 99);

  context.font = '700 34px Arial';
  context.fillText('PowerMatix', 136, 78);
  context.font = '700 20px Arial';
  context.fillStyle = '#D4F8DF';
  context.fillText('DAILY ATTENDANCE REPORT', 136, 110);

  context.fillStyle = '#FFFFFF';
  context.font = '700 25px Arial';
  context.textAlign = 'right';
  context.fillText(options.dateLabel, width - 54, 78);
  context.fillStyle = '#D4F8DF';
  context.font = '600 18px Arial';
  context.fillText(`Auto-generated - ${options.generatedAt}`, width - 54, 110);
  context.textAlign = 'left';

  const summaryCards = [
    ['Present', options.summary.present, '#0ABF53'],
    ['Late', options.summary.late, '#F59E0B'],
    ['Absent', options.summary.absent, '#FF3347'],
    ['On Leave', options.summary.onLeave, '#0EA5E9'],
    ['Total Employees', options.summary.total, '#111827'],
  ] as const;

  summaryCards.forEach(([label, value, color], index) => {
    const cardWidth = 190;
    const x = 36 + index * 204;
    context.fillStyle = index === 4 ? '#111827' : '#FFFFFF';
    roundRect(context, x, summaryTop, cardWidth, 74, 16);
    context.fill();
    context.fillStyle = color;
    context.font = '700 31px Arial';
    context.fillText(String(value), x + 18, summaryTop + 45);
    context.fillStyle = index === 4 ? '#FFFFFF' : '#475569';
    context.font = '700 17px Arial';
    drawText(context, label, x + 72, summaryTop + 43, cardWidth - 84);
  });

  const rankedRows = new Map<number, number>();
  visibleRows
    .map((row, index) => ({ row, index, minutes: minutesFromTime(row.checkIn) }))
    .filter((item): item is { row: AttendanceSnapshotRow; index: number; minutes: number } => item.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes)
    .forEach((item, index) => rankedRows.set(item.index, index + 1));

  const columns = [
    { label: 'Name', x: 24, width: 292 },
    { label: 'Cut Off Arrival Time', x: 316, width: 188 },
    { label: options.dateLabel.split(',').at(0) ?? 'Check In', x: 504, width: 188 },
    { label: 'Ranking', x: 692, width: 132 },
    { label: 'Check Out', x: 824, width: 232 },
  ];

  context.fillStyle = '#135F7B';
  context.fillRect(24, tableTop, width - 48, 54);
  context.fillStyle = '#FFFFFF';
  context.font = '700 18px Arial';
  columns.forEach((column) => {
    context.textAlign = column.label === 'Name' ? 'left' : 'center';
    const textX = column.label === 'Name' ? column.x + 12 : column.x + column.width / 2;
    drawText(context, column.label, textX, tableTop + 34, column.width - 18);
  });
  context.textAlign = 'left';

  visibleRows.forEach((row, index) => {
    const y = tableTop + 54 + index * rowHeight;
    const rank = rankedRows.get(index);
    const checkOutValue = row.checkOut ? formatDisplayTime(row.checkOut) : row.checkIn ? 'Active' : 'NA';
    const checkInValue = row.checkIn ? formatDisplayTime(row.checkIn) : row.status === 'on-leave' ? 'Leave' : 'NA';

    context.fillStyle = index % 2 === 0 ? '#F8FAFC' : '#E0F2FE';
    context.fillRect(24, y, width - 48, rowHeight);
    context.strokeStyle = '#111827';
    context.lineWidth = 1;

    columns.forEach((column) => {
      context.strokeRect(column.x, y, column.width, rowHeight);
    });

    context.fillStyle = '#0F172A';
    context.font = '700 21px Arial';
    context.textAlign = 'left';
    drawText(context, row.employeeName, columns[0].x + 12, y + 36, columns[0].width - 20);

    context.fillStyle = '#FFFFFF';
    context.fillRect(columns[1].x + 1, y + 1, columns[1].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.font = '700 20px Arial';
    context.textAlign = 'center';
    context.fillText(formatDisplayTime(row.reportingTime), columns[1].x + columns[1].width / 2, y + 36);

    context.fillStyle = timeCellColor(row, 'checkIn');
    context.fillRect(columns[2].x + 1, y + 1, columns[2].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.fillText(checkInValue, columns[2].x + columns[2].width / 2, y + 36);

    context.fillStyle = rankColor(rank);
    context.fillRect(columns[3].x + 1, y + 1, columns[3].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.fillText(rank ? String(rank) : 'NA', columns[3].x + columns[3].width / 2, y + 36);

    context.fillStyle = timeCellColor(row, 'checkOut');
    context.fillRect(columns[4].x + 1, y + 1, columns[4].width - 2, rowHeight - 2);
    context.fillStyle = row.checkOut || !row.checkIn ? '#111827' : '#C2410C';
    context.fillText(checkOutValue, columns[4].x + columns[4].width / 2, y + 36);
    context.textAlign = 'left';
  });

  if (options.rows.length > visibleRows.length) {
    context.fillStyle = '#64748B';
    context.font = '600 18px Arial';
    context.fillText(`+${options.rows.length - visibleRows.length} more employees in portal`, 54, height - 42);
  }

  const link = document.createElement('a');
  link.download = `powermatix-attendance-${options.dateLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
