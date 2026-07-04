export function getColor(fill) {
  if (fill < 40) return "green";
  if (fill < 80) return "orange";
  return "red";
}

export function getStatus(fill) {
  if (fill < 40) return "Empty";
  if (fill < 80) return "Moderate";
  if (fill < 100) return "Almost Full";
  return "CRITICAL - Needs Immediate Pickup!";
}

export function countBinCategories(binList) {
  let empty = 0;
  let moderate = 0;
  let fullBins = 0;
  binList.forEach((bin) => {
    if (bin.fill < 40) empty++;
    else if (bin.fill < 80) moderate++;
    else fullBins++;
  });
  return { empty, moderate, fullBins };
}

export function countStats(binList) {
  let full = 0;
  let critical = 0;
  binList.forEach((bin) => {
    if (bin.fill >= 80) full++;
    if (bin.fill === 100) critical++;
  });
  return { total: binList.length, full, critical };
}

export function isHotspot(bin) {
  return bin.hotspot || false;
}

export function getOverflowRisk(bin) {
  if (!bin.fillHistory?.length || bin.fillHistory.length < 2) return null;

  const last = bin.fillHistory[bin.fillHistory.length - 1];
  const previous = bin.fillHistory[bin.fillHistory.length - 2];
  const delta = last - previous;
  if (delta <= 0) return null;

  const simulatedIntervalMinutes = 15;
  const ratePerHour = (delta / simulatedIntervalMinutes) * 60;
  if (ratePerHour <= 0) return null;

  const hoursToOverflow = (100 - bin.fill) / ratePerHour;
  if (!Number.isFinite(hoursToOverflow) || hoursToOverflow <= 0) return null;

  return {
    hours: Math.round(hoursToOverflow * 2) / 2,
    ratePerHour: Math.round(ratePerHour * 10) / 10,
  };
}

export function getOverflowHtml(bin) {
  const risk = getOverflowRisk(bin);
  if (!risk) return "";
  if (risk.hours <= 2) {
    return `<br><b style='color:#ff6b6b'>Overflow risk in ${risk.hours}h</b>`;
  }
  return `<br><b style='color:#ffd166'>Likely overflow in ${risk.hours}h</b>`;
}

export function popupHtml(bin) {
  const assignment = bin.assigned ? `<br><b>Assigned to ${bin.assignedTruck}</b>` : "";
  const hotspotLabel = isHotspot(bin) ? `<br><b style='color:#ffd166'>HOTSPOT AREA</b>` : "";
  const overflowLabel = getOverflowHtml(bin);
  const offlineLabel = !bin.isOnline ? `<br><b style='color:#ff6b6b'>📡 OFFLINE - Last seen: ${Math.round((Date.now() - bin.lastSeen.getTime()) / 60000)}m ago</b>` : "";
  return `<b>${bin.name}</b><br>Fill Level: ${bin.fill}%<br>Temperature: ${bin.temperature}°C<br>Gas Level: ${bin.gas}%<br>Last collected: ${bin.lastCollected}<br>Status: ${getStatus(bin.fill)}${assignment}${hotspotLabel}${overflowLabel}${offlineLabel}`;
}
