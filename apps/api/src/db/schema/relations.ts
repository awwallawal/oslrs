import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { roles } from './roles.js';
import { lgas } from './lgas.js';
import { questionnaireForms, questionnaireFiles, questionnaireVersions } from './questionnaires.js';
import { submissions } from './submissions.js';
import { respondents } from './respondents.js';

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

// Submissions relations (Story 2-5 foundation, enhanced in Story 3.4)
export const submissionsRelations = relations(submissions, ({ one }) => ({
  respondent: one(respondents, {
    fields: [submissions.respondentId],
    references: [respondents.id],
  }),
}));

// Respondents relations (Story 3.4)
export const respondentsRelations = relations(respondents, ({ many }) => ({
  submissions: many(submissions),
}));
