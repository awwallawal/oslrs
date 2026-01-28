import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { roles } from './roles.js';
import { lgas } from './lgas.js';
import { questionnaireForms, questionnaireFiles, questionnaireVersions } from './questionnaires.js';
import { odkAppUsers } from './odk-app-users.js';

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  lga: one(lgas, {
    fields: [users.lgaId],
    references: [lgas.id],
  }),
  uploadedQuestionnaires: many(questionnaireForms),
  createdVersions: many(questionnaireVersions),
  odkAppUser: one(odkAppUsers),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const lgasRelations = relations(lgas, ({ many }) => ({
  users: many(users),
}));

// Questionnaire relations
export const questionnaireFormsRelations = relations(questionnaireForms, ({ one, many }) => ({
  uploadedBy: one(users, {
    fields: [questionnaireForms.uploadedBy],
    references: [users.id],
  }),
  file: many(questionnaireFiles),
  versions: many(questionnaireVersions),
}));

export const questionnaireFilesRelations = relations(questionnaireFiles, ({ one }) => ({
  form: one(questionnaireForms, {
    fields: [questionnaireFiles.formId],
    references: [questionnaireForms.id],
  }),
}));

export const questionnaireVersionsRelations = relations(questionnaireVersions, ({ one }) => ({
  form: one(questionnaireForms, {
    fields: [questionnaireVersions.questionnaireFormId],
    references: [questionnaireForms.id],
  }),
  createdBy: one(users, {
    fields: [questionnaireVersions.createdBy],
    references: [users.id],
  }),
}));

// ODK App Users relations
export const odkAppUsersRelations = relations(odkAppUsers, ({ one }) => ({
  user: one(users, {
    fields: [odkAppUsers.userId],
    references: [users.id],
  }),
}));
