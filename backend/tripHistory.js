const TRIP_GAP_MS = 30 * 60 * 1000;
const MAX_SEGMENT_GAP_MS = 2 * 60 * 1000;
const MIN_MOVING_SPEED_KMH = 5;

const asMillis = value => {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
};
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const speedKmh = value => {
  const speed = numeric(value);
  return speed == null || speed < 0 ? null : speed * 3.6;
};
const radians = value => value * Math.PI / 180;

export function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const lat1 = numeric(a.latitude), lon1 = numeric(a.longitude);
  const lat2 = numeric(b.latitude), lon2 = numeric(b.longitude);
  if ([lat1, lon1, lat2, lon2].some(value => value == null)) return 0;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function pointView(row) {
  return {
    id: String(row.id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: numeric(row.accuracy),
    altitude: numeric(row.altitude),
    speedKmh: speedKmh(row.speed),
    heading: numeric(row.heading),
    observedAt: new Date(row.observed_at).toISOString(),
    receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null
  };
}

function summarizeTrip(rows, vehicleId, includePoints) {
  const points = rows.map(pointView);
  const first = points[0], last = points[points.length - 1];
  const startMs = asMillis(first.observedAt), endMs = asMillis(last.observedAt);
  let distance = 0, drivingMs = 0, maxSpeed = 0, speedSum = 0, speedCount = 0;
  const stops = [];
  let stopStart = null, previous = null;

  for (const point of points) {
    if (point.speedKmh != null) {
      maxSpeed = Math.max(maxSpeed, point.speedKmh);
      if (point.speedKmh >= MIN_MOVING_SPEED_KMH) {
        speedSum += point.speedKmh;
        speedCount++;
      }
    }
    if (previous) {
      const a = asMillis(previous.observedAt), b = asMillis(point.observedAt);
      const dt = b - a;
      const segmentDistance = distanceMeters(previous, point);
      // Gaps and implausible jumps are not used for distance or speed statistics.
      if (dt > 0 && dt <= MAX_SEGMENT_GAP_MS && segmentDistance <= 2000) {
        distance += segmentDistance;
        if ((previous.speedKmh ?? 0) >= MIN_MOVING_SPEED_KMH || (point.speedKmh ?? 0) >= MIN_MOVING_SPEED_KMH) {
          drivingMs += dt;
        }
      }
      const stopped = point.speedKmh != null && point.speedKmh < 3;
      if (stopped && stopStart == null) stopStart = point.observedAt;
      if (!stopped && stopStart != null) {
        const stopEnd = asMillis(previous.observedAt);
        const stopBegin = asMillis(stopStart);
        if (stopEnd != null && stopBegin != null && stopEnd - stopBegin >= 120000) {
          stops.push({ startedAt: stopStart, endedAt: previous.observedAt, durationSeconds: Math.round((stopEnd - stopBegin) / 1000), latitude: previous.latitude, longitude: previous.longitude });
        }
        stopStart = null;
      }
    }
    previous = point;
  }

  // Include a stop that is still in progress at the end of the available history.
  if (stopStart != null && last) {
    const stopBegin = asMillis(stopStart);
    if (stopBegin != null && endMs - stopBegin >= 120000) {
      stops.push({ startedAt: stopStart, endedAt: last.observedAt, durationSeconds: Math.round((endMs - stopBegin) / 1000), latitude: last.latitude, longitude: last.longitude });
    }
  }

  const elapsedSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const drivingSeconds = Math.min(elapsedSeconds, Math.round(drivingMs / 1000));
  const distanceKm = distance / 1000;
  const movingAverage = drivingSeconds > 0 ? distanceKm / (drivingSeconds / 3600) : (speedCount ? speedSum / speedCount : 0);
  const wholeAverage = elapsedSeconds > 0 ? distanceKm / (elapsedSeconds / 3600) : 0;
  const trip = {
    id: `trip-${first.id}`,
    vehicleId,
    startedAt: first.observedAt,
    endedAt: last.observedAt,
    start: { latitude: first.latitude, longitude: first.longitude },
    end: { latitude: last.latitude, longitude: last.longitude },
    pointCount: points.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    durationSeconds: elapsedSeconds,
    drivingSeconds,
    stopSeconds: Math.max(0, elapsedSeconds - drivingSeconds),
    averageSpeedKmh: Number(movingAverage.toFixed(1)),
    averageIncludingStopsKmh: Number(wholeAverage.toFixed(1)),
    maxSpeedKmh: Number(maxSpeed.toFixed(1)),
    stops
  };
  if (includePoints) trip.points = points;
  return trip;
}

/**
 * Derive stable, independently selectable trips from retained GPS history.
 * A trip is split after a long telemetry gap; point IDs make its ID stable
 * across requests and do not require a new database migration.
 */
export function buildTrips(rows, { vehicleId = '', includePoints = false, gapMs = TRIP_GAP_MS, stationarySplitMs = 12 * 60 * 1000 } = {}) {
  const valid = (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.id != null && asMillis(row.observed_at) != null
      && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
    .slice()
    .sort((a, b) => asMillis(a.observed_at) - asMillis(b.observed_at) || Number(a.id) - Number(b.id));

  const groups = [];
  let current = [], stationary = [], previous = null;
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    stationary = [];
  };
  const stationaryDuration = () => stationary.length < 2 ? 0
    : asMillis(stationary[stationary.length - 1].observed_at) - asMillis(stationary[0].observed_at);

  for (const row of valid) {
    const previousTime = previous ? asMillis(previous.observed_at) : null;
    const rowTime = asMillis(row.observed_at);
    const gap = previousTime == null ? 0 : rowTime - previousTime;
    if (previous && gap > gapMs) {
      if (stationary.length && stationaryDuration() < stationarySplitMs) current.push(...stationary);
      flush();
      // Keep the first valid sample after a telemetry gap as the start candidate
      // for the next trip; otherwise the first point is silently lost.
      current = [row];
      previous = row;
      continue;
    }

    const movement = previous && gap > 0 && gap <= MAX_SEGMENT_GAP_MS
      ? distanceMeters(previous, row) : 0;
    const measuredSpeed = speedKmh(row.speed);
    const isMoving = (measuredSpeed != null && measuredSpeed >= MIN_MOVING_SPEED_KMH)
      || movement >= 12;

    if (isMoving) {
      if (stationary.length) {
        if (stationaryDuration() >= stationarySplitMs) {
          // A prolonged stop closes the previous trip. Do not connect the next
          // departure to the parked vehicle's coordinates as if it were driving.
          if (current.length) {
            current.push(stationary[0]);
            groups.push(current);
            current = [];
          }
        } else {
          current.push(...stationary);
        }
        stationary = [];
      }
      current.push(row);
    } else if (current.length) {
      stationary.push(row);
      if (stationaryDuration() >= stationarySplitMs) {
        current.push(stationary[0]);
        groups.push(current);
        current = [];
        stationary = [];
      }
    }
    previous = row;
  }

  if (stationary.length && stationaryDuration() < stationarySplitMs) current.push(...stationary);
  if (current.length) groups.push(current);

  // Stable ordering and IDs make each trip selectable across refreshes.
  return groups
    .filter(group => group.length >= 2)
    .map(group => summarizeTrip(group, vehicleId, includePoints))
    .reverse();
}