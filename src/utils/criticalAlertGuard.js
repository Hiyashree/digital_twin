/**
 * Tracks whether we've already shown the "bin is full" alerts for the current
 * dashboard session. React 18 Strict Mode runs effects twice in development;
 * without this guard, users would see duplicate alert() dialogs.
 *
 * Call `resetCriticalAlertGuard()` on each successful login so a new session
 * can show alerts again after logout + login.
 */
export const criticalAlertGuard = {
  initialFullBinAlertsDone: false,
};

export function resetCriticalAlertGuard() {
  criticalAlertGuard.initialFullBinAlertsDone = false;
}
