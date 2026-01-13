import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { roles } from './roles.js';
import { lgas } from './lgas.js';

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  lga: one(lgas, {
    fields: [users.lgaId],
    references: [lgas.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const lgasRelations = relations(lgas, ({ many }) => ({
  users: many(users),
}));
