/**
 * Audit action constants for consistent logging across the application.
 * Per ADR-006: All security-relevant actions must be audited.
 */

// User lifecycle actions
export const AUDIT_ACTION_USER_ACTIVATED = 'user.activated';
export const AUDIT_ACTION_USER_CREATE = 'user.create';
export const AUDIT_ACTION_USER_ODK_APP_USER_PROVISIONED = 'user.odk_app_user_provisioned';

// Authentication actions
export const AUDIT_ACTION_AUTH_LOGIN_SUCCESS = 'auth.login_success';
export const AUDIT_ACTION_AUTH_LOGOUT = 'auth.logout';
export const AUDIT_ACTION_AUTH_REGISTRATION_SUCCESS = 'auth.registration_success';
export const AUDIT_ACTION_AUTH_EMAIL_VERIFICATION_SUCCESS = 'auth.email_verification_success';

// Invitation actions
export const AUDIT_ACTION_INVITATION_RESEND = 'invitation.resend';

// Questionnaire actions
export const AUDIT_ACTION_QUESTIONNAIRE_UPLOAD = 'questionnaire.upload';
export const AUDIT_ACTION_QUESTIONNAIRE_STATUS_CHANGE = 'questionnaire.status_change';
export const AUDIT_ACTION_QUESTIONNAIRE_DELETE = 'questionnaire.delete';
export const AUDIT_ACTION_QUESTIONNAIRE_PUBLISH_TO_ODK = 'questionnaire.publish_to_odk';

// Email actions
export const AUDIT_ACTION_EMAIL_DELIVERY_FAILED = 'email.delivery.failed';
