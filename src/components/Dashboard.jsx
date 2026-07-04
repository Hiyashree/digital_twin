import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  appendHotspotSitePhoto as appendHotspotSitePhotoStorage,
  loadHotspotSitePhotos,
  HOTSPOT_SITE_PHOTOS_STORAGE_KEY,
  HOTSPOT_SITE_PHOTOS_UPDATED_EVENT,
} from "../utils/hotspotSitePhotos.js";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import PortalShell from "./portal/PortalShell.jsx";
import ImageClassification from "./ImageClassification.jsx";
import Settings from "./Settings.jsx";
import UserManagement from "./UserManagement.jsx";
import HotspotMappingPage from "./HotspotMappingPage.jsx";
import { apiUrl } from "../config/api.js";
import { Line, Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from "chart.js";
import BinChart from "./BinChart.jsx";
import { DashboardNotificationProvider } from "../context/DashboardNotificationContext.jsx";
import { DatasetLibraryProvider } from "../context/DatasetLibraryContext.jsx";
import { ImageClassificationSessionProvider } from "../context/ImageClassificationSessionContext.jsx";
import DashboardHome from "./DashboardHome.jsx";
import WasteMap from "./WasteMap.jsx";
import ExpandableMapFrame from "./ExpandableMapFrame.jsx";
import {
  TELEMETRY_TICK_MS,
  binsForAnalysisApi,
  buildHistoricalSnapshots,
  createLiveBinState,
  tickBins,
} from "../data/binTelemetrySimulator.js";
import AlertsNotifications from "./AlertsNotifications.jsx";
import WasteReports from "./WasteReports.jsx";
import DatasetManagement from "./DatasetManagement.jsx";
import MlDataHub from "./MlDataHub.jsx";
import { countStats, getOverflowRisk } from "../utils/binHelpers.js";
import { optimizePickupRoute } from "../utils/routeHelpers.js";
import { municipalDepots } from "../data/municipalDepots.js";
import { criticalAlertGuard } from "../utils/criticalAlertGuard.js";
import { getCurrentTimeOfDay, getSchedulingInsights } from "../utils/schedulingHelpers.js";
import {
  CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT,
  collectionStopsFromHotspots,
  computeHotspotGarbagePercent,
  getMergedWasteHotspots,
} from "../utils/wasteHotspots.js";
import { portal as portalTheme } from "./portal/portalTheme.js";
import { localPredictFill } from "../utils/localFillPrediction.js";
import {
  mergeCitizenReports,
  appendLocalVisionReport,
  reconcileReportsAfterPost,
  shadowPersistAdminReport,
  shadowRemoveAdminReport,
} from "../utils/citizenReportsMerge.js";
import { emitSiteActivity, notificationTypeToSeverity } from "../utils/siteActivity.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const DASH = "/dashboard";

const titleStyle = {
  margin: 0,
  fontSize: "clamp(1.35rem, 2.5vw, 2.05rem)",
  lineHeight: 1.12,
  letterSpacing: "-0.03em",
};

const navLinkBtn = ({ isActive }) => ({
  textDecoration: "none",
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${isActive ? `rgba(${portalTheme.accentRgb}, 0.55)` : "rgba(255,255,255,0.14)"}`,
  background: isActive ? `rgba(${portalTheme.accentRgb}, 0.18)` : "rgba(255,255,255,0.06)",
  color: isActive ? "#ecfdf5" : "rgba(226,240,232,0.88)",
});

const heroCard = {
  borderRadius: 18,
  overflow: "hidden",
  background:
    "linear-gradient(135deg, rgba(50, 170, 104, 0.22) 0%, rgba(66, 126, 206, 0.16) 46%, rgba(255, 153, 61, 0.12) 100%)",
  border: "1px solid rgba(130, 230, 180, 0.36)",
  boxShadow: "0 20px 60px rgba(39, 136, 112, 0.25)",
  backdropFilter: "blur(20px)",
  position: "relative",
};

const heroInner = {
  padding: "14px 16px",
  display: "grid",
  gap: 8,
};

const heroSubtitle = {
  maxWidth: 620,
  color: "rgba(229, 250, 241, 0.86)",
  fontSize: "0.92rem",
  lineHeight: 1.55,
};

const statGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
};

const statCard = {
  padding: "11px 12px",
  borderRadius: 14,
  background:
    "linear-gradient(135deg, rgba(121, 221, 162, 0.16) 0%, rgba(70, 129, 214, 0.14) 100%)",
  border: "1px solid rgba(173, 244, 201, 0.25)",
  transition: "all 0.3s ease",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: "0 8px 25px rgba(108, 92, 231, 0.2)",
  },
};

const statLabel = {
  color: "rgba(224, 255, 240, 0.76)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontSize: 11,
  marginBottom: 4,
};

const statValue = {
  fontSize: "1.45rem",
  fontWeight: 800,
  margin: 0,
};

const largeCard = {
  borderRadius: 16,
  background:
    "linear-gradient(145deg, rgba(97, 182, 129, 0.12) 0%, rgba(49, 110, 155, 0.1) 50%, rgba(255, 160, 92, 0.08) 100%)",
  border: "1px solid rgba(155, 234, 194, 0.2)",
  boxShadow: "0 16px 40px rgba(4, 20, 28, 0.35)",
  overflow: "hidden",
  transition: "all 0.3s ease",
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "11px 14px",
  borderBottom: "1px solid rgba(192, 246, 217, 0.15)",
  background:
    "linear-gradient(135deg, rgba(74, 187, 124, 0.18) 0%, rgba(64, 141, 221, 0.12) 100%)",
};

const cardTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
};

const cardContent = {
  padding: "12px 14px 14px",
  display: "grid",
  gap: 10,
};

const insightsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 10,
};

const homeInsightsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: 10,
};

const insightCard = {
  borderRadius: 16,
  background:
    "linear-gradient(145deg, rgba(95, 187, 128, 0.11) 0%, rgba(72, 132, 221, 0.1) 62%, rgba(255, 170, 95, 0.08) 100%)",
  border: "1px solid rgba(161, 236, 196, 0.2)",
  boxShadow: "0 12px 30px rgba(5, 24, 33, 0.28)",
  overflow: "hidden",
  transition: "all 0.3s ease",
};

const insightHeader = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(191, 244, 215, 0.14)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background:
    "linear-gradient(135deg, rgba(71, 177, 119, 0.16) 0%, rgba(62, 131, 217, 0.1) 100%)",
};

const insightTitle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
};

const insightBody = {
  padding: "11px 12px 12px",
};

const statBadge = {
  padding: "10px 14px",
  borderRadius: 16,
  background: "rgba(189, 248, 216, 0.16)",
  color: "#d9fff0",
  fontSize: 13,
  fontWeight: 700,
};

const controlRow = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "1fr auto auto",
  alignItems: "center",
};

const selectStyle = {
  width: "100%",
  minWidth: 0,
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "#fff",
  fontSize: 14,
};

const routeButton = {
  border: "none",
  background: "linear-gradient(135deg, #6de09f, #48b7a8)",
  color: "#042019",
  padding: "14px 20px",
  borderRadius: 18,
  cursor: "pointer",
  fontWeight: 700,
  transition: "transform 0.18s ease",
};

const clearButton = {
  ...routeButton,
  background: "rgba(201, 247, 221, 0.14)",
  color: "#dcfff1",
  border: "1px solid rgba(201, 247, 221, 0.25)",
};

const routeBar = {
  margin: "0",
  padding: 11,
  background: "rgba(8, 31, 34, 0.86)",
  borderRadius: 14,
  border: "1px solid rgba(178, 241, 207, 0.2)",
  color: "rgba(218, 255, 236, 0.9)",
};

const truckSelect = {
  width: "100%",
  minWidth: 0,
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "#fff",
  fontSize: 14,
};

const binList = {
  display: "grid",
  gap: 14,
  margin: 0,
  padding: 0,
};

const binCard = {
  display: "grid",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(111, 196, 149, 0.11)",
  border: "1px solid rgba(173, 242, 202, 0.22)",
};

const binRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};

const binName = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
};

const binMeta = {
  margin: 0,
  color: "rgba(255, 255, 255, 0.68)",
  fontSize: 13,
};

const progressBarBackground = {
  height: 12,
  borderRadius: 999,
  background: "rgba(215, 255, 236, 0.13)",
  overflow: "hidden",
};

const progressBarFill = (value) => ({
  width: `${value}%`,
  height: "100%",
  borderRadius: 999,
  background:
    value >= 90
      ? "linear-gradient(90deg, #ff7c5f, #ff4f4f)"
      : value >= 70
      ? "linear-gradient(90deg, #ffce5f, #ff9d47)"
      : "linear-gradient(90deg, #5de09a, #4cb7d8)",
});

const predictButton = {
  border: "none",
  background: "linear-gradient(135deg, #82e95e, #39c98a)",
  color: "#053021",
  padding: "12px 16px",
  borderRadius: 14,
  cursor: "pointer",
  fontWeight: 700,
};

// Environmental Impact Calculation Utilities
const calculateEnvironmentalImpact = (optimizedDistance, stopCount) => {
  // Baseline: assume random collection would be 30% less efficient
  const baselineDistance = optimizedDistance * 1.3;
  const distanceSaved = baselineDistance - optimizedDistance;

  // Fuel consumption: ~8L per 100km for waste collection truck
  const fuelConsumptionPerKm = 0.08; // liters per km
  const fuelSaved = distanceSaved * fuelConsumptionPerKm;

  // CO2 emissions: ~2.3 kg CO2 per liter of diesel
  const co2PerLiter = 2.3; // kg CO2 per liter
  const co2Reduced = fuelSaved * co2PerLiter;

  return {
    distanceSaved: Math.round(distanceSaved * 10) / 10,
    fuelSaved: Math.round(fuelSaved * 10) / 10,
    co2Reduced: Math.round(co2Reduced * 10) / 10,
    baselineDistance: Math.round(baselineDistance * 10) / 10
  };
};

const formatImpactNumber = (value, unit) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k ${unit}`;
  }
  return `${value.toFixed(1)} ${unit}`;
};

export default function Dashboard({ initialBins, getPrediction }) {
  const trucks = [
    { id: "T1", name: "Truck A" },
    { id: "T2", name: "Truck B" },
    { id: "T3", name: "Truck C" },
  ];

  const [assignMenuBin, setAssignMenuBin] = useState(null);
  /** Last prediction shown per bin (always updated synchronously so the button visibly “does something”). */
  const [binPrediction, setBinPrediction] = useState({});
  const [bins, setBins] = useState(() => createLiveBinState(initialBins));
  const [routeData, setRouteData] = useState({ stops: [], coordinates: [], distance: 0, warning: "" });
  const [routeMessage, setRouteMessage] = useState(
    "Site-based routing: collection paths use tourist POI centers ranked by garbage pressure (bin telemetry weights severity only)."
  );
  const [isRouting, setIsRouting] = useState(false);
  const [isAutoRouting, setIsAutoRouting] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState(municipalDepots[0]);
  const [notifications, setNotifications] = useState([]);
  const [environmentalImpact, setEnvironmentalImpact] = useState({
    totalDistanceSaved: 0,
    totalFuelSaved: 0,
    totalCO2Reduced: 0,
    routesOptimized: 0,
    lastRouteDistance: 0,
    baselineDistance: 0,
    autoRoutesTriggered: 0,
    selfHealingEvents: 0,
  });
  const [citizenReports, setCitizenReports] = useState([]);
  const [hotspotSitePhotos, setHotspotSitePhotos] = useState(() => loadHotspotSitePhotos());
  const [hotspotZoneRev, setHotspotZoneRev] = useState(0);
  const mergedWasteHotspots = useMemo(() => getMergedWasteHotspots(), [hotspotZoneRev]);
  const [reportingLocation, setReportingLocation] = useState(null);
  const [reportsSyncing, setReportsSyncing] = useState(false);
  const [reportsReady, setReportsReady] = useState(false);
  const [selectedReplayMode, setSelectedReplayMode] = useState("current");
  const [activeScenario, setActiveScenario] = useState(null);
  const [wasteFlowAnalysis, setWasteFlowAnalysis] = useState(null);
  const [historicalBins] = useState(() => buildHistoricalSnapshots(initialBins));
  const activeBins = selectedReplayMode === "current"
    ? (activeScenario ? activeScenario.result.modifiedBins : bins)
    : historicalBins[selectedReplayMode];

  useEffect(() => {
    if (selectedReplayMode !== "current" || activeScenario) return undefined;

    const id = setInterval(() => {
      setBins((prev) => tickBins(prev));
    }, TELEMETRY_TICK_MS);

    return () => clearInterval(id);
  }, [selectedReplayMode, activeScenario]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(apiUrl("/api/waste-flow/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bins: binsForAnalysisApi(activeBins) }),
        });
        if (!cancelled && res.ok) {
          setWasteFlowAnalysis(await res.json());
        }
      } catch {
        if (!cancelled) setWasteFlowAnalysis(null);
      }
    };
    void run();
    const id = setInterval(run, TELEMETRY_TICK_MS * 2);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeBins]);

  useEffect(() => {
    const sync = () => setHotspotSitePhotos(loadHotspotSitePhotos());
    const onStorage = (e) => {
      if (e.key === HOTSPOT_SITE_PHOTOS_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener(HOTSPOT_SITE_PHOTOS_UPDATED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOTSPOT_SITE_PHOTOS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const bump = () => setHotspotZoneRev((n) => n + 1);
    window.addEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
    return () => window.removeEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
  }, []);

  const appendHotspotSitePhoto = useCallback((rec) => {
    setHotspotSitePhotos((prev) => appendHotspotSitePhotoStorage(prev, rec));
  }, []);

  useEffect(() => {
    if (criticalAlertGuard.initialFullBinAlertsDone) return;
    criticalAlertGuard.initialFullBinAlertsDone = true;
    initialBins.forEach((bin) => {
      if (bin.fill === 100) {
        addNotification(`${bin.name} is critical and needs immediate pickup!`, "critical");
      }
    });
  }, [initialBins]);

  // Auto route when a tourist-site pressure score crosses threshold (severity from nearby bins, stops are POI centers)
  const lastHotspotSeverityRef = useRef({});
  const lastAutoRouteTimeRef = useRef(0);

  useEffect(() => {
    const HOTSPOT_TRIGGER_PCT = 85;
    const newlyCriticalSites = [];

    mergedWasteHotspots.forEach((spot) => {
      const p = computeHotspotGarbagePercent(spot, activeBins, hotspotSitePhotos);
      const prev = lastHotspotSeverityRef.current[spot.name];
      lastHotspotSeverityRef.current[spot.name] = p;
      if (p >= HOTSPOT_TRIGGER_PCT && (prev === undefined || prev < HOTSPOT_TRIGGER_PCT)) {
        newlyCriticalSites.push(spot.name);
      }
    });

    if (newlyCriticalSites.length > 0 && Date.now() - lastAutoRouteTimeRef.current > 30000) {
      lastAutoRouteTimeRef.current = Date.now();
      setIsAutoRouting(true);

      handleOptimizeRoute().then(() => {
        const siteNames = newlyCriticalSites.join(", ");
        addNotification(`Auto-route updated: high pressure at tourist site(s): ${siteNames}`, "critical");
        setRouteMessage(`Route recalculated — hotspot pressure reached ${HOTSPOT_TRIGGER_PCT}%+ at ${siteNames}.`);

        setEnvironmentalImpact((prev) => ({
          ...prev,
          autoRoutesTriggered: prev.autoRoutesTriggered + 1,
        }));

        setIsAutoRouting(false);
      }).catch((error) => {
        console.warn("Auto route recalculation failed:", error);
        setIsAutoRouting(false);
      });
    }
  }, [activeBins, hotspotSitePhotos, selectedDepot, mergedWasteHotspots]);

  const { total, full, critical } = countStats(activeBins);
  const offlineCount = activeBins.filter(bin => !bin.isOnline).length;

  const avgFill = useMemo(
    () =>
      activeBins.length > 0
        ? Math.round(activeBins.reduce((sum, b) => sum + b.fill, 0) / activeBins.length)
        : 0,
    [activeBins]
  );

  const trendSeries = useMemo(() => Array(7).fill(avgFill), [avgFill]);

  const areaSeries = useMemo(() => {
    const map = { office: "north", residential: "south", market: "east", tourism: "west" };
    const sums = { north: 0, south: 0, east: 0, west: 0 };
    const cnt = { north: 0, south: 0, east: 0, west: 0 };
    activeBins.forEach((b) => {
      const z = map[b.area] || "north";
      sums[z] += b.fill;
      cnt[z] += 1;
    });
    return {
      north: cnt.north ? Math.round(sums.north / cnt.north) : avgFill,
      south: cnt.south ? Math.round(sums.south / cnt.south) : avgFill,
      east: cnt.east ? Math.round(sums.east / cnt.east) : avgFill,
      west: cnt.west ? Math.round(sums.west / cnt.west) : avgFill,
    };
  }, [activeBins, avgFill]);

  const wastedToday = activeBins.reduce((sum, bin) => sum + bin.fill * 0.12, 0);
  const pickupCount = activeBins.filter((bin) => bin.assigned).length;
  const avgTemp = Math.round(activeBins.reduce((sum, bin) => sum + bin.temperature, 0) / activeBins.length);

  const timeOfDay = getCurrentTimeOfDay();
  const schedulingInsights = getSchedulingInsights(activeBins, timeOfDay);
  const hotspotBins = activeBins.filter((bin) => bin.hotspot);
  const hotspotNames = hotspotBins.map((bin) => bin.name).join(", ");
  const overflowRiskBins = activeBins
    .map((bin) => ({ ...bin, overflowRisk: getOverflowRisk(bin) }))
    .filter((bin) => bin.overflowRisk && bin.overflowRisk.hours <= 4);
  const overflowWarning = overflowRiskBins.length
    ? `${overflowRiskBins[0].name} likely to overflow in ${overflowRiskBins[0].overflowRisk.hours}h`
    : null;

  const trendData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      {
        label: "Average Fill (%)",
        data: trendSeries,
        borderColor: "rgba(132, 210, 255, 0.95)",
        backgroundColor: "rgba(132, 210, 255, 0.28)",
        tension: 0.4,
        fill: true,
        pointRadius: 4,
      },
    ],
  };

  const trendOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "#e8f1ff" } },
      y: { beginAtZero: true, max: 100, grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "#e8f1ff" } },
    },
  };

  const areaComparisonData = {
    labels: ["North", "South", "East", "West"],
    datasets: [
      {
        label: "Average Fill (%)",
        data: [areaSeries.north, areaSeries.south, areaSeries.east, areaSeries.west],
        backgroundColor: ["#5b9bff", "#7ff3a4", "#ffb86c", "#d37bff"],
        borderRadius: 12,
      },
    ],
  };

  const areaOptions = {
    indexAxis: "y",
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: { beginAtZero: true, max: 100, grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "#e8f1ff" } },
      y: { ticks: { color: "#e8f1ff" }, grid: { display: false } },
    },
  };

  const optimizeRouteInFlightRef = useRef(false);

  async function handleOptimizeRoute() {
    if (optimizeRouteInFlightRef.current) return;
    optimizeRouteInFlightRef.current = true;

    try {
      const routeTargets = collectionStopsFromHotspots(activeBins, { limit: 6, sitePhotos: hotspotSitePhotos });

      if (routeTargets.length === 0) {
        setRouteData({ stops: [], coordinates: [], distance: 0, warning: "" });
        setRouteMessage("No tourist POIs are configured for collection routing.");
        return;
      }

      setIsRouting(true);
      setRouteMessage(`Computing truck route via top tourist sites (by garbage pressure)…`);

      const result = await optimizePickupRoute(routeTargets, selectedDepot);
      setIsRouting(false);

      if (!result.stops.length) {
        setRouteData({ stops: [], coordinates: [], distance: 0, warning: result.warning });
        setRouteMessage(result.warning || "Unable to compute a road route at this time.");
        return;
      }

      setRouteData(result);
      const names = result.stops.map((s) => s.name).join(" → ");
      const distanceKm = (result.distance / 1000).toFixed(1);

      const impact = calculateEnvironmentalImpact(result.distance / 1000, result.stops.length);
      setEnvironmentalImpact(prev => ({
        totalDistanceSaved: prev.totalDistanceSaved + impact.distanceSaved,
        totalFuelSaved: prev.totalFuelSaved + impact.fuelSaved,
        totalCO2Reduced: prev.totalCO2Reduced + impact.co2Reduced,
        routesOptimized: prev.routesOptimized + 1,
        lastRouteDistance: result.distance / 1000,
        baselineDistance: impact.baselineDistance
      }));

      setRouteMessage(
        `Site route optimized (${result.stops.length} stop(s), ${distanceKm} km) from ${selectedDepot.name}: ${names}` +
          (result.warning ? ` ${result.warning}` : "")
      );
      addNotification(`Hotspot/site route optimized (${distanceKm} km). Saved ~${impact.distanceSaved} km vs unstructured driving.`, "success");
    } finally {
      optimizeRouteInFlightRef.current = false;
    }
  }

  /** One-time default route so overview + Field maps show the truck line without the 85% pressure auto-trigger. */
  const didBootstrapRouteRef = useRef(false);
  useEffect(() => {
    if (didBootstrapRouteRef.current) return;
    const bootstrapTargets = collectionStopsFromHotspots(activeBins, { limit: 6, sitePhotos: hotspotSitePhotos });
    if (bootstrapTargets.length === 0) return;
    didBootstrapRouteRef.current = true;
    void handleOptimizeRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when routing inputs first become viable
  }, [activeBins, hotspotSitePhotos, selectedDepot]);

  function clearRoute() {
    setRouteData({ stops: [], coordinates: [], distance: 0, warning: "" });
    setRouteMessage("Route cleared. Optimize again to rebuild a POI-centered collection path.");
    addNotification("Route cleared", "info");
  }

  const handlePrediction = (bin) => {
    const hours = 2;
    const immediate = localPredictFill(bin, hours);
    const stamp = Date.now();
    setBinPrediction((prev) => ({
      ...prev,
      [bin.name]: { predicted: immediate, source: "local", at: stamp, updating: Boolean(getPrediction) },
    }));

    if (!getPrediction) return;

    void (async () => {
      try {
        const raw = await getPrediction(bin);
        const predicted = typeof raw === "number" ? raw : raw.predicted;
        const source = typeof raw === "number" ? "api" : raw.source;
        setBinPrediction((prev) => ({
          ...prev,
          [bin.name]: { predicted, source, at: Date.now(), updating: false },
        }));
        if (source === "api") {
          addNotification(`Prediction API: ~${hours} h fill for ${bin.name} → ${predicted}%`, "success");
        }
      } catch (error) {
        setBinPrediction((prev) => ({
          ...prev,
          [bin.name]: { ...(prev[bin.name] || {}), predicted: immediate, source: "local", updating: false },
        }));
        addNotification(`Prediction API unreachable — using sensor estimate on the card. (${error?.message || "network"})`, "warning");
      }
    })();
  };

  const addNotification = (message, type = "info") => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      message,
      type,
      timestamp: new Date(),
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 10)); // Keep only 10 most recent
    const text = String(message);
    emitSiteActivity({
      category: "operations",
      kind: "alert",
      title: text.split(/[\n.]/)[0].slice(0, 120) || "Activity",
      desc: text,
      severity: notificationTypeToSeverity(type),
      location: "Live operations",
      status: "new",
    });
  };

  const callReportsApi = useCallback(async (path, options = {}) => {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Citizen report request failed");
    }
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncReports = async (quiet = false) => {
      if (!quiet) {
        setReportsSyncing(true);
      }
      try {
        const data = await callReportsApi("/api/reports", { method: "GET" });
        if (!cancelled) {
          setCitizenReports(mergeCitizenReports(Array.isArray(data?.reports) ? data.reports : []));
          setReportsReady(true);
        }
      } catch (error) {
        if (!cancelled && !quiet) {
          console.warn("Report sync failed", error);
        }
      } finally {
        if (!cancelled && !quiet) {
          setReportsSyncing(false);
        }
      }
    };

    syncReports(false);
    const id = setInterval(() => {
      syncReports(true);
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [callReportsApi]);

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAssign = (binName, truck) => {
    setBins((prevBins) =>
      prevBins.map((bin) =>
        bin.name === binName
          ? {
              ...bin,
              assigned: true,
              assignedTruck: truck.name,
              assignedTruckId: truck.id,
            }
          : bin
      )
    );
    setAssignMenuBin(null);
    addNotification(`${binName} assigned to ${truck.name}`, "success");
  };

  const handleCancelAssignment = (binName) => {
    setBins((prevBins) =>
      prevBins.map((bin) =>
        bin.name === binName
          ? { ...bin, assigned: false, assignedTruck: null, assignedTruckId: null }
          : bin
      )
    );
    setAssignMenuBin(null);
    addNotification(`${binName} unassigned from truck`, "info");
  };

  const handleReportIssue = async (type) => {
    if (!reportingLocation) {
      addNotification("Click on the map to select a location for reporting.", "info");
      return;
    }

    try {
      setReportsSyncing(true);
      const created = await callReportsApi("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          type,
          location: reportingLocation,
        }),
      });
      shadowPersistAdminReport(created);
      let serverReports = [];
      try {
        const data = await callReportsApi("/api/reports", { method: "GET" });
        serverReports = Array.isArray(data?.reports) ? data.reports : [];
      } catch (getErr) {
        console.warn("Reports list refresh failed after POST", getErr);
      }
      setCitizenReports(
        mergeCitizenReports(reconcileReportsAfterPost(serverReports, created))
      );
      setReportingLocation(null);
      addNotification(`Issue reported: ${type} at location`, "success");
    } catch (error) {
      addNotification(`Failed to report issue: ${error?.message || "unknown error"}`, "critical");
    } finally {
      setReportsSyncing(false);
    }
  };

  /**
   * Workflow (2): Image Classification + GPS → POST Waste observation with AI metadata → hotspot map.
   */
  const handleVisionObservation = async (payload) => {
    const { location, vision, fieldPhoto, siteName } = payload;
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      addNotification("Set a map pin on Field monitoring / Hotspots first, or enter coordinates.", "info");
      return;
    }
    try {
      setReportsSyncing(true);
      const created = await callReportsApi("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          type: "Waste observation",
          location,
          vision,
          createdBy: "dashboard-classify",
          ...(fieldPhoto && typeof fieldPhoto === "object" ? { fieldPhoto } : {}),
          ...(siteName ? { siteName } : {}),
        }),
      });
      shadowPersistAdminReport(created);
      let serverReports = [];
      try {
        const data = await callReportsApi("/api/reports", { method: "GET" });
        serverReports = Array.isArray(data?.reports) ? data.reports : [];
      } catch (getErr) {
        console.warn("Reports list refresh failed after POST", getErr);
      }
      setCitizenReports(
        mergeCitizenReports(reconcileReportsAfterPost(serverReports, created))
      );
      setReportingLocation(null);
      addNotification("Vision observation logged — Meghalaya hotspot map updated.", "success");
    } catch (error) {
      const lr = {
        id: `local-${Date.now()}`,
        type: "Waste observation",
        location: { lat, lng },
        status: "open",
        timestamp: new Date().toISOString(),
        vision,
        createdBy: "offline-session",
        ...(fieldPhoto && typeof fieldPhoto === "object" ? { fieldPhoto } : {}),
        ...(siteName ? { siteName } : {}),
      };
      appendLocalVisionReport(lr);
      try {
        const data = await callReportsApi("/api/reports", { method: "GET" });
        setCitizenReports(mergeCitizenReports(Array.isArray(data?.reports) ? data.reports : []));
      } catch {
        setCitizenReports(mergeCitizenReports([]));
      }
      addNotification(
        `Observation stored on this browser only (${error?.message || "API offline"}). Start backend/app.py or ml_server.py to sync.`,
        "warning"
      );
    } finally {
      setReportsSyncing(false);
    }
  };

  const removeReport = async (id) => {
    if (String(id).startsWith("local-")) {
      try {
        const raw = sessionStorage.getItem("msw_local_vision_v1");
        const arr = JSON.parse(raw || "[]").filter((r) => r.id !== id);
        sessionStorage.setItem("msw_local_vision_v1", JSON.stringify(arr));
      } catch {
        /* ignore */
      }
      try {
        const data = await callReportsApi("/api/reports", { method: "GET" });
        setCitizenReports(mergeCitizenReports(Array.isArray(data?.reports) ? data.reports : []));
      } catch {
        setCitizenReports((prev) => prev.filter((r) => r.id !== id));
      }
      addNotification("Removed offline observation.", "info");
      return;
    }
    try {
      setReportsSyncing(true);
      await callReportsApi(`/api/reports/${id}`, { method: "DELETE" });
      shadowRemoveAdminReport(id);
      const data = await callReportsApi("/api/reports", { method: "GET" });
      setCitizenReports(mergeCitizenReports(Array.isArray(data?.reports) ? data.reports : []));
      addNotification("Report removed.", "info");
    } catch (error) {
      addNotification(`Failed to remove report: ${error?.message || "unknown error"}`, "critical");
    } finally {
      setReportsSyncing(false);
    }
  };

  const markReportResolved = async (id) => {
    if (String(id).startsWith("local-")) {
      addNotification("Offline observations cannot be resolved on the server until synced.", "info");
      return;
    }
    try {
      setReportsSyncing(true);
      await callReportsApi(`/api/reports/${id}/resolve`, { method: "PATCH" });
      const data = await callReportsApi("/api/reports", { method: "GET" });
      setCitizenReports(mergeCitizenReports(Array.isArray(data?.reports) ? data.reports : []));
      addNotification("Report marked as resolved.", "success");
    } catch (error) {
      addNotification(`Failed to resolve report: ${error?.message || "unknown error"}`, "critical");
    } finally {
      setReportsSyncing(false);
    }
  };

  const handleMapLocationClick = (lat, lng) => {
    setReportingLocation({ lat, lng });
  };

  return (
    <DashboardNotificationProvider notifications={notifications} onRemove={removeNotification}>
    <DatasetLibraryProvider>
    <ImageClassificationSessionProvider>
    <PortalShell>
      <>
      <Routes>
        <Route
          path="classify"
          element={
            <ImageClassification
              reportingLocation={reportingLocation}
              onConsumeReportingLocation={() => setReportingLocation(null)}
              onVisionObservation={handleVisionObservation}
              onAppendHotspotSitePhoto={appendHotspotSitePhoto}
            />
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="alerts" element={<AlertsNotifications />} />
        <Route path="reports" element={<WasteReports />} />
        <Route path="ml-data" element={<MlDataHub />} />
        <Route path="datasets" element={<DatasetManagement />} />
        <Route
          index
          element={
            <DashboardHome
              bins={activeBins}
              routeData={routeData}
              depots={municipalDepots}
              selectedDepot={selectedDepot}
              citizenReports={citizenReports}
              hotspotSitePhotos={hotspotSitePhotos}
              hotspotZones={mergedWasteHotspots}
              hotspotCount={hotspotBins.length}
              onMapLocationClick={() => {}}
            />
          }
        />

        <Route
          path="bins"
          element={
            <div style={largeCard}>
              <div style={cardHeader}>
                <div>
                  <h3 style={cardTitle}>
                    {selectedReplayMode === "current" ? "Smart Bins — IoT Digital Twin" : `${selectedReplayMode} replay`}
                  </h3>
                  <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.7)", fontSize: 13, maxWidth: 640 }}>
                    Simulated IoT sensors stream fill, temperature, and gas every {TELEMETRY_TICK_MS / 1000}s.
                    Leaflet map + Python waste-flow analysis power real-time monitoring.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                    {["current", "morning", "evening"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedReplayMode(mode)}
                        style={{
                          border: selectedReplayMode === mode ? "1px solid rgba(92,184,92,0.55)" : "1px solid rgba(255,255,255,0.14)",
                          background: selectedReplayMode === mode ? "rgba(92,184,92,0.18)" : "rgba(255,255,255,0.06)",
                          color: selectedReplayMode === mode ? "#ecfdf5" : "rgba(226,240,232,0.88)",
                          padding: "6px 12px",
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >
                        {mode === "current" ? "Live feed" : mode}
                      </button>
                    ))}
                    {selectedReplayMode === "current" && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "rgba(92,184,92,0.2)",
                          border: "1px solid rgba(92,184,92,0.45)",
                          color: "#bbf7d0",
                        }}
                      >
                        ● {activeBins.filter((b) => b.isOnline).length}/{activeBins.length} online
                        {offlineCount > 0 ? ` · ${offlineCount} offline` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <NavLink to={DASH} style={navLinkBtn}>
                  ← Overview
                </NavLink>
              </div>
              <div style={cardContent}>
                <ExpandableMapFrame
                  title="Bin locations — Leaflet.js"
                  subtitle="Circle markers show live simulated IoT fill levels across Meghalaya."
                  collapsedHeight="clamp(320px, 42vh, 480px)"
                  cardStyle={{
                    marginBottom: 16,
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid rgba(130, 230, 180, 0.22)",
                    background: "rgba(8, 18, 32, 0.55)",
                  }}
                >
                  <WasteMap
                    bins={activeBins}
                    routeData={routeData}
                    depots={municipalDepots}
                    selectedDepot={selectedDepot}
                    citizenReports={citizenReports}
                    hotspotSitePhotos={hotspotSitePhotos}
                    hotspotZones={mergedWasteHotspots}
                    showWasteHotspots={false}
                    showObservationHeat={false}
                    showBins
                    showBinDensityHeat
                  />
                </ExpandableMapFrame>

                {wasteFlowAnalysis && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 10,
                      marginBottom: 16,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.28)",
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.55)", marginBottom: 2 }}>Avg fill (Python)</div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{wasteFlowAnalysis.avg_fill}%</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.55)", marginBottom: 2 }}>Critical bins</div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{wasteFlowAnalysis.critical_count}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.55)", marginBottom: 2 }}>Offline sensors</div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{wasteFlowAnalysis.offline_count}</div>
                    </div>
                    {wasteFlowAnalysis.overflow_risk?.length > 0 && (
                      <div style={{ gridColumn: "1 / -1", color: "#ffd166" }}>
                        Overflow risk:{" "}
                        {wasteFlowAnalysis.overflow_risk
                          .slice(0, 3)
                          .map((r) => `${r.name} (~${r.hours_to_full}h)`)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ maxHeight: "min(52vh, 720px)", overflowY: "auto", paddingRight: 4 }}>
                  <div style={binList}>
                    {activeBins.map((bin) => (
                      <div
                        key={bin.name}
                        style={{
                          ...binCard,
                          opacity: bin.isOnline ? 1 : 0.6,
                          border: bin.isOnline ? binCard.border : "1px solid rgba(255, 107, 107, 0.3)",
                        }}
                      >
                        <div style={binRow}>
                          <div>
                            <p style={binName}>
                              {bin.name}
                              {!bin.isOnline && (
                                <span style={{ color: "#ff6b6b", marginLeft: 8, fontSize: "0.8em" }}>📡 OFFLINE</span>
                              )}
                            </p>
                            <p style={binMeta}>
                              {bin.deviceId} · Fill {bin.fill}%
                              {bin.assigned ? ` · ${bin.assignedTruck}` : " · Unassigned"}
                              {!bin.isOnline && ` · Last seen ${Math.round((Date.now() - bin.lastSeen.getTime()) / 60000)}m ago`}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button type="button" style={predictButton} onClick={() => handlePrediction(bin)}>
                              Predict Future
                            </button>
                            <button
                              type="button"
                              style={{
                                border: "none",
                                background: bin.assigned ? "#6bd1ff" : "#ff6b6b",
                                color: "#081220",
                                padding: "10px 14px",
                                borderRadius: 12,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                              onClick={() => setAssignMenuBin(bin.name)}
                            >
                              {bin.assigned ? "Change truck" : "Assign"}
                            </button>
                            {bin.assigned && (
                              <button
                                type="button"
                                style={{
                                  border: "none",
                                  background: "#ffb74d",
                                  color: "#081220",
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                                onClick={() => handleCancelAssignment(bin.name)}
                              >
                                Unassign
                              </button>
                            )}
                          </div>
                        </div>
                        {assignMenuBin === bin.name && (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                            {trucks.map((truck) => (
                              <button
                                key={truck.id}
                                type="button"
                                style={{
                                  border: "none",
                                  background: bin.assigned && bin.assignedTruckId === truck.id ? "#5bff96" : "#4f71ff",
                                  color: "#fff",
                                  padding: "8px 12px",
                                  borderRadius: 12,
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                                onClick={() => handleAssign(bin.name, truck)}
                              >
                                {truck.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              style={{
                                border: "1px solid rgba(255,255,255,0.18)",
                                background: "rgba(255,255,255,0.08)",
                                color: "#fff",
                                padding: "8px 12px",
                                borderRadius: 12,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                              onClick={() => setAssignMenuBin(null)}
                            >
                              Close
                            </button>
                          </div>
                        )}
                        {binPrediction[bin.name] != null && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: "10px 14px",
                              borderRadius: 12,
                              background:
                                binPrediction[bin.name].source === "api"
                                  ? "rgba(92,184,92,0.18)"
                                  : "rgba(59,130,246,0.12)",
                              border:
                                binPrediction[bin.name].source === "api"
                                  ? "1px solid rgba(92,184,92,0.45)"
                                  : "1px solid rgba(59,130,246,0.35)",
                              fontSize: 13,
                              lineHeight: 1.45,
                            }}
                          >
                            <strong style={{ color: "#e8fdf3" }}>~2 h forecast:</strong>{" "}
                            <span style={{ fontWeight: 800, fontSize: 15 }}>{binPrediction[bin.name].predicted}%</span> fill
                            {binPrediction[bin.name].updating ? (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Checking API…</span>
                            ) : null}
                            {!binPrediction[bin.name].updating && binPrediction[bin.name].source === "local" ? (
                              <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                                Local sensor estimate — run Flask for Python ML prediction.
                              </span>
                            ) : null}
                            {!binPrediction[bin.name].updating && binPrediction[bin.name].source === "api" ? (
                              <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                                Python RandomForest / waste-flow model.
                              </span>
                            ) : null}
                          </div>
                        )}
                        <div style={progressBarBackground}>
                          <div style={progressBarFill(bin.fill)} />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                            marginTop: 8,
                            color: "rgba(255,255,255,0.72)",
                            fontSize: 12,
                          }}
                        >
                          <span>🌡️ {bin.temperature}°C</span>
                          <span>🟠 Gas {bin.gas}%</span>
                          <span>⏱️ {bin.lastCollected}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <Route
          path="field"
          element={
            <HotspotMappingPage
              bins={activeBins}
              citizenReports={citizenReports}
              hotspotSitePhotos={hotspotSitePhotos}
              hotspotZones={mergedWasteHotspots}
              routeData={routeData}
              depots={municipalDepots}
              selectedDepot={selectedDepot}
              reportingLocation={reportingLocation}
              reportsSyncing={reportsSyncing}
              reportsReady={reportsReady}
              routeMessage={routeMessage}
              isRouting={isRouting}
              onOptimizeRoute={() => void handleOptimizeRoute()}
              onClearRoute={clearRoute}
              onLocationClick={handleMapLocationClick}
              onReportOverflow={() => handleReportIssue("Overflow")}
              onReportDirty={() => handleReportIssue("Dirty Area")}
              onResolveReport={markReportResolved}
              onRemoveReport={removeReport}
            />
          }
        />

        <Route
          path="analytics"
          element={
            <>
              <div style={insightsGrid}>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>Daily Waste Stats</h4>
                    <span style={statBadge}>
                      {selectedReplayMode === "current"
                        ? "Today"
                        : selectedReplayMode === "morning"
                          ? "Morning"
                          : "Evening"}
                    </span>
                  </div>
                  <div style={insightBody}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Total waste</span>
                        <strong>{Math.round(wastedToday)} kg</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Bins collected</span>
                        <strong>{pickupCount}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Average temp</span>
                        <strong>{avgTemp}°C</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Critical bins</span>
                        <strong>{critical}</strong>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>Trends</h4>
                    <span style={statBadge}>Weekly</span>
                  </div>
                  <div style={insightBody}>
                    <Line data={trendData} options={trendOptions} />
                  </div>
                </div>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>Area Comparison</h4>
                    <span style={statBadge}>Bins</span>
                  </div>
                  <div style={insightBody}>
                    <Bar data={areaComparisonData} options={areaOptions} />
                  </div>
                </div>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>🔥 Hotspot Detection</h4>
                    <span style={statBadge}>Bins</span>
                  </div>
                  <div style={insightBody}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Hotspot bins</span>
                        <strong>{hotspotBins.length}</strong>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.78)", minHeight: 56 }}>
                        {hotspotBins.length > 0 ? hotspotNames : "No recurring hotspot locations yet."}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>⚠️ Overflow Risk</h4>
                    <span style={statBadge}>Predictive</span>
                  </div>
                  <div style={insightBody}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>At-risk bins</span>
                        <strong>{overflowRiskBins.length}</strong>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.78)", minHeight: 56 }}>
                        {overflowRiskBins.length > 0
                          ? overflowRiskBins
                              .slice(0, 5)
                              .map((bin) => `${bin.name} in ${bin.overflowRisk.hours}h`)
                              .join(" • ")
                          : "No overflow risk detected in the next 4 hours."}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={insightCard}>
                  <div style={insightHeader}>
                    <h4 style={insightTitle}>🌱 Environmental Impact</h4>
                    <span style={statBadge}>Today</span>
                  </div>
                  <div style={insightBody}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>🚛 Distance Saved</span>
                        <strong style={{ color: "#7ff3a4" }}>
                          {formatImpactNumber(environmentalImpact.totalDistanceSaved, "km")}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>⛽ Fuel Saved</span>
                        <strong style={{ color: "#ffb86c" }}>
                          {formatImpactNumber(environmentalImpact.totalFuelSaved, "L")}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>🌿 CO₂ Reduced</span>
                        <strong style={{ color: "#74d0ff" }}>
                          {formatImpactNumber(environmentalImpact.totalCO2Reduced, "kg")}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Routes Optimized</span>
                        <strong>{environmentalImpact.routesOptimized}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={largeCard}>
                <div style={cardHeader}>
                  <h3 style={cardTitle}>Bin Fill Distribution</h3>
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <BinChart bins={activeBins} />
                </div>
              </div>
            </>
          }
        />

        <Route path="*" element={<Navigate to={DASH} replace />} />
      </Routes>

      </>
    </PortalShell>
    </ImageClassificationSessionProvider>
    </DatasetLibraryProvider>
    </DashboardNotificationProvider>
  );

}
