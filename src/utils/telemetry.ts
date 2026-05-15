export interface TelemetryData {
  px: number;
  py: number;
  pz: number;
  speed: number;
  sma: number;
  ecc: number;
  peAlt: number;
  apAlt: number;
  alt: number;
  period: number;
  parentId: number;
}

export const telemetryRef: { current: TelemetryData | null } = { current: null };

const G = 6.67430e-11;

export function computeTelemetry(
  bodyIndex: number,
  engineData: { posPtr: number; velPtr: number; localVelPtr: number; parentPtr: number; count: number; memory: WebAssembly.Memory | null },
  bodies: Array<{ id: number; MASS: number; radius: number; parentId: number }>,
): TelemetryData | null {
  if (!engineData.memory || engineData.count <= bodyIndex) return null;

  const posView = new Float64Array(engineData.memory.buffer, engineData.posPtr, engineData.count * 3);
  const localVelView = new Float64Array(engineData.memory.buffer, engineData.localVelPtr, engineData.count * 3);
  const parentView = new Int32Array(engineData.memory.buffer, engineData.parentPtr, engineData.count);

  const px = posView[bodyIndex * 3];
  const py = posView[bodyIndex * 3 + 1];
  const pz = posView[bodyIndex * 3 + 2];

  const vx = localVelView[bodyIndex * 3];
  const vy = localVelView[bodyIndex * 3 + 1];
  const vz = localVelView[bodyIndex * 3 + 2];
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

  const currentParentId = parentView[bodyIndex];
  const parentBody = bodies.find(b => b.id === currentParentId);

  if (!parentBody) {
    return { px, py, pz, speed, sma: 0, ecc: 0, peAlt: 0, apAlt: 0, alt: 0, period: 0, parentId: -1 };
  }

  const ppx = posView[currentParentId * 3];
  const ppy = posView[currentParentId * 3 + 1];
  const ppz = posView[currentParentId * 3 + 2];

  const rx = px - ppx;
  const ry = py - ppy;
  const rz = pz - ppz;
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const mu = G * parentBody.MASS;
  const energy = speed * speed / 2.0 - mu / r;
  const sma = energy !== 0 ? -mu / (2.0 * energy) : 1e9;

  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;

  const v_cross_hx = vy * hz - vz * hy;
  const v_cross_hy = vz * hx - vx * hz;
  const v_cross_hz = vx * hy - vy * hx;

  const ex = v_cross_hx / mu - rx / r;
  const ey = v_cross_hy / mu - ry / r;
  const ez = v_cross_hz / mu - rz / r;
  const ecc = Math.sqrt(ex * ex + ey * ey + ez * ez);

  const pe = Math.abs(sma) * Math.abs(1 - ecc);
  const ap = sma > 0 ? sma * (1 + ecc) : -1;
  const alt = r - parentBody.radius;
  const peAlt = pe - parentBody.radius;
  const apAlt = ap > 0 ? ap - parentBody.radius : -1;

  let period = 0;
  if (ecc < 1.0 && sma > 0) {
    period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);
  }

  return { px, py, pz, speed, sma, ecc, peAlt, apAlt, alt, period, parentId: currentParentId };
}

export function clearTelemetry() {
  telemetryRef.current = null;
}
