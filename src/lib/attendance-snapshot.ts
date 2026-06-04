import { formatDisplayTime } from '@/lib/time';

export type AttendanceSnapshotRow = {
  employeeName: string;
  position?: string;
  project?: string;
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

export function downloadAttendanceSnapshot(options: {
  dateLabel: string;
  generatedAt: string;
  rows: AttendanceSnapshotRow[];
  summary: AttendanceSnapshotSummary;
}) {
  const width = 1080;
  const rowHeight = 132;
  const visibleRows = options.rows;
  const headerHeight = 218;
  const summaryTop = 246;
  const summaryHeight = 244;
  const listTop = summaryTop + summaryHeight + 26;
  const height = listTop + visibleRows.length * rowHeight + 44;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.scale(scale, scale);
  context.fillStyle = '#F8FAFC';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#049A3B';
  roundRect(context, 28, 24, width - 56, headerHeight, 26);
  context.fill();

  context.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(context, 58, 56, 70, 70, 18);
  context.fill();
  context.fillStyle = '#FFFFFF';
  context.font = '700 44px Arial';
  context.fillText('P', 84, 105);

  context.font = '700 38px Arial';
  context.fillText('PowerMatix', 150, 84);
  context.font = '700 22px Arial';
  context.fillStyle = '#D4F8DF';
  context.fillText('DAILY ATTENDANCE REPORT', 150, 118);

  context.fillStyle = '#FFFFFF';
  context.font = '700 26px Arial';
  context.textAlign = 'right';
  context.fillText(options.dateLabel, width - 58, 82);
  context.fillStyle = '#D4F8DF';
  context.font = '600 19px Arial';
  context.fillText(`Auto-generated - ${options.generatedAt}`, width - 58, 114);
  context.textAlign = 'left';

  const summaryCards = [
    ['Present', options.summary.present, '#0ABF53'],
    ['Late', options.summary.late, '#F59E0B'],
    ['Absent', options.summary.absent, '#FF3347'],
    ['On Leave', options.summary.onLeave, '#0EA5E9'],
    ['Total Employees', options.summary.total, '#111827'],
  ] as const;

  summaryCards.forEach(([label, value, color], index) => {
    const cardWidth = index === 4 ? width - 72 : (width - 96) / 2;
    const x = 36 + (index % 2) * (cardWidth + 24);
    const actualY = summaryTop + Math.floor(index / 2) * 78;
    context.fillStyle = '#FFFFFF';
    roundRect(context, x, actualY, cardWidth, 64, 18);
    context.fill();
    context.fillStyle = color;
    context.font = '700 30px Arial';
    context.fillText(String(value), x + 22, actualY + 42);
    context.fillStyle = '#475569';
    context.font = '700 20px Arial';
    context.fillText(label, x + 86, actualY + 39);
  });

  context.fillStyle = '#334155';
  context.font = '700 24px Arial';
  context.fillText('Employee Attendance', 40, listTop - 12);

  visibleRows.forEach((row, index) => {
    const y = listTop + index * rowHeight;
    context.fillStyle = '#FFFFFF';
    roundRect(context, 36, y, width - 72, rowHeight - 16, 22);
    context.fill();

    context.fillStyle = '#F1F5F9';
    roundRect(context, 58, y + 26, 62, 62, 31);
    context.fill();
    context.fillStyle = '#64748B';
    context.font = '700 20px Arial';
    const initials = row.employeeName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    context.textAlign = 'center';
    context.fillText(initials, 89, y + 65);
    context.textAlign = 'left';

    context.fillStyle = '#111827';
    context.font = '700 27px Arial';
    drawText(context, row.employeeName, 142, y + 42, 430);
    context.fillStyle = '#94A3B8';
    context.font = '600 19px Arial';
    drawText(context, `${row.position ?? 'Employee'} - ${row.project ?? 'Unassigned'}`, 142, y + 72, 560);

    const status = row.statusLabel;
    const statusWidth = Math.max(116, context.measureText(status).width + 46);
    context.fillStyle = `${statusColor(row.status)}18`;
    roundRect(context, width - 60 - statusWidth, y + 28, statusWidth, 42, 21);
    context.fill();
    context.fillStyle = statusColor(row.status);
    context.beginPath();
    context.arc(width - 42 - statusWidth, y + 49, 8, 0, Math.PI * 2);
    context.fill();
    context.font = '700 20px Arial';
    context.fillText(status, width - 28 - statusWidth, y + 56);

    context.fillStyle = '#038C3E';
    context.font = '700 21px Arial';
    context.fillText(`In: ${formatDisplayTime(row.checkIn)}`, 142, y + 104);

    context.fillStyle = row.checkOut ? '#1D4ED8' : '#F97316';
    context.fillText(`Out: ${row.checkOut ? formatDisplayTime(row.checkOut) : row.checkIn ? 'Active' : '-'}`, 420, y + 104);
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
