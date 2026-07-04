import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import GeocoderControl from "leaflet-control-geocoder";
import { getColor, popupHtml } from "../utils/binHelpers.js";
import { blockedAreas } from "../utils/routeHelpers.js";
import {
  CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT,
  computeHotspotGarbagePercent,
  getMergedWasteHotspots,
  hotspotCircleStyle,
} from "../utils/wasteHotspots.js";
import { binFillHeatPoints, visionReportsHeatPoints } from "../utils/visionSpatialStats.js";
import { reportMarkerDivIconHtml, reportPopupHtml, safeFieldPhotoThumbUrl } from "../utils/citizenReportMapUi.js";
import { sitePhotoMarkerDivIconHtml } from "../utils/hotspotSitePhotoMapUi.js";
import {
  hotspotSitePhotoClusterKey,
  pickRepresentativeSitePhotoForCluster,
} from "../utils/hotspotSitePhotos.js";
import {
  buildHotspotZoneGallery,
  firstHotspotContainingLatLng,
  pickSlideDisplaySrc,
  primarySpotForSitePhoto,
} from "../utils/hotspotGallery.js";

const mapContainer = {
  height: "100%",
  width: "100%",
  minHeight: 0,
  position: "relative",
};

export default function WasteMap({
  bins,
  routeData,
  depots,
  selectedDepot,
  citizenReports = [],
  onLocationClick = () => {},
  /** Built-in + custom POI zones (+ severity from nearby telemetry). Omit to read merged list locally. */
  hotspotZones: hotspotZonesProp,
  /** Tourist POI zones (+ severity from nearby telemetry). */
  showWasteHotspots = true,
  /** Individual bin circle markers (off on route/hotspot maps by default). */
  showBins = false,
  /** Admin hotspot site uploads (estimated kg → pressure + floating thumbnails). */
  hotspotSitePhotos = [],
  /** GPS-linked AI observations (classification + coordinates). */
  showObservationHeat = true,
  /** Bin fill-density heat — only renders when {@link showBins} is true (dev overlays). */
  showBinDensityHeat = false,
}) {
  const [customHotspotRev, setCustomHotspotRev] = useState(0);
  const [hotspotSlideshow, setHotspotSlideshow] = useState(null);
  useEffect(() => {
    const bump = () => setCustomHotspotRev((n) => n + 1);
    window.addEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
    return () => window.removeEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
  }, []);

  const fallbackHotspotZones = useMemo(() => getMergedWasteHotspots(), [customHotspotRev]);
  const hotspotZones = hotspotZonesProp ?? fallbackHotspotZones;

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const hotspotLayersRef = useRef([]);
  const routeRef = useRef(null);
  const routeMarkersRef = useRef([]);
  const blockedLayersRef = useRef([]);
  const depotMarkersRef = useRef([]);
  const truckMarkerRef = useRef(null);
  const truckAnimationRef = useRef(null);
  const reportMarkersRef = useRef([]);
  const visionHeatRef = useRef(null);
  const binDensityHeatRef = useRef(null);
  const sitePhotoMarkersRef = useRef([]);

  const mapGallerySnapRef = useRef({});
  mapGallerySnapRef.current = { hotspotZones, hotspotSitePhotos, citizenReports, bins };

  const galleryActionsRef = useRef({
    openZone: () => {},
    openSitePhoto: () => {},
    openFromReport: () => {},
  });

  galleryActionsRef.current.openZone = (spot, startKey) => {
    const { hotspotSitePhotos: photos, citizenReports: reports, bins: b } = mapGallerySnapRef.current;
    const items = buildHotspotZoneGallery(spot, photos, reports);
    if (!items.length) return;
    const pct = Math.round(computeHotspotGarbagePercent(spot, b, photos));
    let index = 0;
    if (startKey) {
      const j = items.findIndex((x) => x.key === startKey);
      if (j >= 0) index = j;
    }
    setHotspotSlideshow({ spotName: spot.name, zonePercent: pct, items, index });
  };

  galleryActionsRef.current.openSitePhoto = (photo) => {
    const { hotspotZones: zones } = mapGallerySnapRef.current;
    const spot = primarySpotForSitePhoto(photo, zones);
    if (spot) {
      galleryActionsRef.current.openZone(spot, `site:${photo.id}`);
      return;
    }
    const displaySrc = pickSlideDisplaySrc({
      thumbDataUrl: photo.thumbDataUrl,
      fullDataUrl: photo.fullDataUrl,
    });
    setHotspotSlideshow({
      spotName: "Hotspot imagery",
      zonePercent: null,
      items: [
        {
          key: `site:${photo.id}`,
          kind: "site",
          displaySrc,
          title: String(photo.modelLabel || "Site photo").trim() || "Site photo",
          detail: "Outside hotspot rings on this map — this image only.",
          createdAt: String(photo.createdAt || ""),
        },
      ],
      index: 0,
    });
  };

  galleryActionsRef.current.openFromReport = (report) => {
    const lat = Number(report?.location?.lat);
    const lng = Number(report?.location?.lng);
    const { hotspotZones: zones } = mapGallerySnapRef.current;
    const spot = firstHotspotContainingLatLng(lat, lng, zones);
    if (spot) {
      galleryActionsRef.current.openZone(spot, `vision:${report.id}`);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const lat = Number(selectedDepot?.lat);
    const lng = Number(selectedDepot?.lng);
    const center =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? [lat, lng]
        : [25.2763, 91.8933]; /* Meghalaya centroid fallback */

    const map = L.map(el, {
      center,
      zoom: 10,
      minZoom: 9,
      maxBounds: [
        [25.0, 90.8],
        [26.2, 92.5],
      ],
    });

    mapRef.current = map;

    const postLayoutInvalidateIds = [];
    map.whenReady(() => {
      map.invalidateSize();
      postLayoutInvalidateIds.push(window.setTimeout(() => map.invalidateSize(), 80));
      postLayoutInvalidateIds.push(window.setTimeout(() => map.invalidateSize(), 320));
    });

    const onWinResize = () => map.invalidateSize();
    window.addEventListener("resize", onWinResize);

    new GeocoderControl({
      defaultMarkGeocode: false,
    })
      .on("markgeocode", (e) => {
        const bbox = e.geocode.bbox;
        const bounds = L.latLngBounds(bbox);
        map.fitBounds(bounds);
      })
      .addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    depotMarkersRef.current = depots.map((depot) => {
      const isSelected = depot.name === selectedDepot.name;
      const marker = L.marker([depot.lat, depot.lng], {
        icon: L.divIcon({
          className: "depot-marker",
          html: `<div style="background:${isSelected ? '#5c3cff' : '#888'};color:#fff;padding:8px 12px;border-radius:14px;box-shadow:0 0 18px rgba(92,60,255,0.35);font-weight:700;font-size:0.9rem;border:2px solid #fff;text-align:center;min-width:120px;">🏠 ${depot.name}</div>`,
        }),
      }).addTo(map);
      marker.bindPopup(`<b>${depot.name}</b><br>${depot.address}<br>Region: ${depot.region}`);
      return marker;
    });

    blockedLayersRef.current = blockedAreas.map((block) =>
      L.circle([block.lat, block.lng], {
        radius: block.radiusDeg * 111000,
        weight: 2,
        color: "#ff4d4d",
        fillColor: "#ff4d4d",
        fillOpacity: 0.16,
        dashArray: "8,8",
      }).addTo(map)
    );

    markersRef.current = [];

    map.on("click", (e) => {
      onLocationClick(e.latlng.lat, e.latlng.lng);
    });

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    const t = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      postLayoutInvalidateIds.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", onWinResize);
      ro.disconnect();
      cancelAnimationFrame(t);
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      routeRef.current = null;
      routeMarkersRef.current = [];
      blockedLayersRef.current = [];
      depotMarkersRef.current = [];
      reportMarkersRef.current.forEach((marker) => map.removeLayer(marker));
      reportMarkersRef.current = [];
      if (visionHeatRef.current) {
        map.removeLayer(visionHeatRef.current);
        visionHeatRef.current = null;
      }
      if (binDensityHeatRef.current) {
        map.removeLayer(binDensityHeatRef.current);
        binDensityHeatRef.current = null;
      }
      sitePhotoMarkersRef.current.forEach((marker) => map.removeLayer(marker));
      sitePhotoMarkersRef.current = [];
      if (truckAnimationRef.current) {
        window.clearInterval(truckAnimationRef.current);
        truckAnimationRef.current = null;
      }
      if (truckMarkerRef.current) {
        truckMarkerRef.current.remove();
        truckMarkerRef.current = null;
      }
    };
  }, [selectedDepot, depots]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    hotspotLayersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    hotspotLayersRef.current = [];

    if (showWasteHotspots) {
      hotspotLayersRef.current = hotspotZones.map((spot) => {
        const pct = computeHotspotGarbagePercent(spot, bins, hotspotSitePhotos);
        const layer = L.circle([spot.lat, spot.lng], {
          radius: spot.radiusM,
          ...hotspotCircleStyle(pct),
        }).addTo(map);
        layer.bindTooltip(`<strong>${String(spot.name)}</strong><br/><span style="font-size:11px">Click to open slideshow — every dataset + field AI photo in this zone.</span>`, {
          sticky: true,
          direction: "auto",
          opacity: 0.95,
          className: "hotspot-zone-slideshow-hint",
        });
        layer.bringToBack();
        return layer;
      });
    }

    return () => {
      hotspotLayersRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      hotspotLayersRef.current = [];
    };
    // `bins` omitted from deps — synced in the following effect so circles are not recreated each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // hotspotSitePhotos: circle colors refresh in sibling effect (`bins` + photos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWasteHotspots, selectedDepot, depots, hotspotZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showWasteHotspots) return;

    const layers = hotspotLayersRef.current;
    if (!layers.length || layers.length !== hotspotZones.length) return;

    hotspotZones.forEach((spot, i) => {
      const layer = layers[i];
      if (!layer) return;
      const pct = computeHotspotGarbagePercent(spot, bins, hotspotSitePhotos);
      layer.setStyle({ radius: spot.radiusM, ...hotspotCircleStyle(pct) });
    });
  }, [bins, showWasteHotspots, hotspotSitePhotos, hotspotZones, citizenReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showWasteHotspots) return;
    const layers = hotspotLayersRef.current;
    if (!layers.length || layers.length !== hotspotZones.length) return;
    const disposers = [];
    hotspotZones.forEach((spot, i) => {
      const layer = layers[i];
      if (!layer) return;
      const onClick = (ev) => {
        L.DomEvent.stopPropagation(ev);
        map.closePopup();
        galleryActionsRef.current.openZone(spot, null);
      };
      layer.on("click", onClick);
      disposers.push(() => {
        layer.off("click", onClick);
      });
    });
    return () => {
      disposers.forEach((d) => d());
    };
  }, [showWasteHotspots, hotspotZones]);

  useEffect(() => {
    if (!hotspotSlideshow) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setHotspotSlideshow(null);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        setHotspotSlideshow((g) => {
          if (!g?.items?.length) return g;
          const n = g.items.length;
          return { ...g, index: (g.index + delta + n * 10) % n };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotspotSlideshow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    if (!showBins) {
      map.invalidateSize();
      return;
    }

    markersRef.current = bins.map((bin) => {
      const marker = L.circleMarker([bin.lat, bin.lng], {
        color: bin.isOnline ? getColor(bin.fill) : "#666",
        radius: bin.isOnline ? 10 : 8,
        fillOpacity: bin.isOnline ? 0.8 : 0.4,
        weight: bin.isOnline ? 2 : 1,
      }).addTo(map);
      marker.bindPopup(popupHtml(bin));
      return marker;
    });

    map.invalidateSize();
  }, [bins, showBins, selectedDepot, depots]);

  useEffect(() => {
    const markers = markersRef.current;
    if (!showBins || !markers.length) return;
    bins.forEach((bin, i) => {
      const m = markers[i];
      if (m) {
        m.setStyle({
          color: bin.isOnline ? getColor(bin.fill) : "#666",
          radius: bin.isOnline ? 10 : 8,
          fillOpacity: bin.isOnline ? 0.8 : 0.4,
          weight: bin.isOnline ? 2 : 1,
        });
        m.setPopupContent(popupHtml(bin));
      }
    });
    mapRef.current?.invalidateSize();
  }, [bins, showBins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeRef.current) {
      map.removeLayer(routeRef.current);
      routeRef.current = null;
    }
    routeMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    routeMarkersRef.current = [];

    if (truckAnimationRef.current) {
      window.clearInterval(truckAnimationRef.current);
      truckAnimationRef.current = null;
    }
    if (truckMarkerRef.current) {
      truckMarkerRef.current.remove();
      truckMarkerRef.current = null;
    }

    if (!routeData || !routeData.coordinates || routeData.coordinates.length === 0) return;

    const routeCoords = routeData.coordinates.map(([lng, lat]) => [lat, lng]);

    routeRef.current = L.polyline(routeCoords, {
      color: "#7e4bff",
      weight: 5,
      opacity: 0.95,
    }).addTo(map);

    const routeWaypoints = Array.isArray(routeData.stops)
      ? routeData.stops.filter((wp) => {
          const lat = Number(wp?.lat);
          const lng = Number(wp?.lng);
          return Number.isFinite(lat) && Number.isFinite(lng);
        })
      : [];

    routeWaypoints.forEach((wp, index) => {
      const label = wp?.name ?? `Stop ${index + 1}`;
      const marker = L.circleMarker([wp.lat, wp.lng], {
        color: "#7e4bff",
        fillColor: "#d4c7ff",
        fillOpacity: 0.9,
        radius: 9,
        weight: 2,
      }).addTo(map);
      marker.bindTooltip(`${index + 1}. ${label}`, {
        permanent: true,
        direction: "top",
        className: "route-tooltip",
      });
      routeMarkersRef.current.push(marker);
    });

    const truckIcon = L.divIcon({
      className: "truck-marker",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#3fd3ff,#8d5fff);box-shadow:0 16px 30px rgba(0,0,0,0.28);color:#fff;font-size:1.2rem;">🚚</div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    truckMarkerRef.current = L.marker(routeCoords[0], {
      icon: truckIcon,
      zIndexOffset: 1000,
    }).addTo(map);

    let currentStep = 0;
    truckAnimationRef.current = window.setInterval(() => {
      currentStep += 1;
      if (currentStep >= routeCoords.length) {
        currentStep = 0;
      }
      truckMarkerRef.current?.setLatLng(routeCoords[currentStep]);
    }, 700);

    map.fitBounds(L.latLngBounds(routeCoords), {
      padding: [50, 50],
    });

    let delayInvalidateId;
    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize();
      delayInvalidateId = window.setTimeout(() => map.invalidateSize(), 50);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (delayInvalidateId !== undefined) window.clearTimeout(delayInvalidateId);
    };
  }, [routeData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    reportMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    reportMarkersRef.current = [];

    citizenReports.forEach((report) => {
      const lat = Number(report?.location?.lat);
      const lng = Number(report?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      const hasPhotoThumb =
        report.type === "Waste observation" && Boolean(safeFieldPhotoThumbUrl(report?.fieldPhoto?.thumbDataUrl));
      const iconSize = hasPhotoThumb ? [46, 46] : [40, 40];
      const iconAnchor = hasPhotoThumb ? [23, 23] : [20, 20];

      const icon = L.divIcon({
        className: "report-marker",
        html: reportMarkerDivIconHtml(report),
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: hasPhotoThumb ? 520 : 500,
      }).addTo(map);

      const visionSpot =
        report.type === "Waste observation" ? firstHotspotContainingLatLng(lat, lng, hotspotZones) : null;
      if (visionSpot) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          map.closePopup();
          galleryActionsRef.current.openFromReport(report);
        });
      } else {
        marker.bindPopup(reportPopupHtml(report));
      }

      reportMarkersRef.current.push(marker);
    });

    return undefined;
  }, [citizenReports, hotspotZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    sitePhotoMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    sitePhotoMarkersRef.current = [];

    const list = Array.isArray(hotspotSitePhotos) ? hotspotSitePhotos : [];
    const byCluster = new Map();
    for (const photo of list) {
      const lat = Number(photo?.lat);
      const lng = Number(photo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const k = hotspotSitePhotoClusterKey(photo);
      if (!byCluster.has(k)) byCluster.set(k, []);
      byCluster.get(k).push(photo);
    }

    for (const [clusterKey, cluster] of byCluster) {
      const photo = pickRepresentativeSitePhotoForCluster(cluster, clusterKey);
      if (!photo) continue;
      const lat = Number(photo.lat);
      const lng = Number(photo.lng);

      const hasThumb =
        typeof photo?.thumbDataUrl === "string" && Boolean(safeFieldPhotoThumbUrl(photo.thumbDataUrl));

      const icon = L.divIcon({
        className: "site-photo-marker",
        html: sitePhotoMarkerDivIconHtml(photo),
        iconSize: hasThumb ? [50, 50] : [46, 46],
        iconAnchor: hasThumb ? [25, 25] : [23, 23],
      });

      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: 640,
      }).addTo(map);

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        map.closePopup();
        if (cluster.length <= 1) {
          galleryActionsRef.current.openSitePhoto(photo);
          return;
        }
        const { hotspotZones: zones } = mapGallerySnapRef.current;
        const spot = primarySpotForSitePhoto(photo, zones);
        if (spot) {
          galleryActionsRef.current.openZone(spot, `site:${photo.id}`);
          return;
        }
        const items = cluster.map((p) => ({
          key: `site:${p.id}`,
          kind: "site",
          displaySrc: pickSlideDisplaySrc({
            thumbDataUrl: p.thumbDataUrl,
            fullDataUrl: p.fullDataUrl,
          }),
          title: String(p.modelLabel || "Site photo").trim() || "Site photo",
          detail: `Same map pin — ${cluster.length} images. Outside hotspot rings.`,
          createdAt: String(p.createdAt || ""),
        }));
        const j = items.findIndex((x) => x.key === `site:${photo.id}`);
        setHotspotSlideshow({
          spotName: "Hotspot imagery",
          zonePercent: null,
          items,
          index: j >= 0 ? j : 0,
        });
      });

      sitePhotoMarkersRef.current.push(marker);
    }

    return () => {
      sitePhotoMarkersRef.current.forEach((m) => map.removeLayer(m));
      sitePhotoMarkersRef.current = [];
    };
  }, [hotspotSitePhotos, hotspotZones, citizenReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof L.heatLayer !== "function") return;

    if (visionHeatRef.current) {
      map.removeLayer(visionHeatRef.current);
      visionHeatRef.current = null;
    }

    if (!showObservationHeat) return;

    const heatPts = visionReportsHeatPoints(citizenReports);
    if (!heatPts.length) return;

    const heat = L.heatLayer(heatPts, {
      radius: 42,
      blur: 28,
      maxZoom: 14,
      max: 1,
      minOpacity: 0.35,
      gradient: { 0.35: "#1e3a8a", 0.55: "#22c55e", 0.75: "#eab308", 1: "#dc2626" },
    });
    heat.addTo(map);
    visionHeatRef.current = heat;
    heat.bringToBack();

    return () => {
      if (visionHeatRef.current) {
        map.removeLayer(visionHeatRef.current);
        visionHeatRef.current = null;
      }
    };
  }, [citizenReports, showObservationHeat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof L.heatLayer !== "function") return;

    if (binDensityHeatRef.current) {
      map.removeLayer(binDensityHeatRef.current);
      binDensityHeatRef.current = null;
    }

    if (!showBins || !showBinDensityHeat) return;

    const pts = binFillHeatPoints(bins);
    if (!pts.length) return;

    const heat = L.heatLayer(pts, {
      radius: 36,
      blur: 22,
      maxZoom: 15,
      max: 0.85,
      minOpacity: 0.28,
      gradient: { 0.2: "#0c4a6e", 0.45: "#16a34a", 0.7: "#ca8a04", 1: "#b91c1c" },
    });
    heat.addTo(map);
    binDensityHeatRef.current = heat;
    heat.bringToBack();

    return () => {
      if (binDensityHeatRef.current) {
        map.removeLayer(binDensityHeatRef.current);
        binDensityHeatRef.current = null;
      }
    };
  }, [bins, showBinDensityHeat, showBins]);

  const slide = hotspotSlideshow?.items?.[hotspotSlideshow.index];
  const slideCount = hotspotSlideshow?.items?.length ?? 0;

  return (
    <>
      <div ref={containerRef} style={mapContainer} />
      {hotspotSlideshow && slideCount > 0 && slide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hotspot image slideshow"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            background: "rgba(2, 6, 23, 0.94)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            boxSizing: "border-box",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHotspotSlideshow(null);
          }}
        >
          <div
            style={{
              width: "min(1080px, 100%)",
              maxHeight: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: 16,
              padding: "14px 16px 16px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", lineHeight: 1.25 }}>
                  {hotspotSlideshow.spotName}
                </div>
                {hotspotSlideshow.zonePercent != null && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    Zone pressure {hotspotSlideshow.zonePercent}% · {slideCount} image{slideCount === 1 ? "" : "s"} (datasets + field AI)
                  </div>
                )}
                {hotspotSlideshow.zonePercent == null && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{slideCount} image{slideCount === 1 ? "" : "s"}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHotspotSlideshow(null)}
                style={{
                  flexShrink: 0,
                  border: "1px solid rgba(248, 250, 252, 0.25)",
                  background: "rgba(15, 23, 42, 0.9)",
                  color: "#e2e8f0",
                  borderRadius: 10,
                  padding: "6px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close · Esc
              </button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.35 }}>{slide.title}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{slide.detail}</div>

            <div
              style={{
                flex: 1,
                minHeight: 200,
                maxHeight: "min(62vh, 720px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#020617",
                borderRadius: 12,
                border: "1px solid rgba(51, 65, 85, 0.6)",
                overflow: "hidden",
              }}
            >
              {slide.displaySrc ? (
                <img
                  src={slide.displaySrc}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "min(62vh, 720px)", objectFit: "contain", display: "block" }}
                />
              ) : (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>
                  No browser-safe inline preview for this file (size or format). It is still counted in this zone —
                  try a JPEG/PNG/WebP export if you need a thumbnail here.
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  setHotspotSlideshow((g) => {
                    if (!g?.items?.length) return g;
                    const n = g.items.length;
                    return { ...g, index: (g.index - 1 + n) % n };
                  })
                }
                style={slideshowNavBtn}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 700, minWidth: 120, textAlign: "center" }}>
                {hotspotSlideshow.index + 1} / {slideCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setHotspotSlideshow((g) => {
                    if (!g?.items?.length) return g;
                    const n = g.items.length;
                    return { ...g, index: (g.index + 1) % n };
                  })
                }
                style={slideshowNavBtn}
              >
                Next →
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingBottom: 4,
                maxWidth: "100%",
              }}
            >
              {hotspotSlideshow.items.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setHotspotSlideshow((g) => (g ? { ...g, index: i } : g))}
                  title={it.title}
                  style={{
                    flex: "0 0 auto",
                    width: 56,
                    height: 56,
                    padding: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    border:
                      i === hotspotSlideshow.index
                        ? "2px solid #38bdf8"
                        : "2px solid rgba(51, 65, 85, 0.8)",
                    cursor: "pointer",
                    background: "#0f172a",
                  }}
                >
                  {it.displaySrc ? (
                    <img src={it.displaySrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ fontSize: 10, color: "#64748b", padding: 4, lineHeight: 1.1 }}>No preview</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const slideshowNavBtn = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(30, 41, 59, 0.95)",
  color: "#f1f5f9",
  borderRadius: 10,
  padding: "8px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};
