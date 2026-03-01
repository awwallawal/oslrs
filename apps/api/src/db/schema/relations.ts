import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { roles } from './roles.js';
import { lgas } from './lgas.js';
import { questionnaireForms, questionnaireFiles, questionnaireVersions } from './questionnaires.js';
import { submissions } from './submissions.js';
import { respondents } from './respondents.js';
import { teamAssignments } from './team-assignments.js';
import { messages, messageReceipts } from './messages.js';
import { fraudDetections } from './fraud-detections.js';
import { dailyProductivitySnapshots } from './daily-productivity-snapshots.js';
import { productivityTargets } from './productivity-targets.js';
import { paymentBatches, paymentRecords, paymentFiles, paymentDisputes } from './remuneration.js';

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
  // prep-8: Team assignments from supervisor perspective
  supervisedTeamMembers: many(teamAssignments, { relationName: 'supervisorAssignments' }),
  // prep-8: Team assignments from enumerator perspective
  enumeratorAssignments: many(teamAssignments, { relationName: 'enumeratorAssignments' }),
  // Story 4.2: Messages sent by this user
  sentMessages: many(messages, { relationName: 'messageSender' }),
  // Story 4.2: Direct messages received by this user
  receivedMessages: many(messages, { relationName: 'messageRecipient' }),
  // Story 4.2: Message receipts for this user
  messageReceipts: many(messageReceipts, { relationName: 'receiptRecipient' }),
  // Story 4.4: Fraud detections where this user is the enumerator
  fraudDetectionsAsEnumerator: many(fraudDetections, { relationName: 'detectionEnumerator' }),
  // Story 4.4: Fraud detections reviewed by this user
  fraudDetectionsAsReviewer: many(fraudDetections, { relationName: 'detectionReviewer' }),
  // Story 6.4: Payment records for this user
  paymentRecords: many(paymentRecords, { relationName: 'paymentRecordUser' }),
  // Story 6.4: Payment batches recorded by this user (admin)
  recordedPaymentBatches: many(paymentBatches, { relationName: 'batchRecordedBy' }),
  // Story 6.5: Disputes opened by this user (staff)
  openedDisputes: many(paymentDisputes, { relationName: 'disputeOpenedBy' }),
  // Story 6.5: Disputes resolved by this user (admin)
  resolvedDisputes: many(paymentDisputes, { relationName: 'disputeResolvedBy' }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const lgasRelations = relations(lgas, ({ many }) => ({
  users: many(users),
}));

// Team assignment relations (prep-8)
export const teamAssignmentsRelations = relations(teamAssignments, ({ one }) => ({
  supervisor: one(users, {
    fields: [teamAssignments.supervisorId],
    references: [users.id],
    relationName: 'supervisorAssignments',
  }),
  enumerator: one(users, {
    fields: [teamAssignments.enumeratorId],
    references: [users.id],
    relationName: 'enumeratorAssignments',
  }),
  lga: one(lgas, {
    fields: [teamAssignments.lgaId],
    references: [lgas.id],
  }),
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

// Message relations (Story 4.2)
export const messagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: 'messageSender',
  }),
  recipient: one(users, {
    fields: [messages.recipientId],
    references: [users.id],
    relationName: 'messageRecipient',
  }),
  lga: one(lgas, {
    fields: [messages.lgaId],
    references: [lgas.id],
  }),
  receipts: many(messageReceipts),
}));

// Message receipt relations (Story 4.2)
export const messageReceiptsRelations = relations(messageReceipts, ({ one }) => ({
  message: one(messages, {
    fields: [messageReceipts.messageId],
    references: [messages.id],
  }),
  recipient: one(users, {
    fields: [messageReceipts.recipientId],
    references: [users.id],
    relationName: 'receiptRecipient',
  }),
}));

// Daily productivity snapshot relations (Story 5.6a)
export const dailyProductivitySnapshotsRelations = relations(dailyProductivitySnapshots, ({ one }) => ({
  user: one(users, {
    fields: [dailyProductivitySnapshots.userId],
    references: [users.id],
  }),
}));

// Productivity target relations (Story 5.6a)
// No FK constraints (lgaId is text code, createdBy is optional)
export const productivityTargetsRelations = relations(productivityTargets, () => ({}));

// Fraud detection relations (Story 4.4)
// Dual-FK pattern: enumeratorId + reviewedBy both reference users
export const fraudDetectionsRelations = relations(fraudDetections, ({ one }) => ({
  enumerator: one(users, {
    fields: [fraudDetections.enumeratorId],
    references: [users.id],
    relationName: 'detectionEnumerator',
  }),
  reviewer: one(users, {
    fields: [fraudDetections.reviewedBy],
    references: [users.id],
    relationName: 'detectionReviewer',
  }),
  submission: one(submissions, {
    fields: [fraudDetections.submissionId],
    references: [submissions.id],
  }),
}));

// Payment batch relations (Story 6.4)
export const paymentBatchesRelations = relations(paymentBatches, ({ one, many }) => ({
  recordedByUser: one(users, {
    fields: [paymentBatches.recordedBy],
    references: [users.id],
    relationName: 'batchRecordedBy',
  }),
  records: many(paymentRecords),
}));

// Payment record relations (Story 6.4, extended Story 6.5)
export const paymentRecordsRelations = relations(paymentRecords, ({ one, many }) => ({
  batch: one(paymentBatches, {
    fields: [paymentRecords.batchId],
    references: [paymentBatches.id],
  }),
  user: one(users, {
    fields: [paymentRecords.userId],
    references: [users.id],
    relationName: 'paymentRecordUser',
  }),
  // Story 6.5: Disputes on this payment record
  disputes: many(paymentDisputes),
}));

// Payment file relations (Story 6.4)
// entityId is polymorphic (batch or dispute) — no FK constraint
export const paymentFilesRelations = relations(paymentFiles, ({ one }) => ({
  uploadedByUser: one(users, {
    fields: [paymentFiles.uploadedBy],
    references: [users.id],
  }),
}));

// Payment dispute relations (Story 6.5)
export const paymentDisputesRelations = relations(paymentDisputes, ({ one }) => ({
  paymentRecord: one(paymentRecords, {
    fields: [paymentDisputes.paymentRecordId],
    references: [paymentRecords.id],
  }),
  openedByUser: one(users, {
    fields: [paymentDisputes.openedBy],
    references: [users.id],
    relationName: 'disputeOpenedBy',
  }),
  resolvedByUser: one(users, {
    fields: [paymentDisputes.resolvedBy],
    references: [users.id],
    relationName: 'disputeResolvedBy',
  }),
  evidenceFile: one(paymentFiles, {
    fields: [paymentDisputes.evidenceFileId],
    references: [paymentFiles.id],
  }),
}));
