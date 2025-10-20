const DEG2RAD = Math.PI / 180;
function toJulian(date: Date) { return (date.getTime() / 86400000) + 2440587.5; }
function solarMeanAnomaly(d: number) { return (357.5291 + 0.98560028 * d) * DEG2RAD; }
function eclipticLongitude(M: number) {
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2*M) + 0.0003 * Math.sin(3*M)) * DEG2RAD;
  const P = 102.9372 * DEG2RAD; return M + C + P + Math.PI;
}
function declination(L: number) { const e = 23.4397 * DEG2RAD; return Math.asin(Math.sin(e) * Math.sin(L)); }
function rightAscension(L: number) { const e = 23.4397 * DEG2RAD; return Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)); }
function siderealTime(d: number, lw: number) { return (280.16*DEG2RAD + 360.9856235*DEG2RAD*d) - lw; }

export function computeSunDirection(lat: number, lon: number, date: Date) {
  const lw = -lon * DEG2RAD, phi = lat * DEG2RAD;
  const d = toJulian(date) - 2451545.0;
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const ra  = rightAscension(L);
  const st  = siderealTime(d, lw);
  const H = st - ra;
  const alt = Math.asin(Math.sin(phi)*Math.sin(dec) + Math.cos(phi)*Math.cos(dec)*Math.cos(H));
  const az  = Math.atan2(-Math.sin(H), Math.cos(phi)*Math.tan(dec) - Math.sin(phi)*Math.cos(H));
  const elev = alt;
  const a = az + Math.PI;
  const x = Math.cos(elev) * Math.cos(a);
  const z = Math.cos(elev) * Math.sin(a);
  const y = Math.sin(elev);
  const len = Math.hypot(x,y,z) || 1.0;
  return { x: x/len, y: y/len, z: z/len };
}