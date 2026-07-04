import { useState, useEffect } from "react";
import { optimizePickupRoute } from "../utils/routeHelpers.js";
import { collectionStopsFromHotspots } from "../utils/wasteHotspots.js";
import { countStats, getOverflowRisk } from "../utils/binHelpers.js";
import { getCurrentTimeOfDay, getSchedulingInsights } from "../utils/schedulingHelpers.js";

export default function ScenarioPlanner({ bins, selectedDepot, onScenarioChange }) {
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Scenario types
  const scenarioTypes = [
    { id: "add_bin", label: "➕ Add New Bin", icon: "📍" },
    { id: "remove_bin", label: "➖ Remove Bin", icon: "🗑️" },
    { id: "change_capacity", label: "📊 Change Capacity", icon: "📈" },
    { id: "emergency_response", label: "🚨 Emergency Response", icon: "🚑" },
  ];

  const calculateScenarioImpact = async (scenarioType, scenarioData) => {
    setIsCalculating(true);

    try {
      let modifiedBins = [...bins];

      switch (scenarioType) {
        case "add_bin":
          // Add a new hypothetical bin
          const newBin = {
            id: `scenario_${Date.now()}`,
            name: scenarioData.name || "New Bin",
            lat: scenarioData.lat,
            lng: scenarioData.lng,
            fill: scenarioData.initialFill || 0,
            capacity: scenarioData.capacity || 100,
            temperature: scenarioData.temperature || 25,
            hotspot: false,
            highFillCount: 0,
            fillHistory: [scenarioData.initialFill || 0],
            assigned: false,
            isScenario: true, // Mark as scenario bin
          };
          modifiedBins.push(newBin);
          break;

        case "remove_bin":
          // Remove specified bin
          modifiedBins = modifiedBins.filter(bin => bin.id !== scenarioData.binId);
          break;

        case "change_capacity":
          // Change capacity of a bin
          modifiedBins = modifiedBins.map(bin =>
            bin.id === scenarioData.binId
              ? { ...bin, capacity: scenarioData.newCapacity }
              : bin
          );
          break;

        case "emergency_response":
          // Simulate emergency response by prioritizing certain bins
          modifiedBins = modifiedBins.map(bin =>
            scenarioData.priorityBins.includes(bin.id)
              ? { ...bin, fill: Math.min(100, bin.fill + 20) } // Simulate rapid filling
              : bin
          );
          break;
      }

      // Calculate impacts
      const timeOfDay = getCurrentTimeOfDay();
      const routeTargets = collectionStopsFromHotspots(modifiedBins, { limit: 6 });

      let routeResult = { stops: [], coordinates: [], distance: 0, warning: "No route needed" };
      if (routeTargets.length > 0) {
        routeResult = await optimizePickupRoute(routeTargets, selectedDepot);
      }

      const stats = countStats(modifiedBins);
      const overflowRisks = modifiedBins
        .map(bin => ({ ...bin, overflowRisk: getOverflowRisk(bin) }))
        .filter(bin => bin.overflowRisk && bin.overflowRisk.hours <= 4);

      const schedulingInsights = getSchedulingInsights(modifiedBins, timeOfDay);

      // Calculate environmental impact
      const distanceKm = routeResult.distance / 1000;
      const fuelConsumption = distanceKm * 0.08; // 8L per 100km
      const co2Emission = fuelConsumption * 2.3; // 2.3kg CO2 per liter

      const impact = {
        routeDistance: distanceKm,
        fuelUsed: fuelConsumption,
        co2Emitted: co2Emission,
        binsAffected: modifiedBins.length - bins.length,
        overflowRiskCount: overflowRisks.length,
        criticalBins: stats.critical,
        hotspots: modifiedBins.filter(b => b.hotspot).length,
        routeStops: routeResult.stops?.length ?? 0,
        topPriorityAreas: schedulingInsights.topPriorityAreas,
      };

      return {
        type: scenarioType,
        data: scenarioData,
        modifiedBins,
        impact,
        routeResult,
        stats,
        overflowRisks,
      };

    } catch (error) {
      console.error("Scenario calculation failed:", error);
      return null;
    } finally {
      setIsCalculating(false);
    }
  };

  const createScenario = async (type, data) => {
    const result = await calculateScenarioImpact(type, data);
    if (result) {
      const newScenario = {
        id: `scenario_${Date.now()}`,
        name: `${scenarioTypes.find(s => s.id === type).icon} ${data.name || type}`,
        type,
        result,
        createdAt: new Date(),
      };

      setScenarios(prev => [...prev, newScenario]);
      setActiveScenario(newScenario.id);

      // Notify parent component
      if (onScenarioChange) {
        onScenarioChange(newScenario);
      }
    }
  };

  const removeScenario = (scenarioId) => {
    setScenarios(prev => prev.filter(s => s.id !== scenarioId));
    if (activeScenario === scenarioId) {
      setActiveScenario(null);
      if (onScenarioChange) {
        onScenarioChange(null);
      }
    }
  };

  const getScenarioSummary = (scenario) => {
    const impact = scenario.result.impact;
    const originalStats = countStats(bins);

    return {
      routeChange: impact.routeDistance > 0 ? `+${impact.routeDistance.toFixed(1)}km` : "No change",
      overflowChange: impact.overflowRiskCount > 0 ? `+${impact.overflowRiskCount} risks` : "No new risks",
      binChange: impact.binsAffected !== 0 ? `${impact.binsAffected > 0 ? '+' : ''}${impact.binsAffected} bins` : "No change",
      fuelImpact: impact.fuelUsed > 0 ? `+${impact.fuelUsed.toFixed(1)}L fuel` : "No change",
    };
  };

  return (
    <div style={{
      borderRadius: 16,
      background: "rgba(255, 255, 255, 0.05)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      padding: 12,
      marginBottom: 10,
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{
          margin: 0,
          fontSize: "1.2rem",
          fontWeight: 600,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          🎯 What-If Scenario Planner
          {isCalculating && <span style={{ color: "#74d0ff", fontSize: "0.9rem" }}>Calculating...</span>}
        </h3>
        <p style={{
          margin: "4px 0 0",
          fontSize: "0.9rem",
          color: "rgba(255,255,255,0.7)",
        }}>
          Test decisions before implementing them
        </p>
      </div>

      {/* Scenario Creation */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {scenarioTypes.map(scenarioType => (
          <button
            key={scenarioType.id}
            onClick={() => {
              switch (scenarioType.id) {
                case "add_bin":
                  createScenario("add_bin", {
                    name: "New Bin",
                    lat: 25.58 + (Math.random() - 0.5) * 0.02,
                    lng: 91.88 + (Math.random() - 0.5) * 0.02,
                    capacity: 100,
                    initialFill: 10,
                    temperature: 25,
                  });
                  break;
                case "remove_bin":
                  const randomBin = bins[Math.floor(Math.random() * bins.length)];
                  if (randomBin) {
                    createScenario("remove_bin", {
                      name: `Remove ${randomBin.name}`,
                      binId: randomBin.id,
                    });
                  }
                  break;
                case "change_capacity":
                  const capacityBin = bins[Math.floor(Math.random() * bins.length)];
                  if (capacityBin) {
                    createScenario("change_capacity", {
                      name: `Change ${capacityBin.name} Capacity`,
                      binId: capacityBin.id,
                      newCapacity: capacityBin.capacity * 1.5,
                    });
                  }
                  break;
                case "emergency_response":
                  const criticalBins = bins.filter(b => b.fill > 80).slice(0, 3);
                  if (criticalBins.length > 0) {
                    createScenario("emergency_response", {
                      name: "Emergency Response",
                      priorityBins: criticalBins.map(b => b.id),
                    });
                  }
                  break;
              }
            }}
            disabled={isCalculating}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: isCalculating ? "not-allowed" : "pointer",
              opacity: isCalculating ? 0.5 : 1,
              transition: "all 0.2s",
              textAlign: "center",
            }}
            onMouseOver={(e) => !isCalculating && (e.target.style.background = "rgba(255,255,255,0.1)")}
            onMouseOut={(e) => !isCalculating && (e.target.style.background = "rgba(255,255,255,0.05)")}
          >
            {scenarioType.icon} {scenarioType.label.split(' ').slice(1).join(' ')}
          </button>
        ))}
      </div>

      {/* Active Scenarios */}
      {scenarios.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "1rem", color: "#fff" }}>Active Scenarios</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {scenarios.map(scenario => {
              const summary = getScenarioSummary(scenario);
              const isActive = activeScenario === scenario.id;

              return (
                <div
                  key={scenario.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: isActive ? "rgba(116, 208, 255, 0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isActive ? "#74d0ff" : "rgba(255,255,255,0.1)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onClick={() => setActiveScenario(isActive ? null : scenario.id)}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}>
                    <span style={{ fontWeight: 500, color: "#fff" }}>{scenario.name}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: "0.8rem",
                        color: isActive ? "#74d0ff" : "rgba(255,255,255,0.6)",
                      }}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeScenario(scenario.id);
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "none",
                          background: "rgba(255, 107, 107, 0.2)",
                          color: "#ff6b6b",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 8,
                    fontSize: "0.8rem",
                  }}>
                    <div style={{ color: summary.routeChange.includes('+') ? "#ff9f43" : "#7ff3a4" }}>
                      📍 {summary.routeChange}
                    </div>
                    <div style={{ color: summary.overflowChange.includes('+') ? "#ff6b6b" : "#7ff3a4" }}>
                      ⚠️ {summary.overflowChange}
                    </div>
                    <div style={{ color: summary.binChange.includes('+') ? "#74d0ff" : summary.binChange.includes('-') ? "#ff6b6b" : "#fff" }}>
                      🗂️ {summary.binChange}
                    </div>
                    <div style={{ color: summary.fuelImpact.includes('+') ? "#ff9f43" : "#7ff3a4" }}>
                      ⛽ {summary.fuelImpact}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scenario Details */}
      {activeScenario && scenarios.find(s => s.id === activeScenario) && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(116, 208, 255, 0.05)",
          border: "1px solid rgba(116, 208, 255, 0.3)",
        }}>
          <h4 style={{ margin: "0 0 12px", color: "#74d0ff", fontSize: "1rem" }}>
            📊 Scenario Impact Analysis
          </h4>

          {(() => {
            const scenario = scenarios.find(s => s.id === activeScenario);
            const impact = scenario.result.impact;
            const originalStats = countStats(bins);

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <div>
                  <h5 style={{ margin: "0 0 8px", color: "#fff", fontSize: "0.9rem" }}>🚛 Route Impact</h5>
                  <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>
                    <div>Distance: <strong style={{ color: "#ff9f43" }}>{impact.routeDistance.toFixed(1)}km</strong></div>
                    <div>Fuel Used: <strong style={{ color: "#ffb86c" }}>{impact.fuelUsed.toFixed(1)}L</strong></div>
                    <div>CO₂: <strong style={{ color: "#74d0ff" }}>{impact.co2Emitted.toFixed(1)}kg</strong></div>
                    <div>Sites in route: <strong>{impact.routeStops}</strong></div>
                  </div>
                </div>

                <div>
                  <h5 style={{ margin: "0 0 8px", color: "#fff", fontSize: "0.9rem" }}>⚠️ Risk Assessment</h5>
                  <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>
                    <div>Overflow Risks: <strong style={{ color: impact.overflowRiskCount > 0 ? "#ff6b6b" : "#7ff3a4" }}>{impact.overflowRiskCount}</strong></div>
                    <div>Critical Bins: <strong style={{ color: impact.criticalBins > originalStats.critical ? "#ff6b6b" : "#7ff3a4" }}>{impact.criticalBins}</strong></div>
                    <div>Hotspots: <strong style={{ color: "#ff9f43" }}>{impact.hotspots}</strong></div>
                    <div>Priority Areas: <strong>{impact.topPriorityAreas.join(", ")}</strong></div>
                  </div>
                </div>

                <div>
                  <h5 style={{ margin: "0 0 8px", color: "#fff", fontSize: "0.9rem" }}>📈 Capacity Changes</h5>
                  <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>
                    <div>Total Bins: <strong>{scenario.result.modifiedBins.length}</strong></div>
                    <div>Change: <strong style={{ color: impact.binsAffected > 0 ? "#74d0ff" : impact.binsAffected < 0 ? "#ff6b6b" : "#fff" }}>
                      {impact.binsAffected > 0 ? `+${impact.binsAffected}` : impact.binsAffected}
                    </strong></div>
                    <div>Avg Fill Rate: <strong>{(scenario.result.modifiedBins.reduce((sum, b) => sum + b.fill, 0) / scenario.result.modifiedBins.length).toFixed(1)}%</strong></div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}