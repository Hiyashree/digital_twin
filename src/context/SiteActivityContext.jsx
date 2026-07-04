import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  SITE_ACTIVITY_EVENT,
  SITE_ACTIVITY_STORAGE_KEY,
  MAX_SITE_ACTIVITY_ITEMS,
  emitSiteActivity,
  routePathToLabel,
} from "../utils/siteActivity.js";
import { HOTSPOT_SITE_PHOTOS_UPDATED_EVENT } from "../utils/hotspotSitePhotos.js";

const Ctx = createContext(null);

function loadStored() {
  try {
    const raw = localStorage.getItem(SITE_ACTIVITY_STORAGE_KEY);
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function persist(items) {
  try {
    localStorage.setItem(SITE_ACTIVITY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_SITE_ACTIVITY_ITEMS)));
  } catch {
    /* quota or private mode */
  }
}

function lastClassificationLine() {
  try {
    const raw = localStorage.getItem("msw_vit_classification_log_v1");
    const arr = JSON.parse(raw || "[]");
    const last = Array.isArray(arr) ? arr[arr.length - 1] : null;
    if (!last) return "Classification log updated.";
    const cls = last.predictedClass || last.wasteType || (last.recyclable ? "Recyclable" : "Non-recyclable");
    const conf = typeof last.confidence === "number" && Number.isFinite(last.confidence)
      ? ` · ${Math.round(last.confidence * 100)}% confidence`
      : "";
    return `Image classified: ${cls}${conf}`;
  } catch {
    return "Classification log updated.";
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function SiteActivityRouteTracker() {
  const { pathname, search } = useLocation();
  const timer = useRef(null);

  useEffect(() => {
    const key = `${pathname}${search || ""}`;
    const label = routePathToLabel(pathname, search || "");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      emitSiteActivity({
        category: "navigation",
        kind: "notice",
        severity: "low",
        title: "Page opened",
        desc: label,
        location: "Navigation",
        route: key,
      });
    }, 80);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, search]);

  return null;
}

function SiteActivityExternalDigest() {
  const onClassify = useMemo(
    () =>
      debounce(() => {
        emitSiteActivity({
          category: "classification",
          kind: "notice",
          severity: "low",
          title: "Classification",
          desc: lastClassificationLine(),
          location: "Image Classification",
        });
      }, 400),
    []
  );

  const onHotspotPhotos = useMemo(
    () =>
      debounce(() => {
        emitSiteActivity({
          category: "hotspot",
          kind: "notice",
          severity: "low",
          title: "Field photos",
          desc: "Hotspot / site photo set was updated.",
          location: "Hotspot Mapping",
        });
      }, 400),
    []
  );

  const onTrainingQueue = useMemo(
    () =>
      debounce(() => {
        emitSiteActivity({
          category: "training",
          kind: "notice",
          severity: "low",
          title: "Training queue",
          desc: "Training dataset queue changed.",
          location: "Dataset / ML",
        });
      }, 400),
    []
  );

  const onTrainingOverride = useMemo(
    () =>
      debounce(() => {
        emitSiteActivity({
          category: "training",
          kind: "notice",
          severity: "low",
          title: "Label overrides",
          desc: "Training label overrides were updated.",
          location: "Dataset / ML",
        });
      }, 400),
    []
  );

  const onMlGallery = useMemo(
    () =>
      debounce(() => {
        emitSiteActivity({
          category: "gallery",
          kind: "notice",
          severity: "low",
          title: "ML gallery",
          desc: "Inference gallery storage was updated.",
          location: "ML Data Hub",
        });
      }, 400),
    []
  );

  useEffect(() => {
    window.addEventListener("msw-classification-log-updated", onClassify);
    window.addEventListener(HOTSPOT_SITE_PHOTOS_UPDATED_EVENT, onHotspotPhotos);
    window.addEventListener("msw-training-queue-updated", onTrainingQueue);
    window.addEventListener("msw-training-override-updated", onTrainingOverride);
    window.addEventListener("msw-ml-gallery-updated", onMlGallery);
    return () => {
      window.removeEventListener("msw-classification-log-updated", onClassify);
      window.removeEventListener(HOTSPOT_SITE_PHOTOS_UPDATED_EVENT, onHotspotPhotos);
      window.removeEventListener("msw-training-queue-updated", onTrainingQueue);
      window.removeEventListener("msw-training-override-updated", onTrainingOverride);
      window.removeEventListener("msw-ml-gallery-updated", onMlGallery);
    };
  }, [onClassify, onHotspotPhotos, onTrainingQueue, onTrainingOverride, onMlGallery]);

  return null;
}

export function SiteActivityProvider({ children }) {
  const [items, setItems] = useState(() => (typeof window !== "undefined" ? loadStored() : []));

  useEffect(() => {
    const onEvent = (e) => {
      const d = e?.detail;
      if (!d || !d.id) return;
      setItems((prev) => {
        if (prev.some((x) => x.id === d.id)) return prev;
        const next = [d, ...prev].slice(0, MAX_SITE_ACTIVITY_ITEMS);
        persist(next);
        return next;
      });
    };
    window.addEventListener(SITE_ACTIVITY_EVENT, onEvent);
    return () => window.removeEventListener(SITE_ACTIVITY_EVENT, onEvent);
  }, []);

  const clearFeed = useCallback(() => {
    setItems([]);
    try {
      localStorage.removeItem(SITE_ACTIVITY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ items, clearFeed }), [items, clearFeed]);

  return (
    <Ctx.Provider value={value}>
      <SiteActivityRouteTracker />
      <SiteActivityExternalDigest />
      {children}
    </Ctx.Provider>
  );
}

/** @returns {{ items: object[], clearFeed: () => void } | null} */
export function useSiteActivityOptional() {
  return useContext(Ctx);
}

export function useSiteActivity() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteActivity requires SiteActivityProvider");
  return v;
}
