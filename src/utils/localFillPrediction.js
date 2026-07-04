/**
 * Offline fill projection for the next `hoursAhead` hours when no prediction API is reachable.
 * Uses bin sensors only — not a trained model.
 */
export function localPredictFill(bin, hoursAhead = 2) {
  const fill = Math.min(100, Math.max(0, Number(bin?.fill) || 0));
  const temp = Number(bin?.temperature);
  const gas = Number(bin?.gas);
  const t = Number.isFinite(temp) ? temp : 22;
  const g = Number.isFinite(gas) ? gas : 30;
  const heatFactor = Math.max(0, (t - 18) / 28);
  const gasFactor = Math.min(1, g / 100);
  const fillMomentum = (fill / 100) * 7;
  const hourlyRate = 0.65 + heatFactor * 2.4 + gasFactor * 2.8 + fillMomentum * 0.12;
  const delta = hourlyRate * Math.max(0.25, hoursAhead);
  return Math.min(100, Math.round(fill + delta));
}
