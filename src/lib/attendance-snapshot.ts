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
  const width = 1440;
  const rowHeight = 72;
  const visibleRows = options.rows.slice(0, 28);
  const height = 260 + visibleRows.length * rowHeight + 72;
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
  roundRect(context, 24, 24, width - 48, 182, 24);
  context.fill();

  context.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(context, 54, 52, 54, 54, 16);
  context.fill();
  context.fillStyle = '#FFFFFF';
  context.font = '700 34px Arial';
  context.fillText('P', 72, 91);

  context.font = '700 24px Arial';
  context.fillText('PowerMatix', 126, 72);
  context.font = '600 16px Arial';
  context.fillStyle = '#D4F8DF';
  context.fillText('DAILY ATTENDANCE REPORT', 126, 100);

  context.fillStyle = '#FFFFFF';
  context.font = '700 20px Arial';
  context.textAlign = 'right';
  context.fillText(options.dateLabel, width - 58, 72);
  context.fillStyle = '#D4F8DF';
  context.font = '500 15px Arial';
  context.fillText(`Auto-generated - ${options.generatedAt}`, width - 58, 100);
  context.textAlign = 'left';

  const chips = [
    ['Present', options.summary.present, '#32B567'],
    ['Late', options.summary.late, '#84A51F'],
    ['Absent', options.summary.absent, '#687C4E'],
    ['On Leave', options.summary.onLeave, '#159E87'],
    ['Total', options.summary.total, '#18B454'],
  ] as const;

  let chipX = 54;
  chips.forEach(([label, value, color]) => {
    context.fillStyle = color;
    roundRect(context, chipX, 130, 140, 54, 18);
    context.fill();
    context.fillStyle = '#FFFFFF';
    context.font = '700 26px Arial';
    context.fillText(String(value), chipX + 20, 164);
    context.font = '600 14px Arial';
    context.fillText(label, chipX + 58, 162);
    chipX += 154;
  });

  const tableTop = 230;
  context.fillStyle = '#FFFFFF';
  roundRect(context, 24, tableTop, width - 48, height - tableTop - 24, 22);
  context.fill();

  context.fillStyle = '#F3F4F6';
  context.fillRect(24, tableTop, width - 48, 52);
  context.fillStyle = '#94A3B8';
  context.font = '700 13px Arial';
  context.fillText('EMPLOYEE', 54, tableTop + 32);
  context.fillText('PROJECT', 492, tableTop + 32);
  context.fillText('CHECK IN', 868, tableTop + 32);
  context.fillText('CHECK OUT', 1060, tableTop + 32);
  context.fillText('STATUS', 1250, tableTop + 32);

  visibleRows.forEach((row, index) => {
    const y = tableTop + 52 + index * rowHeight;
    context.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
    context.fillRect(24, y, width - 48, rowHeight);
    context.fillStyle = '#F1F5F9';
    roundRect(context, 54, y + 14, 44, 44, 22);
    context.fill();
    context.fillStyle = '#64748B';
    context.font = '700 13px Arial';
    context.fillText(
      row.employeeName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      66,
      y + 42,
    );

    context.fillStyle = '#111827';
    context.font = '700 16px Arial';
    drawText(context, row.employeeName, 116, y + 34, 320);
    context.fillStyle = '#94A3B8';
    context.font = '500 13px Arial';
    drawText(context, row.position ?? 'Employee', 116, y + 54, 320);

    context.fillStyle = '#4B5563';
    context.font = '500 15px Arial';
    drawText(context, row.project ?? 'Unassigned', 492, y + 42, 300);

    context.fillStyle = '#038C3E';
    context.font = '700 16px Arial';
    context.fillText(formatDisplayTime(row.checkIn), 868, y + 42);

    context.fillStyle = row.checkOut ? '#1D4ED8' : '#F97316';
    context.fillText(row.checkOut ? formatDisplayTime(row.checkOut) : row.checkIn ? 'Active' : '-', 1060, y + 42);

    context.fillStyle = statusColor(row.status);
    context.beginPath();
    context.arc(1264, y + 38, 7, 0, Math.PI * 2);
    context.fill();
    context.font = '600 13px Arial';
    context.fillText(row.statusLabel, 1280, y + 42);
  });

  if (options.rows.length > visibleRows.length) {
    context.fillStyle = '#64748B';
    context.font = '600 13px Arial';
    context.fillText(`+${options.rows.length - visibleRows.length} more employees in portal`, 54, height - 42);
  }

  const link = document.createElement('a');
  link.download = `powermatix-attendance-${options.dateLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
