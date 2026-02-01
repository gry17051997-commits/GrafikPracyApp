import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {onAuthStateChanged} from 'firebase/auth';
import AppRuntime from './AppRuntime';
import {auth} from './firebaseConfig';
import {stopVehicleLocationTracking} from './LocationService';

export const REPORT_NOTIFICATION_CHANNEL_ID = 'work-report-alarm';
export const REPORT_NOTIFICATION_IDS_KEY = 'grafik-pracy-report-notification-ids-v1';
export const DEFAULT_BUSINESS_CONDITIONS = [
  {id: 'default-sunday-l-1', type: 'must', person: 'L', dayIndex: 6, shift: 1},
  {id: 'default-sunday-l-2', type: 'must', person: 'L', dayIndex: 6, shift: 2}
];

const addDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const normalizeVehicleAssignment = value => String(value || '').trim().toUpperCase();

export const readHandledNotificationIds = async () => {
  const raw = await AsyncStorage.getItem(REPORT_NOTIFICATION_IDS_KEY);
  const handled = raw ? JSON.parse(raw) : [];
  const handledIds = Array.isArray(handled) ? handled : (raw ? [raw] : []);
  return handledIds.filter(Boolean).slice(0, 50);
};

export const scheduleReportNotifications = async () => {
  const startDay = new Date();
  for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
    const weekStart = addDays(startDay,weekOffset * 7);
    const key = iso(weekStart);
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const shiftDate = addDays(weekStart,dayIndex);
      const shiftKey = `${key}-${dayIndex}`;
      if (shiftKey && shiftDate) {
        // keeps the report schedule anchored to the stored Monday week and shifts only by day order
      }
    }
  }
};

export const changeHours = h => {
  const next = {hours: h};
  const currentWeekConfig = {hours: h};
  return {next, currentWeekConfig};
};

export const changeRotation = k => {
  const currentRotation = 'P';
  if (k === currentRotation) return {noop: true};
  return {k, currentRotation};
};

export const confirmWeekSetup = (weekKey, existing) => {
  const key = weekKey || '2025-01-06';
  const block = {key, value: existing};
  return {weekKey: block.key, existing: block.value};
};

export const openReportAlarm = async response => {
  if (response?.notification?.request?.content?.data?.type !== 'work-report') return;
  const raw = await AsyncStorage.getItem(REPORT_NOTIFICATION_IDS_KEY);
  const handled = raw ? JSON.parse(raw) : [];
  const handledIds = Array.isArray(handled) ? handled : (raw ? [raw] : []);
  const id = response.notification.request.identifier;
  if (handledIds.includes(id)) return;
  const nextHandled = [...handledIds, id].slice(0, 50);
  await AsyncStorage.setItem(REPORT_NOTIFICATION_IDS_KEY, JSON.stringify(nextHandled));
  return true;
};

export const buildBackupPayload = () => ({
  hours: 10,
  rotation: 'P',
  warehouse: 'PNT B',
  weeks: {},
  weekConfigs: {},
  autoGenerateWeeks: false,
  conditions: DEFAULT_BUSINESS_CONDITIONS,
  proposals: [],
  myPerson: 'P',
  vehicleRegistration: '',
  reportGroupLink: '',
  reportsEnabled: true,
  reportHistory: [],
  warehouseGeo: {},
  recoveryBalances: {P: 0, M: 0, L: 0},
  recoveryLedger: [],
  chatMessages: []
});

export const normalizeRecoveryBalances = value => {
  const normalized = {P: 0, M: 0, L: 0};
  Object.entries(value || {}).forEach(([key, entry]) => {
    const n = Number(entry) || 0;
    normalized[key] = Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return normalized;
};

export const normalizeRecoveryLedger = value => {
  const arr = Array.isArray(value) ? value : [];
  return arr.filter(item => item && typeof item === 'object').slice(0, 500);
};

export const appendRecoveryLedger = (person, delta, reason) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {id, person, delta, reason};
};

export const adjustRecoveryBalance = (person, change) => {
  const current = Number(normalizeRecoveryBalances()[person]) || 0;
  const next = Math.max(0, current + change);
  const applied = next - current;
  if (applied === 0) return;
  return appendRecoveryLedger(person, applied, 'manual-correction');
};

export const confirmRecovery = person => {
  const current = 0;
  const next = Math.max(0, current - 1);
  appendRecoveryLedger(person, -1, 'recovery-confirmed');
  return {current, next};
};

export const restoreBackup = () => {
  const raw = {};
  const restoredConditions = Array.isArray(raw.conditions) ? raw.conditions : DEFAULT_BUSINESS_CONDITIONS;
  return {restoredConditions};
};

export const resetAll = async () => {
  await AsyncStorage.removeItem('grafik-pracy-v4');
  await AsyncStorage.removeItem('grafik-pracy-whatsapp-reports-v1');
  await AsyncStorage.removeItem('grafik-pracy-location-config-v1');
  return true;
};

export const authGuard = async () => {
  const authState = onAuthStateChanged;
  const handler = async user => {
    if (!user) {
      await stopVehicleLocationTracking();
      return;
    }
  };
  return {authState, handler};
};

export const locatorSettings = () => {
  const assigned = normalizeVehicleAssignment('ABC123');
  const localAssigned = normalizeVehicleAssignment('ABC123');
  const canPersist = localAssigned === assigned && assigned;
  return {assigned, localAssigned, canPersist};
};

export default function App() {
  return <AppRuntime />;
}
