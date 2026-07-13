import type { Request } from "express";
import type { NebulaUser, NebulaUserRole } from "../shared/gallery";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getAuthenticatedUser(req: Request): NebulaUser | null {
  const id = headerValue(req.headers["x-nebula-user-id"]);

  if (!id) {
    return null;
  }

  const roleHeader = headerValue(req.headers["x-nebula-user-role"]);
  const role: NebulaUserRole = roleHeader === "admin" ? "admin" : "user";
  const name = headerValue(req.headers["x-nebula-user-name"]) ?? id;

  return { id, name, role };
}

export function requireAuthenticatedUser(req: Request): NebulaUser {
  const user = getAuthenticatedUser(req);

  if (!user) {
    const error = new Error("Authentication required");
    error.name = "UnauthenticatedError";
    throw error;
  }

  return user;
}