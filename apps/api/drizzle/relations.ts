import { relations } from "drizzle-orm/relations";
import { roles, users, lgas, audit_logs } from "./schema";

export const usersRelations = relations(users, ({one, many}) => ({
	role: one(roles, {
		fields: [users.role_id],
		references: [roles.id]
	}),
	lgas: one(lgas, {
		fields: [users.lga_id],
		references: [lgas.id]
	}),
	audit_logs: many(audit_logs),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	users: many(users),
}));

export const lgasRelations = relations(lgas, ({many}) => ({
	users: many(users),
}));

export const audit_logsRelations = relations(audit_logs, ({one}) => ({
	user: one(users, {
		fields: [audit_logs.actor_id],
		references: [users.id]
	}),
}));