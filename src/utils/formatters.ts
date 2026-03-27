// 距离格式化：将米转换为更易读的千米、兆米、京米
export function formatUnit(val: number): string {
  if (val === -1 || isNaN(val)) return "Escape";
  
  const absVal = Math.abs(val);
  if (absVal > 1e9) return (val / 1e9).toFixed(3) + " Gm";
  if (absVal > 1e6) return (val / 1e6).toFixed(3) + " Mm";
  if (absVal > 1e3) return (val / 1e3).toFixed(3) + " km";
  
  return val.toFixed(2) + " m";
}

// 时间格式化：将秒转换为年、天、小时、分钟、秒的航天标准格式
export function formatTime(totalSeconds: number): string {
  if (totalSeconds === Infinity || isNaN(totalSeconds) || totalSeconds < 0) return "Escape";

  // 时间换算常量
  const SECONDS_IN_YEAR = 365 * 24 * 3600;
  const SECONDS_IN_DAY = 24 * 3600;
  const SECONDS_IN_HOUR = 3600;
  const SECONDS_IN_MINUTE = 60;

  const y = Math.floor(totalSeconds / SECONDS_IN_YEAR);
  let rem = totalSeconds % SECONDS_IN_YEAR;
  
  const d = Math.floor(rem / SECONDS_IN_DAY);
  rem = rem % SECONDS_IN_DAY;
  
  const h = Math.floor(rem / SECONDS_IN_HOUR);
  rem = rem % SECONDS_IN_HOUR;
  
  const m = Math.floor(rem / SECONDS_IN_MINUTE);
  const s = Math.floor(rem % SECONDS_IN_MINUTE);

  if (y > 0) return `${y}y ${d}d ${h}h`;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  
  return `${s}s`;
}