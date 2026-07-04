// Smart scheduling utilities for time-based bin collection prioritization

export const getCurrentTimeOfDay = () => {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
};

export const getTimeBasedPriorities = (timeOfDay) => {
  const priorities = {
    morning: {
      residential: 10, // High priority - morning waste collection
      office: 5,       // Medium priority - offices just opening
      market: 2,       // Low priority - markets not busy yet
    },
    afternoon: {
      office: 10,      // High priority - office waste during work hours
      residential: 5,  // Medium priority - some household waste
      market: 3,       // Low priority - markets moderate
    },
    evening: {
      market: 10,      // High priority - market waste after closing
      residential: 8,  // High priority - evening household waste
      office: 2,       // Low priority - offices mostly closed
    },
    night: {
      residential: 3,  // Low priority - minimal activity
      office: 1,       // Very low priority - offices closed
      market: 1,       // Very low priority - markets closed
    }
  };

  return priorities[timeOfDay] || priorities.afternoon;
};

export const calculateSmartPriority = (bin, timeOfDay) => {
  const priorities = getTimeBasedPriorities(timeOfDay);
  const basePriority = priorities[bin.area] || 5;

  // Boost priority for critical bins (high fill levels)
  const fillBoost = bin.fill >= 90 ? 15 : bin.fill >= 75 ? 10 : bin.fill >= 50 ? 5 : 0;

  // Boost priority for hotspot bins
  const hotspotBoost = bin.hotspot ? 12 : 0;

  // Boost priority for high gas levels (potential issues)
  const gasBoost = bin.gas >= 60 ? 8 : bin.gas >= 40 ? 4 : 0;

  // Boost priority for high temperature (fire risk)
  const tempBoost = bin.temperature >= 30 ? 6 : bin.temperature >= 25 ? 3 : 0;

  return basePriority + fillBoost + hotspotBoost + gasBoost + tempBoost;
};

export const sortBinsBySmartPriority = (bins, timeOfDay) => {
  return [...bins].sort((a, b) => {
    const priorityA = calculateSmartPriority(a, timeOfDay);
    const priorityB = calculateSmartPriority(b, timeOfDay);

    // Sort by priority (higher first), then by fill level for tie-breaking
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }
    return b.fill - a.fill;
  });
};

export const getSchedulingInsights = (bins, timeOfDay) => {
  const priorities = getTimeBasedPriorities(timeOfDay);
  const topPriorities = Object.entries(priorities)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 2)
    .map(([area]) => area);

  const criticalCount = bins.filter(bin => bin.fill >= 90).length;
  const highPriorityCount = bins.filter(bin =>
    calculateSmartPriority(bin, timeOfDay) >= 15
  ).length;

  return {
    timeOfDay,
    topPriorityAreas: topPriorities,
    criticalBins: criticalCount,
    highPriorityBins: highPriorityCount,
    totalBins: bins.length
  };
};