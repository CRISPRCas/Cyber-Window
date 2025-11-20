import { Params } from '../ui/Params';

const MINUTE_MS = 60_000;

type Status = 'manual' | 'locating' | 'fetching-weather' | 'ok' | 'error';

export class RealTimeService {
  private params: Params;
  private timer: number | null = null;
  private running = false;

  constructor(params: Params) {
    this.params = params;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.setStatus('manual');
  }

  private setStatus(status: Status, msg?: string) {
    this.params.realtime.status = msg ? `${status}: ${msg}` : status;
  }

  private async tick() {
    await this.updateOnce();
    if (this.running) {
      this.timer = window.setTimeout(() => this.tick(), MINUTE_MS);
    }
  }

  private async updateOnce() {
    if (!navigator.geolocation) {
      this.setStatus('error', 'geolocation unavailable');
      return;
    }

    this.setStatus('locating');
    const pos = await new Promise<GeolocationPosition | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        p => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5000 }
      );
    });
    if (!pos) {
      this.setStatus('error', 'location denied');
      return;
    }

    const { latitude, longitude } = pos.coords;
    this.params.place.latitude = latitude;
    this.params.place.longitude = longitude;

    // System time + timezone offset (minutes -> hours)
    const now = new Date();
    this.params.time.year = now.getFullYear();
    this.params.time.month = now.getMonth() + 1;
    this.params.time.day = now.getDate();
    this.params.time.hour = now.getHours();
    this.params.time.minute = now.getMinutes();
    this.params.time.utcOffset = -now.getTimezoneOffset() / 60;

    this.setStatus('fetching-weather');

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
        this.params.cloud.coverage = Math.min(1, Math.max(0, cloudPercent / 100));
      }

      const wind = data?.current_weather;
      if (wind) {
        // windspeed: km/h, winddirection: degrees (from north, blowing from)
        const speed = typeof wind.windspeed === 'number' ? wind.windspeed : 0;
        const dirDeg = typeof wind.winddirection === 'number' ? wind.winddirection : 0;
        const dirRad = (dirDeg * Math.PI) / 180;
        const kmhToShader = 0.6; // empirical scaling into shader wind units
        const v = speed * kmhToShader;
        this.params.cloud.windX = -Math.sin(dirRad) * v;
        this.params.cloud.windZ = -Math.cos(dirRad) * v;
      }

      this.params.realtime.lastUpdate = now.toLocaleTimeString();
      this.setStatus('ok');
    } catch (err: any) {
      this.setStatus('error', err?.message || 'weather fetch failed');
    }
  }

  private readCloudCover(data: any): number | null {
    const hourly = data?.hourly;
    if (!hourly?.cloud_cover || !hourly?.time) return null;

    const times: string[] = hourly.time;
    const cover: number[] = hourly.cloud_cover;
    if (!Array.isArray(times) || !Array.isArray(cover) || cover.length === 0) return null;

    // Use the first sample (API returns current hour first when current_weather=true)
    return typeof cover[0] === 'number' ? cover[0] : null;
  }
}
