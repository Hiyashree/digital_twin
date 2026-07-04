import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DATASET_CATALOG_SEED, isFabricatedDatasetName } from "../data/datasetCatalogSeed.js";
import { appendHotspotDatasetFilesToSitePhotos } from "../utils/datasetHotspotMapImport.js";
import { removeHotspotSitePhotosBySourceDatasetId } from "../utils/hotspotSitePhotos.js";

const Ctx = createContext(null);
/** v3: legacy v2/v1 may contain removed demo rows — those names are stripped on load (never shown as official stats). */
const DATASET_CATALOG_KEY = "msw_dataset_catalog_v3";

/** Old demo catalog rows removed from seed — drop them when loading stored JSON. */
const DROPPED_LEGACY_IDS = new Set(["d6", "d7", "d8", "d9", "d10", "d11", "d12"]);

function normalizeCatalogArray(a) {
  if (!Array.isArray(a) || !a.length) return null;
  const rows = a
    .map((row) => normalizeRow(row))
    .filter((r) => !DROPPED_LEGACY_IDS.has(r.id))
    .filter((r) => !isFabricatedDatasetName(r.name));
  return rows.length ? rows : null;
}

function loadStoredCatalog() {
  try {
    if (typeof localStorage === "undefined") return null;
    const keys = [DATASET_CATALOG_KEY, "msw_dataset_catalog_v2", "msw_dataset_catalog_v1"];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = normalizeCatalogArray(JSON.parse(raw));
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseIntCommas(s) {
  return parseInt(String(s).replace(/,/g, ""), 10) || 0;
}

function parseGb(s) {
  const m = String(s).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Optional ML task description saved with each dataset (local catalog). */
function normalizeMlTaskSpec(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const inputs = String(raw.inputs ?? "").trim();
  const outputs = String(raw.outputs ?? "").trim();
  const characteristics = String(raw.characteristics ?? "").trim();
  if (!inputs && !outputs && !characteristics) return undefined;
  return { inputs, outputs, characteristics };
}

function normalizeRow(row) {
  const imagesNum = parseIntCommas(row.images);
  let labeledNum = parseIntCommas(row.labeled);
  labeledNum = Math.min(labeledNum, imagesNum);
  let sizeGb =
    typeof row.sizeGb === "number" && Number.isFinite(row.sizeGb) && row.sizeGb > 0
      ? row.sizeGb
      : parseGb(row.size);
  if ((!sizeGb || sizeGb <= 0) && imagesNum > 0) {
    sizeGb = 0.000001;
  }
  let status = row.status === "completed" || row.status === "processing" ? row.status : "completed";
  if (status === "processing" && imagesNum > 0) {
    status = "completed";
  }
  const mlTaskSpec = normalizeMlTaskSpec(row.mlTaskSpec);
  const out = {
    ...row,
    imagesNum,
    labeledNum,
    sizeGb,
    status,
  };
  if (mlTaskSpec) out.mlTaskSpec = mlTaskSpec;
  else delete out.mlTaskSpec;
  return out;
}

function aggregates(rows) {
  const totalImages = rows.reduce((s, r) => s + r.imagesNum, 0);
  const totalGb = rows.reduce((s, r) => s + r.sizeGb, 0);
  return { totalImages, totalGb, count: rows.length };
}

export function DatasetLibraryProvider({ children }) {
  const [datasets, setDatasets] = useState(() => {
    const loaded = loadStoredCatalog();
    return loaded && loaded.length ? loaded : DATASET_CATALOG_SEED.map(normalizeRow);
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [baselineSnap, setBaselineSnap] = useState(null);
  /** Opened from header “Add New Dataset” — actual import happens in Dataset Management modal. */
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    if (baselineSnap === null && datasets.length) {
      setBaselineSnap(aggregates(datasets));
    }
  }, [datasets, baselineSnap]);

  useEffect(() => {
    try {
      if (typeof localStorage === "undefined") return;
      const rows = datasets.map((d) => ({
        id: d.id,
        thumb: d.thumb,
        name: d.name,
        desc: d.desc,
        typeKey: d.typeKey,
        images: String(d.imagesNum),
        labeled: String(d.labeledNum),
        size: `${d.sizeGb.toFixed(2)} GB`,
        created: d.created,
        status: d.status,
        ...(d.hotspotName ? { hotspotName: d.hotspotName } : {}),
        ...(d.mlTaskSpec ? { mlTaskSpec: d.mlTaskSpec } : {}),
      }));
      localStorage.setItem(DATASET_CATALOG_KEY, JSON.stringify(rows));
    } catch {
      /* ignore quota */
    }
  }, [datasets]);

  const metrics = useMemo(() => {
    const a = aggregates(datasets);
    const base = baselineSnap;
    const imgDeltaPct =
      base && base.totalImages > 0 ? ((a.totalImages - base.totalImages) / base.totalImages) * 100 : 0;
    const gbDeltaPct = base && base.totalGb > 0 ? ((a.totalGb - base.totalGb) / base.totalGb) * 100 : 0;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const newThisMonth = datasets.filter((d) => {
      const parsed = Date.parse(d.created);
      if (Number.isNaN(parsed)) return false;
      const x = new Date(parsed);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}` === ym;
    }).length;

    return {
      ...a,
      imgDeltaPct,
      gbDeltaPct,
      newThisMonth,
    };
  }, [datasets, baselineSnap]);

  /**
   * Register a dataset from uploaded garbage/hotspot images for ML training & classification.
   * Hotspot imagery also writes thumbnails into `hotspotSitePhotos` so WasteMap / Hotspot Mapping show pins immediately.
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  const addDatasetFromImport = useCallback(async (payload) => {
    const name = String(payload?.name ?? "").trim();
    const desc = String(payload?.desc ?? "").trim();
    const rawType = payload?.typeKey;
    const typeKey =
      rawType === "recyclability" || rawType === "hotspot" || rawType === "custom" ? rawType : "waste";
    const hotspotName = String(payload?.hotspotName ?? "").trim();
    const files = Array.isArray(payload?.files) ? payload.files.filter((f) => f instanceof File) : [];
    const mlTaskSpec = normalizeMlTaskSpec(payload?.mlTaskSpec);

    if (!name) return { ok: false, error: "Enter a dataset name." };
    if (files.length === 0) return { ok: false, error: "Add at least one image (waste / hotspot photos)." };

    const imagesNum = files.length;
    const labeledNum = 0;
    let sizeBytes = 0;
    for (const f of files) sizeBytes += f.size || 0;
    const sizeGb = Math.max(0.001, sizeBytes / 1024 ** 3);

    const id = `d-${Date.now()}`;

    /** Official POI name when hotspot import pins thumbnails to the map */
    let mapSpotName = "";

    if (typeKey === "hotspot") {
      const mapRes = await appendHotspotDatasetFilesToSitePhotos({
        hotspotName,
        name,
        desc,
        files,
        sourceDatasetId: id,
      });
      if (!mapRes.ok) return mapRes;
      mapSpotName = mapRes.spotName || "";
    }

    const bits = [desc];
    const areaLabel = hotspotName || mapSpotName;
    if (areaLabel) bits.push(`Hotspot / area: ${areaLabel}`);
    if (typeKey === "hotspot" && mapSpotName) {
      bits.push(
        `${imagesNum} image(s) · on map at ${mapSpotName} · optional ViT / manual labels for training`
      );
    } else {
      bits.push(`${imagesNum} images · labeling & ViT training pending`);
    }

    const row = normalizeRow({
      id,
      thumb: typeKey === "hotspot" ? "📍" : "🖼️",
      name,
      desc: bits.filter(Boolean).join(" · "),
      typeKey,
      images: String(imagesNum),
      labeled: String(labeledNum),
      size: `${sizeGb.toFixed(2)} GB`,
      created: new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      status: "processing",
      hotspotName: hotspotName || undefined,
      ...(mlTaskSpec ? { mlTaskSpec } : {}),
    });

    setDatasets((prev) => [row, ...prev]);
    return { ok: true };
  }, []);

  const removeDataset = useCallback((id) => {
    removeHotspotSitePhotosBySourceDatasetId(id);
    setDatasets((prev) => prev.filter((d) => d.id !== id));
  }, []);

  /** Update catalog row — persisted with the rest of the library (no external API). */
  const updateDataset = useCallback((id, fields) => {
    setDatasets((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const imagesNum = Math.max(0, Math.floor(Number(fields.imagesNum ?? d.imagesNum) || 0));
        const labeledNum = Math.min(d.labeledNum, imagesNum);
        const sizeGb = Math.max(0.001, Number(fields.sizeGb ?? d.sizeGb) || 0.001);
        const typeKey =
          fields.typeKey === "recyclability" || fields.typeKey === "hotspot" || fields.typeKey === "custom"
            ? fields.typeKey
            : "waste";
        const status = fields.status === "completed" || fields.status === "processing" ? fields.status : d.status;
        const thumbRaw = String(fields.thumb ?? d.thumb ?? "📦").trim();
        const thumb = thumbRaw || "📦";
        let mlSlice = {};
        if (fields.mlTaskSpec !== undefined) {
          const spec = normalizeMlTaskSpec(fields.mlTaskSpec);
          if (spec) mlSlice = { mlTaskSpec: spec };
        } else if (d.mlTaskSpec) {
          mlSlice = { mlTaskSpec: d.mlTaskSpec };
        }
        return normalizeRow({
          id: d.id,
          thumb,
          name: String(fields.name ?? d.name).trim() || d.name,
          desc: fields.desc !== undefined ? String(fields.desc) : d.desc,
          typeKey,
          images: String(imagesNum),
          labeled: String(labeledNum),
          size: `${sizeGb.toFixed(2)} GB`,
          created: d.created,
          status,
          ...(d.hotspotName ? { hotspotName: d.hotspotName } : {}),
          ...mlSlice,
        });
      })
    );
  }, []);

  const value = useMemo(
    () => ({
      datasets,
      searchQuery,
      setSearchQuery,
      metrics,
      importModalOpen,
      setImportModalOpen,
      addDatasetFromImport,
      updateDataset,
      removeDataset,
    }),
    [datasets, searchQuery, metrics, importModalOpen, addDatasetFromImport, updateDataset, removeDataset]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDatasetLibrary() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDatasetLibrary must be used within DatasetLibraryProvider");
  return v;
}

export function useDatasetLibraryOptional() {
  return useContext(Ctx);
}
