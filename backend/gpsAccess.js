/**
 * Current product policy inferred from the app UI:
 * - admin and employee can read the fleet (employee is currently used by the
 *   non-locator fleet dashboard);
 * - locator can read only the vehicle assigned to that user.
 * Unknown roles are denied.
 */
export function canReadVehicleTelemetry({role,userId,assignedUserId}={}) {
  if(role==='admin'||role==='employee')return true;
  if(role==='locator')return Boolean(userId&&assignedUserId&&String(userId)===String(assignedUserId));
  return false;
}
