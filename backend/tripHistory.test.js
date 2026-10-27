import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrips, distanceMeters } from './tripHistory.js';

const point = (id, at, latitude, longitude, speed = 10) => ({
  id, observed_at: new Date(at).toISOString(), latitude, longitude,
  accuracy: 5, altitude: 100, speed, heading: 90, received_at: new Date(at).toISOString()
});

test('buildTrips separates independent trips after a long GPS gap', () => {
  const rows = [
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0),
    point(2, '2026-10-17T08:00:10Z', 51.0001, 17.0001),
    point(3, '2026-10-17T09:00:00Z', 51.1, 17.1),
    point(4, '2026-10-17T09:00:10Z', 51.1001, 17.1001)
  ];
  const trips = buildTrips(rows, { vehicleId: 'vehicle-1', includePoints: true });
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-3');
  assert.equal(trips[1].id, 'trip-1');
  assert.equal(trips[0].pointCount, 2);
  assert.equal(trips[0].points[0].speedKmh, 36);
});

test('buildTrips calculates duration, distance and speed statistics', () => {
  const rows = [
    point(10, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(11, '2026-10-17T08:00:10Z', 51.0001, 17.0001, 12)
  ];
  const [trip] = buildTrips(rows, { vehicleId: 'v' });
  assert.equal(trip.durationSeconds, 10);
  assert.ok(trip.distanceKm > 0);
  assert.equal(trip.maxSpeedKmh, 43.2);
  assert.equal(trip.pointCount, 2);
});

test('invalid rows are ignored and duplicate ordering remains stable', () => {
  const rows = [
    point(2, '2026-10-17T08:00:10Z', 51.0001, 17.0001),
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0),
    { id: 3, observed_at: 'invalid', latitude: 0, longitude: 0 }
  ];
  const trips = buildTrips(rows);
  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0].points, undefined);
  assert.equal(trips[0].id, 'trip-1');
});

test('distance is zero for identical coordinates', () => {
  assert.equal(distanceMeters({ latitude: 51, longitude: 17 }, { latitude: 51, longitude: 17 }), 0);
});

test('buildTrips closes a trip after a prolonged stationary stop', () => {
  const rows = [
    point(20, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(21, '2026-10-17T08:00:10Z', 51.0001, 17.0001, 10),
    point(22, '2026-10-17T08:05:00Z', 51.0001, 17.0001, 0),
    point(23, '2026-10-17T08:10:00Z', 51.0001, 17.0001, 0),
    point(24, '2026-10-17T08:15:00Z', 51.0001, 17.0001, 0),
    point(25, '2026-10-17T08:16:00Z', 51.0010, 17.0010, 10),
    point(26, '2026-10-17T08:16:10Z', 51.0011, 17.0011, 10)
  ];
  const trips = buildTrips(rows);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-25');
  assert.equal(trips[1].id, 'trip-20');
});

test('buildTrips handles newest-first database results without losing chronology', () => {
  const newestFirst = [
    point(4, '2026-10-17T09:00:10Z', 51.1001, 17.1001),
    point(3, '2026-10-17T09:00:00Z', 51.1, 17.1),
    point(2, '2026-10-17T08:00:10Z', 51.0001, 17.0001),
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0)
  ];
  const trips = buildTrips(newestFirst, { includePoints: true });
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-3');
  assert.equal(trips[0].points[0].id, '3');
  assert.equal(trips[0].points[1].id, '4');
  assert.equal(trips[1].id, 'trip-1');
});

test('buildTrips includes a stop that continues through the last GPS sample', () => {
  const rows = [
    point(30, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(31, '2026-10-17T08:00:10Z', 51.0001, 17.0001, 10),
    point(32, '2026-10-17T08:01:00Z', 51.0001, 17.0001, 0),
    point(33, '2026-10-17T08:02:00Z', 51.0001, 17.0001, 0),
    point(34, '2026-10-17T08:03:00Z', 51.0001, 17.0001, 0)
  ];
  const [trip] = buildTrips(rows);
  assert.equal(trip.stops.length, 1);
  assert.equal(trip.stops[0].durationSeconds, 120);
  assert.equal(trip.stops[0].endedAt, '2026-10-17T08:03:00.000Z');
});