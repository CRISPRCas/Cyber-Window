export type Params = ReturnType<typeof createParams>;

export function createParams() {
  return {
    atmosphere: {
      rayleighScale: 1.6,
      mieScale: 3.2,
      groundAlbedo: 0.08,
    },
    place: {
      latitude: 22.33812,
      longitude: 114.26439,
    },
    time: {
      year: 2025, month: 10, day: 20,
      hour: 16, minute: 18,
      utcOffset: 8
    },
    render: {
      singleScatteringSteps: 24
    },
    sun: {
      angularDiameterDeg: 0.53,
      intensity: 24,
      haloStrength: 1.0,
      haloFalloff: 5
    },
    sky2: {
      multiScatterBoost: 0.0,
      aerialStrength:    0.20,
      aerialDistance:    150000,
      skySunIntensity:   20.0,
      exposure:          0.9,
    },
  };
}
