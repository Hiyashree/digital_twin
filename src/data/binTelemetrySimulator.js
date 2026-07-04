/**
 * Simulated IoT telemetry for smart bins — single source of truth for the digital twin.
 * No physical hardware; readings tick on an interval to mimic live sensor feeds.
 */

export const TELEMETRY_TICK_MS = 5000;
export const FILL_HISTORY_MAX = 12;

const AREA_FILL_RATE = { office: 0.4, residential: 0.6, market: 1.2, tourism: 0.8 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** Attach runtime fields to a seed bin from initialBins.js */
export function enrichSeedBin(seed) {
  const deviceId =
    seed.deviceId ||
    `IOT-${String(seed.name || "BIN")
      .replace(/\s+/g, "-")
      .toUpperCase()}`;

  return {
    ...seed,
    deviceId,
    assigned: false,
    assignedTruck: null,
    assignedTruckId: null,
    highFillCount: seed.fill >= 85 ? 1 : 0,
    hotspot: seed.fill >= 95,
    fillHistory: [seed.fill],
    isOnline: true,
    lastSeen: new Date(),
    offlineCount: 0,
  };
}

export function createLiveBinState(seeds) {
  return seeds.map(enrichSeedBin);
}

/** Advance one simulated IoT reading for a single bin. */
export function tickBin(bin) {
  let isOnline = bin.isOnline;
  let offlineCount = bin.offlineCount || 0;

  if (isOnline && Math.random() < 0.03) {
    isOnline = false;
    offlineCount = 0;
  } else if (!isOnline) {
    offlineCount += 1;
    if (offlineCount > 2 && Math.random() < 0.4) {
      isOnline = true;
      offlineCount = 0;
    }
  }

  if (!isOnline) {
    return { ...bin, isOnline: false, offlineCount, lastSeen: bin.lastSeen };
  }

  const rate = AREA_FILL_RATE[bin.area] || 0.5;
  const newFill = Math.min(100, Math.round(bin.fill + rand(0, rate * 2)));
  const newTemp = Math.round(Math.min(38, Math.max(18, bin.temperature + rand(-0.5, 1.2))));
  const newGas = Math.min(100, Math.round(bin.gas + rand(0, 1.5)));
  const fillHistory = [...(bin.fillHistory || [bin.fill]), newFill].slice(-FILL_HISTORY_MAX);

  return {
    ...bin,
    fill: newFill,
    temperature: newTemp,
    gas: newGas,
    fillHistory,
    isOnline: true,
    lastSeen: new Date(),
    offlineCount: 0,
    hotspot: newFill >= 95,
    highFillCount: (bin.highFillCount || 0) + (newFill >= 85 && bin.fill < 85 ? 1 : 0),
  };
}

export function tickBins(bins) {
  return bins.map(tickBin);
}

/** Morning / evening snapshots for replay mode. */
export function buildHistoricalSnapshots(seeds) {
  return {
    morning: seeds.map((b) =>
      enrichSeedBin({
        ...b,
        fill: Math.max(5, b.fill - 10),
        temperature: Math.max(18, b.temperature - 2),
        gas: Math.max(10, b.gas - 6),
        lastCollected: "06:30 AM",
      })
    ),
    evening: seeds.map((b) => {
      const fill = Math.min(100, b.fill + 12);
      return enrichSeedBin({
        ...b,
        fill,
        temperature: b.temperature + 3,
        gas: Math.min(100, b.gas + 7),
        lastCollected: "07:00 PM",
      });
    }),
  };
}

/** Strip Date objects for JSON POST to Python analysis API. */
export function binsForAnalysisApi(bins) {
  return bins.map((b) => ({
    name: b.name,
    deviceId: b.deviceId,
    lat: b.lat,
    lng: b.lng,
    fill: b.fill,
    temperature: b.temperature,
    gas: b.gas,
    area: b.area,
    isOnline: b.isOnline,
    fillHistory: b.fillHistory,
  }));
}
