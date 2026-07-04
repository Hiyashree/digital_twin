const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving";

export const blockedAreas = [
  { lat: 25.561, lng: 91.887, radiusDeg: 0.006 },
  { lat: 25.575, lng: 91.905, radiusDeg: 0.005 },
  { lat: 25.525, lng: 91.845, radiusDeg: 0.0045 },
];

function degreesDistance(a, b) {
  const latDiff = a.lat - b.lat;
  const lngDiff = a.lng - b.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

function routeHitsBlockedZone(geojson) {
  if (!geojson || !geojson.coordinates) return false;
  return geojson.coordinates.some(([lng, lat]) => {
    return blockedAreas.some((block) => degreesDistance({ lat, lng }, block) <= block.radiusDeg);
  });
}

async function fetchOsrmRoute(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_ROUTE_URL}/${coords}?overview=full&geometries=geojson&alternatives=true&steps=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const json = await response.json();
    if (!json.routes || json.routes.length === 0) return null;

    const validRoute = json.routes.find((route) => !routeHitsBlockedZone(route.geometry));
    if (!validRoute) return null;

    return {
      distance: validRoute.distance,
      duration: validRoute.duration,
      geometry: validRoute.geometry,
    };
  } catch (error) {
    console.warn("OSRM route fetch failed", error);
    return null;
  }
}

async function fetchOsrmMatrix(nodes) {
  const coords = nodes.map((node) => `${node.lng},${node.lat}`).join(";");
  const url = `${OSRM_TABLE_URL}/${coords}?annotations=distance`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const json = await response.json();
    if (!json.distances) return null;
    return json.distances;
  } catch (error) {
    console.warn("OSRM table fetch failed", error);
    return null;
  }
}

function buildRouteOrder(distanceMatrix) {
  const n = distanceMatrix.length;
  const visited = new Array(n).fill(false);
  const order = [0];
  visited[0] = true;

  for (let step = 1; step < n; step += 1) {
    const last = order[order.length - 1];
    let bestIndex = -1;
    let bestDistance = Infinity;

    for (let i = 1; i < n; i += 1) {
      if (visited[i]) continue;
      const dist = distanceMatrix[last][i];
      if (dist !== null && dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      break;
    }

    visited[bestIndex] = true;
    order.push(bestIndex);
  }

  return order;
}

/**
 * Build a road-optimal visit order for geographic stops (tourist POIs, depots, etc.).
 * Each stop must have numeric `lat` and `lng`. Returns ordered `stops` matching the path after the depot.
 */
export async function optimizePickupRoute(stops, depot) {
  if (!stops || stops.length === 0) {
    return { stops: [], coordinates: [], distance: 0, warning: "No collection stops selected." };
  }

  const locations = [depot, ...stops];
  const matrix = await fetchOsrmMatrix(locations);

  if (!matrix) {
    return {
      stops: [],
      coordinates: [],
      distance: 0,
      warning: "Unable to compute a cost matrix from OSRM. Check connectivity or OSRM availability.",
    };
  }

  const order = buildRouteOrder(matrix);
  const orderedStops = order.slice(1).map((index) => stops[index - 1]);
  const coordinates = [];
  let totalDistance = 0;
  let warning = "";

  for (let i = 0; i < order.length - 1; i += 1) {
    const source = locations[order[i]];
    const destination = locations[order[i + 1]];
    const route = await fetchOsrmRoute(source, destination);
    if (!route) {
      warning = "An actual road route could not be found for one segment due to blocked roads. The route order is still based on road distance matrix.";
      continue;
    }

    totalDistance += route.distance;
    if (coordinates.length === 0) {
      coordinates.push(...route.geometry.coordinates);
    } else {
      const [, ...nextCoords] = route.geometry.coordinates;
      coordinates.push(...nextCoords);
    }
  }

  return {
    stops: orderedStops,
    coordinates,
    distance: totalDistance,
    warning,
  };
}
