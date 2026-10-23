export const permissionKeys = [
  "crm.read",
  "crm.write",
  "team.manage",
  "settings.manage",
  "ai.run",
] as const;
export type Permission = (typeof permissionKeys)[number];
export function permits(grants: readonly string[], permission: string) {
  return grants.includes(permission);
}
