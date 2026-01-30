/**
 * Mock Server State Management
 *
 * Manages in-memory state for the MSW mock ODK Central server.
 * Includes form registry, request logging, error injection, and credential management.
 *
 * @module msw/server-state
 */

export interface LoggedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  query?: Record<string, string>;
  contentTypeWarning?: string;
  timestamp?: string;
}

export interface MockForm {
  xmlFormId: string;
  projectId: number;
  name: string;
  version: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface MockAppUser {
  id: number;
  type: 'field_key';
  displayName: string;
  token: string;
  projectId: number;
  createdAt: string;
}

export interface MockSubmission {
  instanceId: string;
  submitterId: number;
  createdAt: string;
  updatedAt: string;
  reviewState?: string;
}

export interface InjectedError {
  status: number;
  code: number | string;
  message: string;
}

interface Credentials {
  email: string;
  password: string;
}

/**
 * MockServerState - Singleton class managing all mock server state
 *
 * Features:
 * - Form registry (tracks which forms exist for 409 responses)
 * - Request logging (for test assertions)
 * - Error injection (programmable failures per-test)
 * - Credential management (configurable valid credentials)
 * - Session token generation
 */
class MockServerState {
  private forms: Map<string, MockForm> = new Map();
  private formDrafts: Set<string> = new Set();
  private appUsers: Map<number, MockAppUser> = new Map();
  private requestLog: LoggedRequest[] = [];
  private nextError: InjectedError | null = null;
  private validCredentials: Credentials = {
    email: 'admin@example.com',
    password: 'secret123',
  };
  private sessionCounter = 0;
  private appUserIdCounter = 100; // Start at 100 to distinguish from other IDs

  // Health monitoring state (Story 2-5)
  private submissionCounts: Map<string, number> = new Map();
  private submissions: Map<string, MockSubmission[]> = new Map();
  private connectivityEnabled = true;
  private simulatedLatencyMs = 0;

  /**
   * Reset all state - call in beforeEach to ensure test isolation
   */
  reset(): void {
    this.forms.clear();
    this.formDrafts.clear();
    this.appUsers.clear();
    this.requestLog = [];
    this.nextError = null;
    this.sessionCounter = 0;
    this.appUserIdCounter = 100;
    // Health monitoring state reset
    this.submissionCounts.clear();
    this.submissions.clear();
    this.connectivityEnabled = true;
    this.simulatedLatencyMs = 0;
    // Keep credentials as configured
  }

  // =====================
  // Form State Management
  // =====================

  /**
   * Check if a form exists in the registry
   */
  formExists(xmlFormId: string): boolean {
    return this.forms.has(xmlFormId);
  }

  /**
   * Add a form to the registry
   */
  addForm(xmlFormId: string, form: MockForm): void {
    this.forms.set(xmlFormId, form);
  }

  /**
   * Get a form from the registry
   */
  getForm(xmlFormId: string): MockForm | undefined {
    return this.forms.get(xmlFormId);
  }

  /**
   * Update an existing form
   */
  updateForm(xmlFormId: string, form: MockForm): void {
    this.forms.set(xmlFormId, form);
  }

  /**
   * Pre-register a form as existing (for triggering 409 responses)
   */
  preRegisterForm(xmlFormId: string, projectId: number = 1): void {
    const now = new Date().toISOString();
    this.forms.set(xmlFormId, {
      xmlFormId,
      projectId,
      name: xmlFormId,
      version: '1.0.0',
      state: 'open',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    });
  }

  /**
   * Check if form has a pending draft
   */
  hasFormDraft(xmlFormId: string): boolean {
    return this.formDrafts.has(xmlFormId);
  }

  /**
   * Set form draft status
   */
  setFormDraft(xmlFormId: string, hasDraft: boolean): void {
    if (hasDraft) {
      this.formDrafts.add(xmlFormId);
    } else {
      this.formDrafts.delete(xmlFormId);
    }
  }

  // =======================
  // Request Logging (AC: 6)
  // =======================

