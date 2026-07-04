import { useMemo } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";
import { countBinCategories } from "../utils/binHelpers.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const chartWrap = {
  width: 300,
  margin: 10,
  minHeight: 260,
};

export default function BinChart({ bins }) {
  const data = useMemo(() => {
    const { empty, moderate, fullBins } = countBinCategories(bins);

    return {
      labels: ["Empty", "Moderate", "Full"],
      datasets: [
        {
          data: [empty, moderate, fullBins],

          // 🔥 COLORS FIXED HERE
          backgroundColor: [
            "rgba(75, 192, 192, 0.6)",   // green
            "rgba(255, 206, 86, 0.6)",   // yellow
            "rgba(255, 99, 132, 0.6)",   // red
          ],
          borderColor: [
            "rgba(75, 192, 192, 1)",
            "rgba(255, 206, 86, 1)",
            "rgba(255, 99, 132, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [bins]);

  return (
    <div style={chartWrap}>
      <Pie data={data} options={{ maintainAspectRatio: true }} />
    </div>
  );
}