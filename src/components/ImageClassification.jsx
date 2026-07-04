/**
 * Upload UI → classifyWasteFromPreview() posts to `/api/classify_waste` (research ViT + baselines via ml_server.py).
 *
 * Two government workflows:
 * (1) Training queue — confirm human labels for Meghalaya imagery → ViT training export.
 * (2) Field monitoring — attach GPS + AI result → Waste observation on the hotspot map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useImageClassificationSession } from "../context/ImageClassificationSessionContext.jsx";
import exifr from "exifr";
import { NavLink } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { portal as t } from "./portal/portalTheme.js";
import { recordClassification } from "../utils/classificationMetrics.js";
import { imageUrlToJpegDataUrl } from "../utils/imageThumb.js";
import { pushMlGallerySample, upsertMlGallerySampleByFileName } from "../utils/mlGalleryStorage.js";
import { classifyWasteFromPreview, postTrainingFeedback } from "../utils/wasteClassificationApi.js";
import {
  baselineDerivedSummary,
  displayCategory,
  displayConfidence,
  displayPredictedClass,
  displayWasteType,
  mergeGroundTruthLabelIntoResult,
  probBarsForChart,
} from "../utils/classificationDisplay.js";
import { pushTrainingSample, trainingSampleCount } from "../utils/trainingDatasetStorage.js";
import { getTrainingOverrideForPreview, saveTrainingOverride } from "../utils/trainingOverridesStorage.js";
import {
  CUSTOM_HOTSPOT_UI_SENTINEL,
  CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT,
  getMergedWasteHotspots,
  upsertCustomWasteHotspot,
} from "../utils/wasteHotspots.js";
import { estimateMassFromClassificationResult } from "../utils/hotspotSitePhotos.js";
import { appendWasteReportLedgerEntry, patchLatestLedgerEntryByFileName } from "../utils/wasteReportLedger.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

/** Ground-truth options for workflow (1). AI suggestion is shown separately. */
const TRAINING_LABELS = [
  "Plastic",
  "Paper / Cardboard",
  "Organic / Food waste",
  "Metal",
  "Glass",
  "Mixed / Other",
];

function mapPredictionToTrainingQuickPick(predictedClass) {
  const p = String(predictedClass || "").toLowerCase();
  if (!p.trim() || p.includes("non-waste")) return "";
  if (p.includes("organic") || p.includes("food") || p.includes("biological")) return "Organic / Food waste";
  if (p.includes("paper") || p.includes("cardboard")) return "Paper / Cardboard";
  if (p.includes("plastic")) return "Plastic";
  if (p.includes("metal") || p.includes("alumin")) return "Metal";
  if (p.includes("glass")) return "Glass";
  if (p.includes("mixed") || p.includes("trash") || p.includes("general waste")) return "Mixed / Other";
  const exact = TRAINING_LABELS.find((x) => x.toLowerCase() === p.trim());
  if (exact) return exact;
  return "Mixed / Other";
}

const cardBase = {
  background: t.card,
  border: `1px solid ${t.cardBorder}`,
  borderRadius: 16,
  overflow: "hidden",
};

