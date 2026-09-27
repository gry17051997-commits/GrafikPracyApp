export const DRIVER_STATUSES = Object.freeze({
  STARTED: "started",
  LOADING: "loading",
  UNLOADING: "unloading",
  WAITING_RAMP: "waiting_ramp",
  EN_ROUTE_LOADED: "en_route_loaded",
  EN_ROUTE_EMPTY: "en_route_empty",
  FINISHED: "finished"
});

export const STATUS_LABELS = Object.freeze({
  started: "Zaczynam pracę, jestem na miejscu",
  loading: "Czekam na załadunek",
  unloading: "Czekam na rozładunek",
  waiting_ramp: "Czekam na przydzielenie rampy",
  en_route_loaded: "W drodze, załadowany",
  en_route_empty: "W drodze, na pusto",
  finished: "Koniec zmiany"
});

const TRANSITIONS = {
  started: new Set(["loading","unloading","waiting_ramp","en_route_loaded","en_route_empty","finished"]),
  loading: new Set(["unloading","waiting_ramp","en_route_loaded","en_route_empty","finished"]),
  unloading: new Set(["loading","waiting_ramp","en_route_loaded","en_route_empty","finished"]),
  waiting_ramp: new Set(["loading","unloading","en_route_loaded","en_route_empty","finished"]),
  en_route_loaded: new Set(["loading","unloading","waiting_ramp","finished"]),
  en_route_empty: new Set(["loading","unloading","waiting_ramp","finished"]),
  finished: new Set(["started"])
};

export function createDriverStatus({employeeId, status=DRIVER_STATUSES.STARTED, warehouse=null, route=null, at=new Date().toISOString()}) {
  if (!employeeId) throw new Error("employeeId is required");
  if (!STATUS_LABELS[status]) throw new Error("invalid driver status");
  return {employeeId,status,warehouse,route,at};
}

export function transitionDriverStatus(current, nextStatus, patch={}) {
  if (!current || !STATUS_LABELS[current.status]) throw new Error("invalid current driver status");
  if (!STATUS_LABELS[nextStatus]) throw new Error("invalid next driver status");
  if (!TRANSITIONS[current.status].has(nextStatus)) {
    throw new Error(`invalid driver status transition: ${current.status} -> ${nextStatus}`);
  }
  return {...current,...patch,status:nextStatus,at:patch.at || new Date().toISOString()};
}
