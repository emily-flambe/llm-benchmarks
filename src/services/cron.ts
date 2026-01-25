/**
 * Cron expression utilities
 */

/**
 * Check if a cron expression matches the current UTC time
 * Supports standard 5-field cron: minute hour day month weekday
 */
export function cronMatchesNow(cronExpression: string, now: Date): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const nowMinute = now.getUTCMinutes();
  const nowHour = now.getUTCHours();
  const nowDayOfMonth = now.getUTCDate();
  const nowMonth = now.getUTCMonth() + 1; // 1-12
  const nowDayOfWeek = now.getUTCDay(); // 0-6 (Sunday = 0)

  return (
    matchCronField(minute, nowMinute) &&
    matchCronField(hour, nowHour) &&
    matchCronField(dayOfMonth, nowDayOfMonth) &&
    matchCronField(month, nowMonth) &&
    matchCronField(dayOfWeek, nowDayOfWeek)
  );
}

/**
 * Check if a cron field matches a value
 * Supports: *, specific numbers, comma-separated lists, ranges, steps
 */
function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;

  // Handle comma-separated values
  const values = field.split(',');
  for (const v of values) {
    if (v.includes('/')) {
      // Handle step values like */5
      const [range, step] = v.split('/');
      const stepNum = parseInt(step, 10);
      if (range === '*' && value % stepNum === 0) return true;
    } else if (v.includes('-')) {
      // Handle ranges like 1-5
      const [start, end] = v.split('-').map((n) => parseInt(n, 10));
      if (value >= start && value <= end) return true;
    } else {
      // Exact match
      if (parseInt(v, 10) === value) return true;
    }
  }

  return false;
}

/**
 * Parse a human-readable schedule description to cron expression
 */
export function describeSchedule(cronExpression: string): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily at specific time
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute !== '*' && hour !== '*') {
      const h = parseInt(hour, 10);
      const m = parseInt(minute, 10);
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
      return `Daily at ${timeStr}`;
    }
    if (minute.startsWith('*/')) {
      return `Every ${minute.slice(2)} minutes`;
    }
    if (hour.startsWith('*/')) {
      return `Every ${hour.slice(2)} hours`;
    }
  }

  // Weekly
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[parseInt(dayOfWeek, 10)] || dayOfWeek;
    if (minute !== '*' && hour !== '*') {
      const h = parseInt(hour, 10);
      const m = parseInt(minute, 10);
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
      return `${dayName} at ${timeStr}`;
    }
    return `Weekly on ${dayName}`;
  }

  return cronExpression;
}

/**
 * Get the next run time for a cron expression
 * Returns ISO string in UTC
 */
export function getNextRunTime(cronExpression: string, from: Date = new Date()): string | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  // Start from the next minute
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  // Search up to 1 year ahead
  const maxIterations = 365 * 24 * 60; // 1 year in minutes
  for (let i = 0; i < maxIterations; i++) {
    if (cronMatchesNow(cronExpression, next)) {
      return next.toISOString();
    }
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  return null;
}
