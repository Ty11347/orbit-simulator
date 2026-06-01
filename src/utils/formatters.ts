const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function toSuperscript(exp: number): string {
  const sign = exp < 0 ? '⁻' : '';
  const digits = Math.abs(exp).toString().split('').map(d => SUPERSCRIPTS[parseInt(d)]).join('');
  return sign + digits;
}

// Scientific notation: mantissa is already in the highest tier unit; take log10 to get the exponent
function formatSci(mantissa: number, unit: string): string {
  const absM = Math.abs(mantissa);
  if (absM === 0) return `0 ${unit}`;
  const exp = Math.floor(Math.log10(absM));
  const scaled = mantissa / Math.pow(10, exp);
  const stripped = parseFloat(scaled.toFixed(4)).toString();
  return `${stripped}×10${toSuperscript(exp)} ${unit}`;
}

// ==================== Distance ====================

const DISTANCE_UNITS = [
  { threshold: 1e9, divisor: 1e9, suffix: 'Gm' },
  { threshold: 1e6, divisor: 1e6, suffix: 'Mm' },
  { threshold: 1e3, divisor: 1e3, suffix: 'km' },
];

export function formatUnit(val: number): string {
  if (val === -1 || isNaN(val)) return "Escape";

  const absVal = Math.abs(val);

  if (absVal >= 1e12) {
    return formatSci(val / 1e9, 'Gm');
  }

  for (const unit of DISTANCE_UNITS) {
    if (absVal >= unit.threshold) {
      const converted = val / unit.divisor;
      const stripped = parseFloat(converted.toFixed(4)).toString();
      return `${stripped} ${unit.suffix}`;
    }
  }

  return val.toFixed(2) + " m";
}

// ==================== Time ====================

export function formatTime(totalSeconds: number): string {
  if (totalSeconds === Infinity || isNaN(totalSeconds) || totalSeconds < 0) return "Escape";

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

// ==================== Speed ====================

const SPEED_UNITS = [
  { threshold: 1e6, divisor: 1e6, suffix: 'Mm/s' },
  { threshold: 1e3, divisor: 1e3, suffix: 'km/s' },
];

export function formatSpeed(val: number): string {
  if (!isFinite(val)) return '∞';
  if (val === 0) return '0 m/s';

  const absVal = Math.abs(val);

  // >= 1e9 m/s → scientific notation with Mm/s base
  if (absVal >= 1e9) {
    return formatSci(val / 1e6, 'Mm/s');
  }

  for (const unit of SPEED_UNITS) {
    if (absVal >= unit.threshold) {
      const converted = val / unit.divisor;
      const stripped = parseFloat(converted.toFixed(4)).toString();
      return `${stripped} ${unit.suffix}`;
    }
  }

  const stripped = parseFloat(val.toFixed(4)).toString();
  return `${stripped} m/s`;
}

// ==================== Mass ====================

const MASS_UNITS = [
  { threshold: 1e18, divisor: 1e18, suffix: 'Pt' },
  { threshold: 1e15, divisor: 1e15, suffix: 'Tt' },
  { threshold: 1e12, divisor: 1e12, suffix: 'Gt' },
  { threshold: 1e9,  divisor: 1e9,  suffix: 'Mt' },
  { threshold: 1e6,  divisor: 1e6,  suffix: 'Kt' },
  { threshold: 1e3,  divisor: 1e3,  suffix: 't'  },
];

export function formatMass(val: number): string {
  if (!isFinite(val)) return '∞';
  if (val === 0) return '0 kg';

  const absVal = Math.abs(val);

  // >= 1e21 kg → scientific notation with Pt base
  if (absVal >= 1e21) {
    return formatSci(val / 1e18, 'Pt');
  }

  for (const unit of MASS_UNITS) {
    if (absVal >= unit.threshold) {
      const converted = val / unit.divisor;
      const stripped = parseFloat(converted.toFixed(4)).toString();
      return `${stripped} ${unit.suffix}`;
    }
  }

  const stripped = parseFloat(Math.abs(val).toFixed(4)).toString();
  const sign = val < 0 ? '-' : '';
  return `${sign}${stripped} kg`;
}
