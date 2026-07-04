import { Routes, Route } from "react-router-dom";
import Index from "./components/Index.jsx";
import Dashboard from "./components/Dashboard.jsx";
import { initialBins } from "./data/initialBins.js";
import { apiUrl } from "./config/api.js";
import { localPredictFill } from "./utils/localFillPrediction.js";
import { SiteActivityProvider } from "./context/SiteActivityContext.jsx";

export default function App() {
  /** Returns `{ predicted, source }` — uses Flask `/predict` when up, else a deterministic local estimate. */
  const getPrediction = async (bin) => {
    const hours = 2;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(apiUrl("/predict"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          fill: bin.fill,
          temperature: bin.temperature,
          gas: bin.gas,
          area: bin.area,
          time: hours,
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data?.predicted_fill != null) {
          return { predicted: Number(data.predicted_fill), source: "api" };
        }
      }
    } catch {
      /* Backend down, wrong URL, or timeout — fall through */
    }

    return { predicted: localPredictFill(bin, hours), source: "local" };
  };

  return (
    <SiteActivityProvider>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard/*" element={<Dashboard initialBins={initialBins} getPrediction={getPrediction} />} />
      </Routes>
    </SiteActivityProvider>
  );
}
