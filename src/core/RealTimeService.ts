import { Params } from '../ui/Params';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

type Status = 'manual' | 'locating' | 'fetching-weather' | 'ok' | 'error';

export class RealTimeService {
  private params: Params;
  private timeTimer: number | null = null;
  private weatherTimer: number | null = null;
  private running = false;
  private hasLocation = false;

  constructor(params: Params) {
    this.params = params;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.setStatus('locating');
    const located = await this.acquireLocation();
    if (!this.running) return;
    if (!located) {
      this.setStatus('error', 'location denied');
      this.running = false;
      return;
    }

    // Initial syncs
    this.updateTime();
    await this.updateWeather();

    // Timers: time every minute, weather every hour
    this.timeTimer = window.setInterval(() => this.updateTime(), MINUTE_MS);
    this.weatherTimer = window.setInterval(() => this.updateWeather(), HOUR_MS);
  }

  stop() {
    this.running = false;
    if (this.timeTimer !== null) window.clearInterval(this.timeTimer);
    if (this.weatherTimer !== null) window.clearInterval(this.weatherTimer);
    this.timeTimer = null;
    this.weatherTimer = null;
    this.setStatus('manual');
  }

  private setStatus(status: Status, msg?: string) {
    this.params.realtime.status = msg ? `${status}: ${msg}` : status;
  }

  private async acquireLocation(): Promise<boolean> {
    if (!navigator.geolocation) {
      this.setStatus('error', 'geolocation unavailable');
      return false;
    }

    const pos = await new Promise<GeolocationPosition | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        p => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5000 }
      );
    });
    if (!pos) return false;

    const { latitude, longitude } = pos.coords;
    this.params.place.latitude = latitude;
    this.params.place.longitude = longitude;
    this.hasLocation = true;
    this.setStatus('ok');
    return true;
  }

  private updateTime() {
    if (!this.running) return;
    const now = new Date();
    // System time + timezone offset (minutes -> hours)
    this.params.time.year = now.getFullYear();
    this.params.time.month = now.getMonth() + 1;
    this.params.time.day = now.getDate();
    this.params.time.hour = now.getHours();
    this.params.time.minute = now.getMinutes();
    this.params.time.utcOffset = -now.getTimezoneOffset() / 60;
    this.params.realtime.lastUpdate = now.toLocaleTimeString();
  }

  private async updateWeather() {
    if (!this.running || !this.hasLocation) return;
    const now = new Date();
    this.setStatus('fetching-weather');

    const latitude = this.params.place.latitude;
    const longitude = this.params.place.longitude;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(
        4
      )}&longitude=${longitude.toFixed(
        4
      )}&current_weather=true&hourly=cloud_cover&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;

      const cloudPercent = this.readCloudCover(data);
      if (cloudPercent !== null) {
        const clampedPercent = Math.min(100, Math.max(0, cloudPercent));
        const minCover = 0.15;
        const maxCover = 0.55;
        const span = maxCover - minCover;
        this.params.cloud.coverage = minCover + (clampedPercent / 100) * span;
      }

      const wind = data?.current_weather;
      if (wind) {
        // windspeed: km/h, winddirection: degrees (from north, blowing from)
        const speed = typeof wind.windspeed === 'number' ? wind.windspeed : 0;
        const dirDeg = typeof wind.winddirection === 'number' ? wind.winddirection : 0;
        const dirRad = (dirDeg * Math.PI) / 180;
        const kmhToShader = 0.6; // empirical scaling into shader wind units
        const apiWindBoost = 5.0; // requested boost to make clouds advect faster
        const v = speed * kmhToShader * apiWindBoost;
        this.params.cloud.windX = -Math.sin(dirRad) * v;
        this.params.cloud.windZ = -Math.cos(dirRad) * v;
      }

      // Log the latest weather snapshot used to drive the scene.
      console.log('Weather API data', {
        url,
        cloudCoverPercent: cloudPercent,
        currentWeather: wind,
      });

      this.params.realtime.lastUpdate = now.toLocaleTimeString();
      this.setStatus('ok');
    } catch (err: any) {
      this.setStatus('error', err?.message || 'weather fetch failed');
    }
  }

  private readCloudCover(data: any): number | null {
    const hourly = data?.hourly;
    const offsetSeconds =
      typeof data?.utc_offset_seconds === 'number' ? data.utc_offset_seconds : null;
    if (!hourly?.cloud_cover || !hourly?.time || offsetSeconds === null) return null;

    const times: string[] = hourly.time;
    const cover: number[] = hourly.cloud_cover;
    if (!Array.isArray(times) || !Array.isArray(cover) || cover.length === 0) return null;

    const currentTimeStr =
      typeof data?.current_weather?.time === 'string' ? data.current_weather.time : null;

    let idx =
      currentTimeStr && Array.isArray(times) ? times.findIndex(t => t === currentTimeStr) : -1;

    if (idx === -1 && typeof times[0] === 'string') {
      const firstUtc = this.toUtcMs(times[0], offsetSeconds);
      if (firstUtc !== null) {
        const nowUtc = Date.now();
        const hourIndex = Math.floor((nowUtc - firstUtc) / HOUR_MS);
        idx = Math.max(0, Math.min(cover.length - 1, hourIndex));
      }
    }

    if (idx < 0 || idx >= cover.length) return null;
    return typeof cover[idx] === 'number' ? cover[idx] : null;
  }

  private toUtcMs(timeStr: string, offsetSeconds: number): number | null {
    const parsed = Date.parse(`${timeStr}Z`);
    if (Number.isNaN(parsed)) return null;
    return parsed - offsetSeconds * 1000;
  }
}