  /**
   * Log an incoming request for later assertion
   */
  logRequest(request: Omit<LoggedRequest, 'timestamp'>): void {
    this.requestLog.push({
      ...request,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all logged requests
   */
  getRequests(): LoggedRequest[] {
    return [...this.requestLog];
  }

  /**
   * Get the last logged request
   */
  getLastRequest(): LoggedRequest | undefined {
    return this.requestLog[this.requestLog.length - 1];
  }

  /**
   * Get requests filtered by path
   */
  getRequestsByPath(pathPattern: string | RegExp): LoggedRequest[] {
    return this.requestLog.filter((req) => {
      if (typeof pathPattern === 'string') {
        return req.path.includes(pathPattern);
      }
      return pathPattern.test(req.path);
    });
  }

  /**
   * Get requests filtered by method
   */
  getRequestsByMethod(method: string): LoggedRequest[] {
    return this.requestLog.filter((req) => req.method === method.toUpperCase());
  }

  /**
   * Clear all logged requests
   */
  clearRequests(): void {
    this.requestLog = [];
  }

  // ========================
  // Error Injection (AC: 5)
  // ========================

  /**
   * Configure the next request to fail with a specific error
   *
   * @example
   * mockServerState.setNextError(500, 'INTERNAL_ERROR', 'Database unavailable');
   * // Next request to any endpoint will return 500
   */
  setNextError(status: number, code: number | string, message: string): void {
    this.nextError = { status, code, message };
  }

  /**
   * Consume and return the next error (if configured)
   * Returns null if no error was configured
   */
  consumeNextError(): InjectedError | null {
    const error = this.nextError;
    this.nextError = null;
    return error;
  }

  // =========================
  // App User State Management
  // =========================

  /**
   * Create a new App User and return the response
   */
  createAppUser(projectId: number, displayName: string): MockAppUser {
    const id = this.appUserIdCounter++;
    const now = new Date().toISOString();
    // Generate a mock token (64-character hex string like real ODK)
    const token = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const appUser: MockAppUser = {
      id,
      type: 'field_key',
      displayName,
      token,
      projectId,
      createdAt: now,
    };

    this.appUsers.set(id, appUser);
    return appUser;
  }

  /**
   * Get all App Users for a project
   */
  getAppUsers(projectId?: number): MockAppUser[] {
    const allUsers = Array.from(this.appUsers.values());
    if (projectId === undefined) return allUsers;
    return allUsers.filter((u) => u.projectId === projectId);
  }

  /**
   * Get an App User by ID
   */
  getAppUser(id: number): MockAppUser | undefined {
    return this.appUsers.get(id);
  }

  // ======================
  // Credential Management
  // ======================

  /**
   * Set valid credentials for authentication
   */
  setValidCredentials(email: string, password: string): void {
    this.validCredentials = { email, password };
  }

  /**
   * Get current valid credentials
   */
  getValidCredentials(): Credentials {
    return { ...this.validCredentials };
  }

  // ===================
  // Session Management
  // ===================

  /**
   * Generate a unique session token
   */
  generateSessionToken(): string {
    this.sessionCounter++;
    return `mock-session-token-${this.sessionCounter}-${Date.now()}`;
  }

  // ================================
  // Health Monitoring State (AC: 7)
  // ================================

  /**
   * Set submission count for a form (for health monitoring tests)
   */
  setSubmissionCount(xmlFormId: string, count: number): void {
    this.submissionCounts.set(xmlFormId, count);
  }

  /**
   * Get submission count for a form
   */
  getSubmissionCount(xmlFormId: string): number {
    return this.submissionCounts.get(xmlFormId) ?? 0;
  }

  /**
   * Enable/disable connectivity simulation
   */
  setConnectivityStatus(reachable: boolean): void {
    this.connectivityEnabled = reachable;
  }

  /**
   * Check if connectivity is enabled
   */
  isConnectivityEnabled(): boolean {
    return this.connectivityEnabled;
  }

  /**
   * Set simulated latency for requests
   */
  simulateLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  /**
   * Get simulated latency
   */
  getSimulatedLatency(): number {
    return this.simulatedLatencyMs;
  }

  /**
   * Get all forms for a specific project
   */
  getFormsForProject(projectId: number): MockForm[] {
    return Array.from(this.forms.values()).filter(
      (form) => form.projectId === projectId
    );
  }

  /**
   * Bulk set forms for a project (clears existing forms for that project first)
   */
  setFormsForProject(projectId: number, forms: Array<{ xmlFormId: string; name: string; state: string }>): void {
    // Remove existing forms for this project
    for (const [key, form] of this.forms.entries()) {
      if (form.projectId === projectId) {
        this.forms.delete(key);
      }
    }

    // Add new forms
    const now = new Date().toISOString();
    for (const form of forms) {
      this.forms.set(form.xmlFormId, {
        xmlFormId: form.xmlFormId,
        projectId,
        name: form.name,
        version: '1.0.0',
        state: form.state,
        createdAt: now,
        updatedAt: now,
        publishedAt: form.state === 'open' ? now : undefined,
      });
    }
  }

  /**
   * Set submissions for a form
   */
  setSubmissions(xmlFormId: string, submissions: MockSubmission[]): void {
    this.submissions.set(xmlFormId, submissions);
    // Also update submission count to match
    this.submissionCounts.set(xmlFormId, submissions.length);
  }

  /**
   * Get submissions for a form
   */
  getSubmissions(xmlFormId: string): MockSubmission[] {
    return this.submissions.get(xmlFormId) ?? [];
  }

  /**
   * Get submissions for a form after a specific date
   */
  getSubmissionsAfter(xmlFormId: string, afterDate: string): MockSubmission[] {
    const allSubmissions = this.submissions.get(xmlFormId) ?? [];
    const afterTime = new Date(afterDate).getTime();
    return allSubmissions.filter(
      (sub) => new Date(sub.createdAt).getTime() > afterTime
    );
  }
}

/**
 * Singleton instance of MockServerState
 *
 * Import this in handlers and tests to share state
 */
export const mockServerState = new MockServerState();
