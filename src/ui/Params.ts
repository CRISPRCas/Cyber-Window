export type Params = ReturnType<typeof createParams>;

export function createParams() {
  return {
    atmosphere: {
      rayleighScale: 5.0,
      mieScale: 5.0,
      groundAlbedo: 0.5,
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
      intensity: 25.0,
      haloStrength: 0.6,
      haloFalloff: 5.0
    },
  };
}