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

function minutesToTime(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
  const reportingMinutes = minutesFromTime(row.reportingTime);
  if (key === 'checkIn') {
    const checkInMinutes = minutesFromTime(row.checkIn);
    if (checkInMinutes === null || reportingMinutes === null) return '#FCA5A5';
    return checkInMinutes <= reportingMinutes ? '#FFFFFF' : '#FDE68A';
  }
  if (key === 'checkOut') {
    const checkOutMinutes = minutesFromTime(row.checkOut);
    if (checkOutMinutes === null || reportingMinutes === null) return row.checkIn ? '#FDE68A' : '#FCA5A5';
    const expectedLeaving = reportingMinutes + 9 * 60;
    if (checkOutMinutes <= expectedLeaving) return '#FFFFFF';
    if (checkOutMinutes <= expectedLeaving + 60) return '#FDE68A';
    return '#FCA5A5';
  }
  return '#FFFFFF';
}

export function downloadAttendanceSnapshot(options: {
  dateLabel: string;
  generatedAt: string;
  rows: AttendanceSnapshotRow[];
  summary: AttendanceSnapshotSummary;
}) {
  const width = 1180;
  const rowHeight = 64;
  const headerHeight = 150;
  const summaryTop = 184;
  const tableTop = 292;
  const rankedRows = new Map<number, number>();
  options.rows
    .map((row, index) => ({ row, index, minutes: minutesFromTime(row.checkIn) }))
    .filter((item): item is { row: AttendanceSnapshotRow; index: number; minutes: number } => item.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes)
    .forEach((item, index) => rankedRows.set(item.index, index + 1));

  const visibleRows = options.rows
    .map((row, index) => ({ row, rank: rankedRows.get(index) }))
    .sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.row.employeeName.localeCompare(b.row.employeeName);
    });
  const legendHeight = 112;
  const height = tableTop + 54 + visibleRows.length * rowHeight + legendHeight;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.scale(scale, scale);
  context.fillStyle = '#FFFFFF';
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
    ['Total', options.summary.total, '#10B981'],
  ] as const;

  summaryCards.forEach(([label, value, color], index) => {
    const cardWidth = 178;
    const x = 36 + index * 190;
    context.fillStyle = '#F8FAFC';
    roundRect(context, x, summaryTop, cardWidth, 74, 16);
    context.fill();
    context.fillStyle = color;
    context.font = '700 31px Arial';
    context.fillText(String(value), x + 18, summaryTop + 45);
    context.fillStyle = '#475569';
    context.font = '700 17px Arial';
    drawText(context, label, x + 72, summaryTop + 43, cardWidth - 84);
  });

  const columns = [
    { label: 'Employee', x: 24, width: 280 },
    { label: 'Project', x: 304, width: 200 },
    { label: 'Reporting Time', x: 504, width: 170 },
    { label: 'Check In', x: 674, width: 170 },
    { label: 'Rank', x: 844, width: 110 },
    { label: 'Check Out', x: 954, width: 202 },
  ];

  context.fillStyle = '#135F7B';
  context.fillRect(24, tableTop, width - 48, 54);
  context.fillStyle = '#FFFFFF';
  context.font = '700 18px Arial';
  columns.forEach((column) => {
    context.textAlign = column.label === 'Employee' ? 'left' : 'center';
    const textX = column.label === 'Employee' ? column.x + 12 : column.x + column.width / 2;
    drawText(context, column.label, textX, tableTop + 34, column.width - 18);
  });
  context.textAlign = 'left';

  visibleRows.forEach(({ row, rank }, index) => {
    const y = tableTop + 54 + index * rowHeight;
    const checkOutValue = row.checkOut ? formatDisplayTime(row.checkOut) : row.checkIn ? 'Active' : 'NA';
    const checkInValue = row.checkIn ? formatDisplayTime(row.checkIn) : row.status === 'on-leave' ? 'Leave' : 'NA';
    const reportingMinutes = minutesFromTime(row.reportingTime);
    const leavingTime = reportingMinutes === null ? 'NA' : formatDisplayTime(minutesToTime(reportingMinutes + 9 * 60));

    context.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    context.fillRect(24, y, width - 48, rowHeight);
    context.strokeStyle = '#111827';
    context.lineWidth = 1;

    columns.forEach((column) => {
      context.strokeRect(column.x, y, column.width, rowHeight);
    });

    context.fillStyle = '#0F172A';
    context.font = '700 20px Arial';
    context.textAlign = 'left';
    drawText(context, row.employeeName, columns[0].x + 12, y + 30, columns[0].width - 20);
    context.fillStyle = '#64748B';
    context.font = '600 15px Arial';
    drawText(context, row.position ?? 'Employee', columns[0].x + 12, y + 51, columns[0].width - 20);

    context.fillStyle = '#FFFFFF';
    context.fillRect(columns[1].x + 1, y + 1, columns[1].width - 2, rowHeight - 2);
    context.fillStyle = '#334155';
    context.font = '700 18px Arial';
    context.textAlign = 'center';
    drawText(context, row.project ?? 'Unassigned', columns[1].x + columns[1].width / 2, y + 39, columns[1].width - 18);

    context.fillStyle = '#FFFFFF';
    context.fillRect(columns[2].x + 1, y + 1, columns[2].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.font = '700 20px Arial';
    context.fillText(formatDisplayTime(row.reportingTime), columns[2].x + columns[2].width / 2, y + 30);
    context.fillStyle = '#64748B';
    context.font = '600 13px Arial';
    context.fillText(`Leave ${leavingTime}`, columns[2].x + columns[2].width / 2, y + 51);

    context.fillStyle = timeCellColor(row, 'checkIn');
    context.fillRect(columns[3].x + 1, y + 1, columns[3].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.fillText(checkInValue, columns[3].x + columns[3].width / 2, y + 39);

    context.fillStyle = rankColor(rank);
    context.fillRect(columns[4].x + 1, y + 1, columns[4].width - 2, rowHeight - 2);
    context.fillStyle = '#111827';
    context.fillText(rank ? String(rank) : 'NA', columns[4].x + columns[4].width / 2, y + 39);

    context.fillStyle = timeCellColor(row, 'checkOut');
    context.fillRect(columns[5].x + 1, y + 1, columns[5].width - 2, rowHeight - 2);
    context.fillStyle = row.checkOut || !row.checkIn ? '#111827' : '#C2410C';
    context.fillText(checkOutValue, columns[5].x + columns[5].width / 2, y + 39);

    context.textAlign = 'left';
  });

  const legendTop = tableTop + 54 + visibleRows.length * rowHeight + 24;
  const drawLegendItem = (x: number, y: number, color: string, label: string) => {
    context.fillStyle = color;
    context.strokeStyle = '#CBD5E1';
    context.lineWidth = 1;
    context.fillRect(x, y - 14, 22, 22);
    context.strokeRect(x, y - 14, 22, 22);
    context.fillStyle = '#334155';
    context.font = '600 15px Arial';
    context.textAlign = 'left';
    context.fillText(label, x + 32, y + 3);
  };

  context.fillStyle = '#0F172A';
  context.font = '700 16px Arial';
  context.fillText('CHECK IN', 36, legendTop);
  drawLegendItem(148, legendTop, '#FFFFFF', 'On time / on dot');
  drawLegendItem(390, legendTop, '#FDE68A', 'Late');
  drawLegendItem(548, legendTop, '#FCA5A5', 'Absent');

  context.fillStyle = '#0F172A';
  context.font = '700 16px Arial';
  context.fillText('CHECK OUT', 36, legendTop + 42);
  drawLegendItem(148, legendTop + 42, '#FFFFFF', 'On leaving time');
  drawLegendItem(390, legendTop + 42, '#FDE68A', 'Up to 1 hour after');
  drawLegendItem(650, legendTop + 42, '#FCA5A5', 'More than 1 hour after');
  drawLegendItem(974, legendTop + 42, '#E5E7EB', 'Leave / off');

  const link = document.createElement('a');
  link.download = `powermatix-attendance-${options.dateLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
