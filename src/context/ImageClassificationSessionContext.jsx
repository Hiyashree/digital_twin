import { createContext, useContext, useMemo, useState } from "react";
import { wasteHotspots } from "../utils/wasteHotspots.js";

const ImageClassificationSessionContext = createContext(null);

/**
 * Holds waste image analysis UI state for the whole dashboard session so navigating
 * to Field map, Home, etc. does not clear the uploaded preview or classification result.
 */
export function ImageClassificationSessionProvider({ children }) {
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [classifyError, setClassifyError] = useState(null);
  const [workflowMode, setWorkflowMode] = useState("training");
  const [humanLabel, setHumanLabel] = useState("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");
  const [fieldLogBusy, setFieldLogBusy] = useState(false);
  const [hotspotPick, setHotspotPick] = useState(() => wasteHotspots[0]?.name || "");
  const [sitePhotoLat, setSitePhotoLat] = useState("");
  const [sitePhotoLng, setSitePhotoLng] = useState("");
  const [sitePhotoBusy, setSitePhotoBusy] = useState(false);
  const [sitePhotoNote, setSitePhotoNote] = useState("");

  const value = useMemo(
    () => ({
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
    }),
    [
      preview,
      fileName,
      result,
      classifyBusy,
      classifyError,
      workflowMode,
      humanLabel,
      manualLat,
      manualLng,
      workflowNote,
      fieldLogBusy,
      hotspotPick,
      sitePhotoLat,
      sitePhotoLng,
      sitePhotoBusy,
      sitePhotoNote,
    ]
  );

  return <ImageClassificationSessionContext.Provider value={value}>{children}</ImageClassificationSessionContext.Provider>;
}

export function useImageClassificationSession() {
  const ctx = useContext(ImageClassificationSessionContext);
  if (!ctx) {
    throw new Error("useImageClassificationSession must be used within ImageClassificationSessionProvider");
  }
  return ctx;
}