export default function ImageClassification({
  reportingLocation = null,
  onConsumeReportingLocation,
  onVisionObservation,
  onAppendHotspotSitePhoto,
}) {
  const inputRef = useRef(null);
  const {
    preview,
    setPreview,
    fileName,
    setFileName,
    result,
    setResult,
    classifyBusy,
    setClassifyBusy,
    classifyError,
    setClassifyError,
    workflowMode,
    setWorkflowMode,
    humanLabel,
    setHumanLabel,
    manualLat,
    setManualLat,
    manualLng,
    setManualLng,
    workflowNote,
    setWorkflowNote,
    fieldLogBusy,
    setFieldLogBusy,
    hotspotPick,
    setHotspotPick,
    sitePhotoLat,
    setSitePhotoLat,
    sitePhotoLng,
    setSitePhotoLng,
    sitePhotoBusy,
    setSitePhotoBusy,
    sitePhotoNote,
    setSitePhotoNote,
  } = useImageClassificationSession();

  const [gpsFromExifHint, setGpsFromExifHint] = useState(null);
  const [hotspotListRev, setHotspotListRev] = useState(0);
  const [fieldObsHotspotName, setFieldObsHotspotName] = useState("");
  const [customNewHotspotName, setCustomNewHotspotName] = useState("");
  const [customNewHotspotRadius, setCustomNewHotspotRadius] = useState("600");

  useEffect(() => {
    const bump = () => setHotspotListRev((n) => n + 1);
    window.addEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
    return () => window.removeEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
  }, []);

  const hotspotZoneOptions = useMemo(() => getMergedWasteHotspots(), [hotspotListRev]);

  const revokeBlobPreview = useCallback(() => {
    if (isBlobUrl(preview)) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!preview || !String(preview).startsWith("blob:")) {
      setGpsFromExifHint(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fetch(preview).then((r) => r.blob());
        const gps = await exifr.gps(blob);
        if (cancelled || !gps) return;
        const lat = Number(gps.latitude);
        const lng = Number(gps.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setGpsFromExifHint({ lat, lng });
        } else {
          setGpsFromExifHint(null);
        }
      } catch {
        if (!cancelled) setGpsFromExifHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const onFile = (fileList) => {
    const file = fileList?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    revokeBlobPreview();
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setResult(null);
    setClassifyError(null);
    setHumanLabel("");
    setWorkflowNote("");
  };

  const clearImage = () => {
    revokeBlobPreview();
    setPreview(null);
    setFileName("");
    setResult(null);
    setClassifyError(null);
    setHumanLabel("");
    setWorkflowNote("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const classify = async () => {
    if (!preview || classifyBusy) return;
    setClassifyBusy(true);
    setClassifyError(null);
    try {
      let rest;
      try {
        rest = await classifyWasteFromPreview(preview);
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        setClassifyError(msg);
        setResult(null);
        return;
      }

      const { override } = await getTrainingOverrideForPreview(preview);
      let effective = rest;
      if (override?.humanLabel?.trim()) {
        effective = mergeGroundTruthLabelIntoResult(rest, override.humanLabel.trim());
      }

      setResult(effective);
      let mappedQuick;
      if (override?.humanLabel?.trim()) {
        mappedQuick = override.humanLabel.trim();
      } else if (effective.organicReviewRecommended) {
        mappedQuick = "Organic / Food waste";
      } else if (effective.organicVisualOverride && /\borganic\b/i.test(String(displayPredictedClass(effective) ?? ""))) {
        mappedQuick = "Organic / Food waste";
      } else {
        mappedQuick = mapPredictionToTrainingQuickPick(displayPredictedClass(effective));
      }
      setHumanLabel(mappedQuick);
      recordClassification({
        recyclable: displayCategory(effective) === "Recyclable",
        confidence: displayConfidence(effective),
        predictedClass: displayPredictedClass(effective),
        wasteType: displayWasteType(effective),
        omitFromKpi: Boolean(effective.nonWasteDetected),
      });
      if (!effective.nonWasteDetected) {
        const { estimatedKg, estimatedVolumeL } = estimateMassFromClassificationResult(effective);
        const latGuess =
          reportingLocation != null && reportingLocation.lat != null
            ? Number(reportingLocation.lat)
            : parseFloat(String(manualLat).replace(",", "."));
        const lngGuess =
          reportingLocation != null && reportingLocation.lng != null
            ? Number(reportingLocation.lng)
            : parseFloat(String(manualLng).replace(",", "."));
        const hasLoc =
          Number.isFinite(latGuess) &&
          Number.isFinite(lngGuess) &&
          latGuess >= -90 &&
          latGuess <= 90 &&
          lngGuess >= -180 &&
          lngGuess <= 180;
        appendWasteReportLedgerEntry({
          fileName: fileName || "",
          predictedClass: displayPredictedClass(effective),
          wasteType: displayWasteType(effective),
          recyclable: displayCategory(effective) === "Recyclable",
          confidence: displayConfidence(effective),
          estimatedKg,
          estimatedVolumeL,
          lat: hasLoc ? latGuess : undefined,
          lng: hasLoc ? lngGuess : undefined,
          source: "classify",
        });
      }
      try {
        if (!effective.nonWasteDetected) {
          const thumbDataUrl = await imageUrlToJpegDataUrl(preview, 168, 0.72);
          pushMlGallerySample({
            thumbDataUrl,
            recyclable: displayCategory(effective) === "Recyclable",
            confidence: displayConfidence(effective),
            predictedClass: displayPredictedClass(effective),
            fileName,
          });
        }
      } catch {
        /* optional thumb */
      }
    } catch {
      setResult(null);
    } finally {
      setClassifyBusy(false);
    }
  };

  const saveToTrainingQueue = useCallback(async () => {
    if (!preview || !result || !humanLabel.trim()) {
      setWorkflowNote("Pick a human label that matches the waste in the photo.");
      return;
    }
    try {
      const thumbDataUrl = await imageUrlToJpegDataUrl(preview, 320, 0.82);
      const beforeMerge = result;
      const aiGuess =
        String(beforeMerge.modelOriginalPrediction || "").trim() ||
        String(beforeMerge.predictedClass || "").trim() ||
        displayPredictedClass(beforeMerge);
      await saveTrainingOverride(preview, {
        humanLabel: humanLabel.trim(),
        aiPredictedClass: aiGuess,
      });
      const merged = mergeGroundTruthLabelIntoResult(beforeMerge, humanLabel.trim());
      const kpiBump =
        beforeMerge.headlineSource !== "ground_truth" ||
        String(beforeMerge.groundTruthLabel || "").trim() !== String(humanLabel.trim()).trim();
      setResult(merged);
      pushTrainingSample({
        thumbDataUrl,
        fileName,
        humanLabel: humanLabel.trim(),
        aiPredictedClass: aiGuess,
        aiCategory: displayCategory(beforeMerge),
        aiConfidence: displayConfidence(beforeMerge),
        notes: "Meghalaya field imagery — ViT training candidate",
      });
      if (kpiBump) {
        recordClassification({
          recyclable: displayCategory(merged) === "Recyclable",
          confidence: displayConfidence(merged),
          predictedClass: displayPredictedClass(merged),
          wasteType: displayWasteType(merged),
          omitFromKpi: Boolean(merged.nonWasteDetected),
        });
      }
      try {
        if (!merged.nonWasteDetected) {
          const thumbGallery = await imageUrlToJpegDataUrl(preview, 168, 0.72);
          upsertMlGallerySampleByFileName({
            thumbDataUrl: thumbGallery,
            recyclable: displayCategory(merged) === "Recyclable",
            confidence: displayConfidence(merged),
            predictedClass: displayPredictedClass(merged),
            fileName,
          });
        }
      } catch {
        /* optional thumb */
      }
      if (!merged.nonWasteDetected && String(fileName || "").trim()) {
        const { estimatedKg, estimatedVolumeL } = estimateMassFromClassificationResult(merged);
        patchLatestLedgerEntryByFileName(fileName, {
          predictedClass: displayPredictedClass(merged),
          wasteType: displayWasteType(merged),
          recyclable: displayCategory(merged) === "Recyclable",
          confidence: displayConfidence(merged),
          estimatedKg,
          estimatedVolumeL,
        });
      }
      const feedback = await postTrainingFeedback(preview, humanLabel.trim());
      const total = trainingSampleCount();
      let diskHint = "";
      if (feedback?.ok && feedback?.stored_dataset && feedback?.dataset_relative) {
        diskHint = ` Also copied to dataset/${feedback.dataset_relative} for train_waste_vit.py.`;
      } else if (feedback?.ok === false && feedback?.message === "network_error") {
        diskHint =
          " ML server unreachable — only the browser queue was updated; run npm run dev:api (ml_server.py) and save again to write dataset/ files.";
      } else if (feedback?.ok && feedback?.stored === false && typeof feedback?.message === "string") {
        diskHint = ` (${feedback.message.slice(0, 140)})`;
      }
      setWorkflowNote(
        `Saved (${total} in queue).${diskHint} Re-classifying this same file will use your label; run training to update model weights.`
      );
    } catch {
      setWorkflowNote("Could not save (storage full). Clear gallery or use a smaller image.");
    }
  }, [preview, result, humanLabel, fileName]);

  /**
   * Field monitoring (②): persist exact WGS84 numbers + a JPEG data URL for the map popup (same payload as POST /reports).
   * Primary path: map click on /dashboard/field sets `reportingLocation`; manual lat/lng is the fallback.
   */
  const submitFieldObservation = useCallback(async () => {
    if (!result || fieldLogBusy) return;
    const lat =
      reportingLocation != null && reportingLocation.lat != null
        ? Number(reportingLocation.lat)
        : parseFloat(String(manualLat).replace(",", "."));
    const lng =
      reportingLocation != null && reportingLocation.lng != null
        ? Number(reportingLocation.lng)
        : parseFloat(String(manualLng).replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setWorkflowNote("GPS required: click the map on Field monitoring / Hotspots, or type lat/lng below.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setWorkflowNote("Coordinates out of range: latitude −90…90°, longitude −180…180° (WGS84).");
      return;
    }
    setWorkflowNote("");
    let fieldPhoto;
    if (preview) {
      try {
        const thumbDataUrl = await imageUrlToJpegDataUrl(preview, 128, 0.7);
        fieldPhoto = { thumbDataUrl, fileName: fileName || "" };
      } catch {
        /* Map marker still works from vision metadata; user sees missing thumb in popup only. */
      }
    }
    setFieldLogBusy(true);
    try {
      await onVisionObservation?.({
        location: { lat, lng },
        vision: {
          predictedClass: displayPredictedClass(result),
          category: displayCategory(result),
          confidence: displayConfidence(result),
          model: result.model,
          recyclable: displayCategory(result) === "Recyclable" ? "Yes" : "No",
          wasteType: displayWasteType(result),
        },
        fieldPhoto,
        ...(fieldObsHotspotName.trim() ? { siteName: fieldObsHotspotName.trim() } : {}),
      });
    } catch (e) {
      setWorkflowNote(e instanceof Error ? e.message : "Could not log observation.");
    } finally {
      setFieldLogBusy(false);
    }
  }, [result, reportingLocation, manualLat, manualLng, onVisionObservation, preview, fileName, fieldLogBusy, fieldObsHotspotName]);

  const analyzeAndPinSitePhoto = useCallback(async () => {
    if (!onAppendHotspotSitePhoto || sitePhotoBusy) return;
    if (!preview) {
      setSitePhotoNote("Choose an image first (upload panel above).");
      return;
    }

    const isNewPlace = hotspotPick === CUSTOM_HOTSPOT_UI_SENTINEL;
    const merged = getMergedWasteHotspots();

    let spotMeta = null;
    if (!isNewPlace) {
      spotMeta = merged.find((s) => s.name === hotspotPick) || null;
      if (!hotspotPick || !spotMeta) {
        setSitePhotoNote("Select a hotspot POI from the list.");
        return;
      }
    } else {
      const placeName = String(customNewHotspotName || "").trim();
      if (!placeName) {
        setSitePhotoNote("Enter a place name for the new hotspot.");
        return;
      }
    }

    const manualLatN = parseFloat(String(sitePhotoLat).replace(",", "."));
    const manualLngN = parseFloat(String(sitePhotoLng).replace(",", "."));
    const hasManual = Number.isFinite(manualLatN) && Number.isFinite(manualLngN);

    let lat;
    let lng;
    if (hasManual) {
      lat = manualLatN;
      lng = manualLngN;
    } else if (reportingLocation?.lat != null && reportingLocation?.lng != null) {
      lat = Number(reportingLocation.lat);
      lng = Number(reportingLocation.lng);
    } else if (gpsFromExifHint) {
      lat = gpsFromExifHint.lat;
      lng = gpsFromExifHint.lng;
    } else if (spotMeta) {
      lat = spotMeta.lat;
      lng = spotMeta.lng;
    } else {
      lat = NaN;
      lng = NaN;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setSitePhotoNote(
        isNewPlace
          ? "Enter latitude and longitude (override fields), or set a map pin / EXIF GPS for the new place."
          : "Invalid coordinates — check optional lat/lng, map pin, or EXIF."
      );
      return;
    }

    let finalHotspotId = spotMeta ? spotMeta.name : String(customNewHotspotName || "").trim();
    if (isNewPlace) {
      const rStr = String(customNewHotspotRadius || "600").trim();
      const radiusParsed = Math.max(120, Math.min(5000, parseInt(rStr, 10) || 600));
      const { spot } = upsertCustomWasteHotspot({
        name: customNewHotspotName,
        lat,
        lng,
        radiusM: radiusParsed,
      });
      if (!spot) {
        setSitePhotoNote("Could not save this hotspot — check name and coordinates.");
        return;
      }
      finalHotspotId = spot.name;
    }

    setSitePhotoBusy(true);
    setSitePhotoNote("");
    try {
      const hadClassifierResult = Boolean(result);
      let classResult = result;
      if (!classResult) {
        classResult = await classifyWasteFromPreview(preview);
        setResult(classResult);
      }
      const { estimatedKg, estimatedVolumeL } = estimateMassFromClassificationResult(classResult);
      const thumbDataUrl = await imageUrlToJpegDataUrl(preview, 128, 0.72);
      let fullDataUrl;
      try {
        fullDataUrl = await imageUrlToJpegDataUrl(preview, 520, 0.82);
      } catch {
        fullDataUrl = undefined;
      }

      onAppendHotspotSitePhoto({
        hotspotId: finalHotspotId,
        lat,
        lng,
        thumbDataUrl,
        fullDataUrl,
        estimatedKg,
        estimatedVolumeL,
        classificationAnalyzed: true,
        modelLabel: displayPredictedClass(classResult),
        confidencePct: displayConfidence(classResult),
      });
      if (!hadClassifierResult && classResult && !classResult.nonWasteDetected) {
        appendWasteReportLedgerEntry({
          fileName: fileName || `Hotspot: ${finalHotspotId}`,
          predictedClass: displayPredictedClass(classResult),
          wasteType: displayWasteType(classResult),
          recyclable: displayCategory(classResult) === "Recyclable",
          confidence: displayConfidence(classResult),
          estimatedKg,
          estimatedVolumeL,
          lat,
          lng,
          source: "site_photo",
        });
      }
      if (isNewPlace) setHotspotPick(finalHotspotId);
      setSitePhotoNote("Saved — floating marker on Home / Field map; hotspot ring uses photo-based pressure boost.");
    } catch (e) {
      setSitePhotoNote(e instanceof Error ? e.message : "Could not save site photo.");
    } finally {
      setSitePhotoBusy(false);
    }
  }, [
    customNewHotspotName,
    customNewHotspotRadius,
    gpsFromExifHint,
    hotspotPick,
    onAppendHotspotSitePhoto,
    preview,
    reportingLocation,
    result,
    setHotspotPick,
    sitePhotoBusy,
    sitePhotoLat,
    sitePhotoLng,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      <div
        style={{
          margin: 0,
          padding: "14px 16px",
          borderRadius: 14,
          border: `1px solid ${t.cardBorder}`,
          background: t.card,
          maxWidth: 960,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>Workflow</span>
          {[
            ["training", "① Training labels"],
            ["monitoring", "② Field monitoring + map"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setWorkflowMode(key);
                setWorkflowNote("");
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: workflowMode === key ? `1px solid rgba(${t.accentRgb}, 0.65)` : `1px solid ${t.cardBorder}`,
                background: workflowMode === key ? `rgba(${t.accentRgb}, 0.16)` : "rgba(255,255,255,0.05)",
                color: workflowMode === key ? t.accent : t.textMuted,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {classifyError ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(234,179,8,0.45)",
            background: "rgba(234,179,8,0.1)",
            fontSize: 12,
            color: t.textMuted,
            lineHeight: 1.55,
            maxWidth: 920,
          }}
        >
          <strong style={{ color: "#fcd34d" }}>API note:</strong> {classifyError}
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* Upload */}
        <div style={{ ...cardBase, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Upload Waste Image</h3>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onFile(e.target.files)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              flex: 1,
              minHeight: 180,
              borderRadius: 14,
              border: `2px dashed ${t.accentMuted}`,
              background: `rgba(${t.accentRgb}, 0.08)`,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: t.textMuted,
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 36 }}>☁️</span>
            <span>Drag & drop or browse</span>
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: `linear-gradient(135deg, ${t.accent}, #9333ea)`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Browse Image
          </button>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
            <strong style={{ color: t.text }}>Tips:</strong> use good lighting, center the object, avoid heavy blur.
          </div>
        </div>

        {/* Preview */}
        <div style={{ ...cardBase, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Image Preview</h3>
            {preview && (
              <button
                type="button"
                onClick={clearImage}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(255,255,255,0.06)",
                  color: t.text,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Clear Image
              </button>
            )}
          </div>
          <div
            style={{
              flex: 1,
              borderRadius: 12,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              minHeight: 200,
            }}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }} />
            ) : (
              <span style={{ color: t.textMuted, fontSize: 13 }}>No image selected</span>
            )}
          </div>
          <button
            type="button"
            onClick={classify}
            disabled={!preview || classifyBusy}
            style={{
              padding: "14px 20px",
              borderRadius: 14,
              border: "none",
              background: preview && !classifyBusy ? `linear-gradient(135deg, ${t.accent}, #9333ea)` : "rgba(255,255,255,0.1)",
              color: preview && !classifyBusy ? "#fff" : t.textMuted,
              fontWeight: 800,
              fontSize: 15,
              cursor: preview && !classifyBusy ? "pointer" : "not-allowed",
            }}
          >
            {classifyBusy
              ? "Running model (CPU can take 1–4 min on first run)…"
              : "Classify Waste"}
          </button>
          {fileName ? <div style={{ fontSize: 11, color: t.textMuted }}>{fileName}</div> : null}
        </div>

        {/* Result */}
        <div style={{ ...cardBase, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Classification Result</h3>
          {!result ? (
            <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>Run classification to see predicted class and confidence.</p>
          ) : (
            (() => {
              const derived = baselineDerivedSummary(result);
              const confPct = displayConfidence(result);
              const predictedTitle = displayPredictedClass(result);
              const categoryForBadge = derived?.categoryLabel ?? displayCategory(result);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 28 }}>♻</span>
                    <div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>Predicted Class</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: t.accent }}>{predictedTitle}</div>
                      {!derived && result.secondaryMaterialLabel ? (() => {
                        // When the headline is "Mixed Waste" the pile is heterogeneous and the
                        // strongest pixel cue is the operator's best clue about what to sort
                        // first → show it as "Most probable second option: <X>".
                        // When the headline IS a specific material, the chip is just a runner-up
                        // hint → keep it as "Secondary material: <X>".
                        const headlineIsMixed = String(predictedTitle || "")
                          .toLowerCase()
                          .includes("mixed");
                        const labelPrefix = headlineIsMixed
                          ? "Most probable second option"
                          : "Secondary material";
                        return (
                          <div
                            style={{
                              marginTop: 6,
                              display: "inline-block",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#fcd34d",
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: "rgba(234,179,8,0.12)",
                              border: "1px solid rgba(234,179,8,0.35)",
                            }}
                            title={
                              result.secondaryMaterialCue != null
                                ? `Pixel cue ${result.secondaryMaterialCue.toFixed(2)}`
                                : undefined
                            }
                          >
                            {labelPrefix}: {result.secondaryMaterialLabel}
                            {result.secondaryMaterialCue != null
                              ? ` · cue ${result.secondaryMaterialCue.toFixed(2)}`
                              : ""}
                          </div>
                        );
                      })() : null}
                      {!derived && result.organicVisualOverride ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#5eead4",
                            padding: "6px 10px",
                            borderRadius: 8,
                            background: "rgba(45,212,191,0.12)",
                            border: "1px solid rgba(45,212,191,0.35)",
                            maxWidth: 320,
                            lineHeight: 1.45,
                          }}
                        >
                          Peel / produce colour check raised Organic (cue {result.organicVisualCue != null ? result.organicVisualCue.toFixed(2) : "—"}) — TrashNet-style heads often misread banana peels as paper; see caveat below and fine-tune on{" "}
                          <code style={{ fontSize: 10 }}>dataset/organic/</code> for rigorous results.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background:
                          categoryForBadge === "Recyclable"
                            ? "rgba(92, 184, 92, 0.2)"
                            : categoryForBadge === "Not classified as litter"
                              ? "rgba(148, 163, 184, 0.22)"
                              : "rgba(234, 179, 8, 0.22)",
                        color:
                          categoryForBadge === "Recyclable" ? t.green : categoryForBadge === "Not classified as litter" ? "#94a3b8" : "#eab308",
                      }}
                    >
                      {categoryForBadge}
                    </span>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: t.textMuted }}>Confidence</span>
                      <strong>{confPct}%</strong>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${confPct}%`, height: "100%", background: `linear-gradient(90deg, ${t.accentSecondary}, ${t.accent})` }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    Analyzer: <strong style={{ color: t.text }}>{result.model}</strong>
                  </div>
                  {result.nonWasteDetected ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(248,113,113,0.45)",
                        background: "rgba(248,113,113,0.08)",
                        fontSize: 12,
                        color: "#fecaca",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: "#f87171" }}>Safeguard:</strong> {result.safeguardMessage || "This frame was treated as non-litter for headline metrics."}
                    </div>
                  ) : null}
                  {derived ? (
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.45, marginTop: 8 }}>
                      {result.headlineSource === "ground_truth" ? (
                        <>
                          Headline, confidence, bins, and Research JSON reflect your{" "}
                          <strong style={{ color: t.text }}>saved ground-truth</strong> for this file (100% in one bin).
                        </>
                      ) : (
                        <>
                          Headline, confidence, and bins above follow{" "}
                          <code style={{ fontSize: 10 }}>classification_debug</code> (full API debug JSON below).
                        </>
                      )}
                    </div>
                  ) : result.caveat ? (
                    <div style={{ fontSize: 11, color: "#fcd34d", lineHeight: 1.45, marginTop: 8 }}>
                      {result.caveat}
                    </div>
                  ) : null}
                  {!derived && result.organicReviewRecommended ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(45,212,191,0.45)",
                        background: "rgba(45,212,191,0.12)",
                        fontSize: 12,
                        color: "#ccfbf1",
                        lineHeight: 1.45,
                      }}
                    >
                      <strong style={{ color: "#5eead4" }}>Suggested next step:</strong> if this is unpackaged fruit or food,
                      set Quick category to <strong>Organic / Food waste</strong> and save to the training queue — the top prediction is only a
                      material-class guess ({confPct}% confidence).
                    </div>
                  ) : null}
                </>
              );
            })()
          )}
        </div>
      </div>

      {result &&
        (() => {
          const dsum = baselineDerivedSummary(result);
          return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Waste Details</h3>
            <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 13 }}>
              {[
                ["Waste Type", dsum?.wasteTypeShort ?? result.wasteType],
                ["Material", result.material],
                [
                  "Recyclable",
                  dsum ? (dsum.categoryLabel === "Recyclable" ? "Yes" : "No") : result.recyclable,
                  t.green,
                ],
                ["Decomposition Time", result.decomposition],
                ["Environmental Impact", result.impact, result.impactTone === "bad" ? t.red : result.impactTone === "med" ? "#fcd34d" : t.text],
                ["Proper Disposal", result.disposal],
              ].map(([k, v, col]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${t.cardBorder}`, paddingBottom: 8 }}>
                  <dt style={{ color: t.textMuted, margin: 0 }}>{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, color: col || t.text }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div style={{ ...cardBase, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Classification Probabilities</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {probBarsForChart(result).length ? (
                probBarsForChart(result).map((row) => (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span>{row.label}</span>
                      <span style={{ fontWeight: 700, color: t.accent }}>{row.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ width: `${Math.min(100, row.pct)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${t.accentSecondary}, ${t.accent})` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>Headline abstention — view provisional hypothesis in the archived fields or classifier snapshot when present.</p>
              )}
            </div>
            {probBarsForChart(result).length ? (
              <div style={{ marginTop: 18, height: 220 }}>
                <Bar
                  data={{
                    labels: probBarsForChart(result).map((r) => r.label),
                    datasets: [
                      {
                        label:
                          result.headlineSource === "ground_truth"
                            ? "Waste bin (% · saved ground-truth, matches headline & JSON)"
                            : "Waste bin probabilities (% · ViT softmax, six-bin mapping)",
                        data: probBarsForChart(result).map((r) => r.pct),
                        backgroundColor: `rgba(${t.accentRgb}, 0.45)`,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: { ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0 } },
                      y: { min: 0, max: 100, ticks: { color: "#94a3b8" } },
                    },
                    plugins: { legend: { labels: { color: "#cbd5e1" } } },
                  }}
                />
              </div>
            ) : null}
          </div>
          {result.classificationDebug ? (
            <div style={{ ...cardBase, padding: 20 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>
                {result.headlineSource === "ground_truth"
                  ? "Classifier API debug (JSON) — aligned with saved ground-truth"
                  : "Classifier API debug (JSON)"}
              </h3>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textMuted, lineHeight: 1.45 }}>
                Includes <code style={{ fontSize: 10 }}>waste_classifier_snapshot</code>, safeguards, and legacy fields if the server still sends them.
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.35)",
                  fontSize: 11,
                  color: "#cbd5e1",
                  overflow: "auto",
                  maxHeight: 320,
                  lineHeight: 1.4,
                  border: `1px solid ${t.cardBorder}`,
                }}
              >
                {JSON.stringify(result.classificationDebug, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
          );
        })()}

      {result ? (
        <div style={{ ...cardBase, padding: 20, maxWidth: 960 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>
            {workflowMode === "training" ? "① Dataset / training queue" : "② Field observation → Meghalaya map"}
          </h3>
          {workflowMode === "training" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
                Confirm the <strong style={{ color: t.text }}>ground-truth label</strong> for this capture (plastic, organic, recyclability context).
                The browser queue still holds a thumbnail for export; with <strong style={{ color: t.text }}>ml_server.py</strong> running, the photo is also
                saved under <code style={{ fontSize: 11 }}>dataset/&lt;class&gt;/</code> for <code style={{ fontSize: 11 }}>train_waste_vit.py</code>.
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#fcd34d", lineHeight: 1.5 }}>
                <strong style={{ color: t.text }}>Note:</strong> after you save, <strong>the same image file</strong> is remembered in this browser — the
                next Classify shows your ground truth. A copy plus audit trail goes to <code style={{ fontSize: 11 }}>training_feedback/</code>; model weights in{" "}
                <code style={{ fontSize: 11 }}>.env</code> update only after you run training.
              </p>
              <label style={{ fontSize: 12, color: t.textMuted }}>
                Quick category
                <select
                  value={TRAINING_LABELS.includes(humanLabel) ? humanLabel : ""}
                  onChange={(e) => setHumanLabel(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.cardBorder}`,
                    background: "rgba(0,0,0,0.35)",
                    color: t.text,
                    fontSize: 14,
                  }}
                >
                  <option value="">Choose…</option>
                  {TRAINING_LABELS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: t.textMuted }}>
                Ground-truth label (editable)
                <input
                  type="text"
                  placeholder="e.g. PET bottle, food-soiled paper…"
                  value={humanLabel}
                  onChange={(e) => setHumanLabel(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.cardBorder}`,
                    background: "rgba(0,0,0,0.35)",
                    color: t.text,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveToTrainingQueue()}
                style={{
                  justifySelf: "start",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: `linear-gradient(135deg, ${t.accent}, #9333ea)`,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Save to training queue
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
                Attach the classified waste to a <strong style={{ color: t.text }}>GPS point</strong>. Open{" "}
                <NavLink to="/dashboard/field" style={{ color: t.accent, fontWeight: 700 }}>
                  Field monitoring
                </NavLink>{" "}
                and click the map to drop a pin, then return here — or enter decimal degrees manually (WGS84).
              </p>
              {reportingLocation ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(92,184,92,0.12)",
                    border: "1px solid rgba(92,184,92,0.35)",
                    fontSize: 13,
                    color: t.text,
                  }}
                >
                  Using map pin (full precision stored):{" "}
                  <strong>
                    {Number(reportingLocation.lat)}, {Number(reportingLocation.lng)}
                  </strong>
                  <button
                    type="button"
                    onClick={() => onConsumeReportingLocation?.()}
                    style={{
                      marginLeft: 12,
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.25)",
                      color: t.textMuted,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Clear pin
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Latitude (e.g. 25.5788)"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    style={{
                      flex: "1 1 140px",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.35)",
                      color: t.text,
                      fontSize: 14,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Longitude (e.g. 91.8933)"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    style={{
                      flex: "1 1 140px",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.35)",
                      color: t.text,
                      fontSize: 14,
                    }}
                  />
                </div>
              )}
              <input
                type="text"
                placeholder="New hotspot name (optional — creates a named pin)"
                value={fieldObsHotspotName}
                onChange={(e) => setFieldObsHotspotName(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 14,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => void submitFieldObservation()}
                disabled={fieldLogBusy}
                style={{
                  justifySelf: "start",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: `linear-gradient(135deg, ${t.accent}, #9333ea)`,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: fieldLogBusy ? "wait" : "pointer",
                  opacity: fieldLogBusy ? 0.75 : 1,
                }}
              >
                {fieldLogBusy ? "Logging observation…" : "Log waste observation on hotspot map"}
              </button>
            </div>
          )}
          {workflowNote ? (
            <p style={{ margin: "12px 0 0", fontSize: 12, color: "#86efac", lineHeight: 1.45 }}>
              {workflowNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {onAppendHotspotSitePhoto ? (
        <div style={{ ...cardBase, padding: 20, maxWidth: 960 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>Hotspot site photo (admin)</h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
            Tie ground-truth imagery to a named site: run the same classify API, estimate rough kg from label + confidence, and push a thumbnail marker to{" "}
            <NavLink to="/dashboard/home" style={{ color: t.accent, fontWeight: 700 }}>
              Home
            </NavLink>{" "}
            /
            <NavLink to="/dashboard/field" style={{ color: t.accent, fontWeight: 700 }}>
              Field map
            </NavLink>
            . Pick an existing zone, or <strong style={{ color: t.text }}>+ New place</strong> to save name + coordinates (creates a map circle if the place is new). Coordinates: override fields → map pin → EXIF → POI center.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
            <label style={{ fontSize: 12, color: t.textMuted }}>
              Hotspot POI
              <select
                value={hotspotPick}
                onChange={(e) => setHotspotPick(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 14,
                }}
              >
                {hotspotZoneOptions.map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.name}
                  </option>
                ))}
                <option value={CUSTOM_HOTSPOT_UI_SENTINEL}>+ New place (name + coordinates)…</option>
              </select>
            </label>
            {hotspotPick === CUSTOM_HOTSPOT_UI_SENTINEL ? (
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ fontSize: 12, color: t.textMuted }}>
                  Place name
                  <input
                    type="text"
                    placeholder="e.g. Shillong Viewpoint"
                    value={customNewHotspotName}
                    onChange={(e) => setCustomNewHotspotName(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.35)",
                      color: t.text,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <label style={{ fontSize: 12, color: t.textMuted }}>
                  Zone radius (meters)
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="600"
                    value={customNewHotspotRadius}
                    onChange={(e) => setCustomNewHotspotRadius(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: 200,
                      marginTop: 6,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.35)",
                      color: t.text,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Override lat (optional)"
                value={sitePhotoLat}
                onChange={(e) => setSitePhotoLat(e.target.value)}
                style={{
                  flex: "1 1 140px",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 14,
                }}
              />
              <input
                type="text"
                placeholder="Override lng (optional)"
                value={sitePhotoLng}
                onChange={(e) => setSitePhotoLng(e.target.value)}
                style={{
                  flex: "1 1 140px",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 14,
                }}
              />
            </div>
            {gpsFromExifHint ? (
              <div
                style={{
                  fontSize: 12,
                  color: t.textMuted,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(59,130,246,0.1)",
                  border: "1px solid rgba(59,130,246,0.28)",
                }}
              >
                EXIF GPS detected: {gpsFromExifHint.lat.toFixed(5)}, {gpsFromExifHint.lng.toFixed(5)} (used if no override / pin)
              </div>
            ) : preview && String(preview).startsWith("blob:") ? (
              <span style={{ fontSize: 11, color: t.textMuted }}>No usable EXIF GPS in this file — rely on overrides or hotspot center.</span>
            ) : null}
            <button
              type="button"
              disabled={sitePhotoBusy}
              onClick={() => void analyzeAndPinSitePhoto()}
              style={{
                justifySelf: "start",
                padding: "12px 18px",
                borderRadius: 12,
                border: "none",
                background: `linear-gradient(135deg, #ea580c, #f59e0b)`,
                color: "#fff",
                fontWeight: 800,
                cursor: sitePhotoBusy ? "wait" : "pointer",
                opacity: sitePhotoBusy ? 0.8 : 1,
              }}
            >
              {sitePhotoBusy ? "Analyzing…" : "Analyze & pin site photo"}
            </button>
            {sitePhotoNote ? (
              <p style={{ margin: 0, fontSize: 12, color: "#fcd34d", lineHeight: 1.45 }}>{sitePhotoNote}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ ...cardBase, padding: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>Saved runs &amp; thumbnails</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Each classify stores a small preview in this browser. Nothing here is fetched from a server until you connect one.
        </p>
        <NavLink
          to="/dashboard/ml-data?tab=gallery"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 12,
            border: `1px solid rgba(${t.accentRgb}, 0.45)`,
            background: `rgba(${t.accentRgb}, 0.1)`,
            color: t.accent,
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Open inference gallery →
        </NavLink>
      </div>
    </div>
  );
}
