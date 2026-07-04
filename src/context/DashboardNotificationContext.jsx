import { createContext, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function DashboardNotificationProvider({ children, notifications, onRemove }) {
  const [panelOpen, setPanelOpen] = useState(false);

  const value = useMemo(
    () => ({
      notifications,
      onRemove,
      panelOpen,
      setPanelOpen,
      togglePanel: () => setPanelOpen((o) => !o),
      closePanel: () => setPanelOpen(false),
    }),
    [notifications, onRemove, panelOpen]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** @returns {{ notifications, onRemove, panelOpen, setPanelOpen, togglePanel, closePanel } | null} */
export function useDashboardNotificationsOptional() {
  return useContext(Ctx);
}
