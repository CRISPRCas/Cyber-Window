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
      hour: 17, minute: 40,
      utcOffset: 8
    },
    render: {
      singleScatteringSteps: 20,
      targetFPS: 55
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

    ground: {
      mirrorRoughness: 0.05,
      mirrorNoiseScale: 2.0,
      rippleAmplitude: 0.10, // previous max, slider max increased
      rippleFrequency: 4.0,
      rippleSpeed: 3.0,
    },

    cloud: {
      coverage:   0.36,     // coverage 0..1
      height:     640.0,    // cloud base height (m)
      thickness:  1100.0,   // cloud thickness (m)
      sigmaT:     0.005,    // extinction coefficient (per-meter)
      phaseG:     0.6,      // Henyey–Greenstein anisotropy
      steps:      96,       // ray-march steps
      maxDistance:2000.0,   // max march distance per ray (m)
      fadeStart:  2000.0,   // distance fade start
      fadeEnd:    8000.0,   // distance fade end
      windX:      40.0,     // wind X (XZ plane)
      windZ:      40.0,
      ambientK:   0.03,     // ambient fill light
      opacity:    3.0,      // overall cloud opacity multiplier
      enabled:    true      // enable/disable clouds
    },
    realtime: {
      enabled: false,
      status: 'manual',
      lastUpdate: '—'
    }
  };
}
