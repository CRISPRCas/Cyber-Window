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
      singleScatteringSteps: 20
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

    cloud: {
      coverage:   0.36,     // 覆盖度 0..1
      height:     640.0,   // 云底高度（米）
      thickness:  1100.0,   // 云层厚度（米）
      sigmaT:     0.2,     // 吸收/消光系数（越大越厚/越暗）
      phaseG:     0.6,      // Henyey–Greenstein g（前向散射）
      steps:      96,       // Ray marching 步数
      maxDistance:2000.0,  // 每条光线在云层内的最大行进距离（米）
      windX:      6.0,      // 风速（XZ）
      windZ:      3.0,
      ambientK:   0.03,     // 近似天光（软填充）
      opacity:    1.8,      // 最终云贡献的整体乘子
      enabled:    true      // 开关（可选）
    },
    realtime: {
      enabled: false,
      status: 'manual',
      lastUpdate: '—'
    }
  };
}
