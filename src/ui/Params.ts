export type Params = ReturnType<typeof createParams>;

export function createParams() {
  return {
    atmosphere: {
      rayleighScale: 1.0,
      mieScale: 1.0,
      groundAlbedo: 0.1,
    },
    place: {
      latitude: -31.95,   // Perth (negative for south)
      longitude: 115.86,
    },
    time: {
      year: 2025, month: 10, day: 20,
      hour: 14, minute: 0,
      utcOffset: 8
    },
    render: {
      singleScatteringSteps: 24
    }
  };
}