/**
 * Centralized Application Error Model and API Error Handling Utilities
 * 
 * Provides:
 * 1. AppError class for operational/business errors (user-visible, explicit status and code)
 * 2. Distinction between expected operational errors and unexpected infrastructure errors
 * 3. Request sanitization to prevent leaking secrets, credentials, tokens, or personal data
 * 4. Request/correlation ID resolution and propagation
 * 5. Secure Express handleApiError handler
 * 6. Secure Cloudflare Worker handleWorkerApiError handler
 */

import crypto from 'node:crypto';
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { logApiError } from './db/errorLogs.js';

// Re-export logApiError for callers
export { logApiError } from './db/errorLogs.js';

/**
 * Standard Application Error class for expected operational/business errors.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly isOperational: boolean;
  public readonly service?: string;
  public readonly metadata?: Record<string, any>;

  constructor(
    message: string,
    statusCode = 400,
    code?: string,
    optionsOrIsOperational?: boolean | { isOperational?: boolean; service?: string; metadata?: Record<string, any> } | Record<string, any>,
    service?: string,
    metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;

    if (typeof optionsOrIsOperational === 'boolean') {
      this.isOperational = optionsOrIsOperational;
      this.service = service;
      this.metadata = metadata;
    } else if (optionsOrIsOperational && typeof optionsOrIsOperational === 'object') {
      if ('isOperational' in optionsOrIsOperational || 'service' in optionsOrIsOperational || 'metadata' in optionsOrIsOperational) {
        this.isOperational = (optionsOrIsOperational as any).isOperational ?? true;
        this.service = (optionsOrIsOperational as any).service ?? service;
        this.metadata = (optionsOrIsOperational as any).metadata ?? (optionsOrIsOperational as any);
      } else {
        this.isOperational = true;
        this.service = service;
        this.metadata = optionsOrIsOperational as Record<string, any>;
      }
    } else {
      this.isOperational = true;
      this.service = service;
      this.metadata = metadata;
    }

    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ----------------------------------------------------------------------------
// Concrete Operational Error Subclasses
// ----------------------------------------------------------------------------

export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST', metadata?: Record<string, any>) {
    super(message, 400, code, true, 'validation', metadata);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', metadata?: Record<string, any>) {
    super(message, 401, code, true, 'authentication', metadata);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', metadata?: Record<string, any>) {
    super(message, 403, code, true, 'authorization', metadata);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', metadata?: Record<string, any>) {
    super(message, 404, code, true, 'resource', metadata);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT', metadata?: Record<string, any>) {
    super(message, 409, code, true, 'business_logic', metadata);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR', metadata?: Record<string, any>) {
    super(message, 422, code, true, 'validation', metadata);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.', code = 'RATE_LIMITED', metadata?: Record<string, any>) {
    super(message, 429, code, true, 'rate_limiter', metadata);
    this.name = 'RateLimitError';
  }
}

export class InternalInfrastructureError extends AppError {
  constructor(message = 'Internal server error', service = 'unknown', metadata?: Record<string, any>) {
    super(message, 500, 'INTERNAL_ERROR', false, service, metadata);
    this.name = 'InternalInfrastructureError';
  }
}

// ----------------------------------------------------------------------------
// Error Classification & Service Detection
// ----------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'private_key',
  'stripe_secret',
  'stripe_key',
  'hitpay_key',
  'resend_key',
  'jwt_secret',
  'service_role_key',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'idtoken',
  'id_token',
  'rawbody',
  'body_raw',
  'session_token',
  'client_id',
  'refresh_token_encrypted',
];

/**
 * Checks if a given field key represents sensitive data that must be redacted.
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return SENSITIVE_KEY_PATTERNS.some(pattern => lower === pattern || lower.includes(pattern));
}

/**
 * Deeply sanitizes an arbitrary object, map, or array by replacing sensitive values with '[REDACTED]'.
 */
export function sanitizeData<T = any>(value: T, depth = 0): T {
  if (depth > 6) return '[MAX_DEPTH]' as any;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Redact JWT tokens (header.payload.signature)
    if (/^[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}$/.test(value)) {
      return '[REDACTED_JWT]' as any;
    }
    // Redact Bearer authorization values
    if (/^Bearer\s+[A-Za-z0-9-_.]+/i.test(value)) {
      return 'Bearer [REDACTED]' as any;
    }
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeData(item, depth + 1)) as any;
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = sanitizeData(v, depth + 1);
    }
  }
  return result as T;
}

/**
 * Sanitizes HTTP headers for logging. Strips cookie and authorization tokens.
 */
export function sanitizeHeaders(headers: Record<string, any> | Headers | undefined): Record<string, string> {
  if (!headers) return {};
  const sanitized: Record<string, string> = {};

  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, key) => {
      const lower = key.toLowerCase();
      if (isSensitiveKey(lower)) {
        sanitized[lower] = '[REDACTED]';
      } else {
        sanitized[lower] = value;
      }
    });
    return sanitized;
  }

  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (isSensitiveKey(lower)) {
      sanitized[lower] = '[REDACTED]';
    } else if (typeof val === 'string') {
      sanitized[lower] = val;
    } else if (Array.isArray(val)) {
      sanitized[lower] = val.join(', ');
    } else if (val !== undefined && val !== null) {
      sanitized[lower] = String(val);
    }
  }

  return sanitized;
}

/**
 * Detects the service origin of an error for classification.
 */
export function detectErrorService(err: any, endpoint?: string): string {
  if (err instanceof AppError && err.service) {
    return err.service;
  }

  const msg = (err?.message || '').toLowerCase();
  const stack = (err?.stack || '').toLowerCase();
  const code = (err?.code || '').toString().toLowerCase();

  if (
    msg.includes('supabase') ||
    msg.includes('pgrst') ||
    code.startsWith('pgrst') ||
    stack.includes('@supabase')
  ) {
    return 'supabase';
  }

  if (
    code.startsWith('23') ||
    code.startsWith('42') ||
    msg.includes('postgres') ||
    msg.includes('relation') ||
    msg.includes('constraint') ||
    msg.includes('violates') ||
    msg.includes('column') ||
    stack.includes('postgres')
  ) {
    return 'postgres';
  }

  if (
    msg.includes('stripe') ||
    msg.includes('payment_intent') ||
    msg.includes('checkout_session') ||
    msg.includes('payment_method') ||
    err?.type?.includes('Stripe') ||
    stack.includes('stripe')
  ) {
    return 'stripe';
  }

  if (
    msg.includes('storage') ||
    msg.includes('bucket') ||
    msg.includes('s3') ||
    msg.includes('r2')
  ) {
    return 'storage';
  }

  if (
    msg.includes('rpc') ||
    msg.includes('function') ||
    msg.includes('atomic')
  ) {
    return 'rpc';
  }

  if (
    endpoint?.includes('/auth') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('token')
  ) {
    return 'authentication';
  }

  if (
    msg.includes('validation') ||
    msg.includes('invalid') ||
    msg.includes('required')
  ) {
    return 'validation';
  }

  return 'unknown';
}

/**
 * Checks whether an error is an expected business/operational error that can be safely presented to users.
 */
export function isOperationalError(err: any): boolean {
  if (!err) return false;

  const msg = (err?.message || (typeof err === 'string' ? err : '')).toLowerCase();
  const code = String(err?.code || '');

  // 0. Explicit operational business errors (bypass internal DB and trigger sanitization filters)
  if (
    code === 'PENDING_EVENT_LIMIT_REACHED' ||
    msg.includes('pending_event_limit_reached') ||
    msg.includes('maximum 2 pending payment events reached')
  ) {
    return true;
  }

  const isAuthMessage =
    msg.includes('bearer token') ||
    msg.includes('missing token') ||
    msg.includes('invalid token') ||
    msg.includes('token expired') ||
    msg.includes('expired token') ||
    msg.includes('token required') ||
    msg.includes('csrf token') ||
    msg.includes('session token') ||
    msg.includes('refresh token') ||
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt');

  // 1. Strict sanitization: reject any error matching internal database error codes (SQLSTATE, PGRST, etc.)
  if (
    code.startsWith('23') || // PostgreSQL Class 23: Integrity Constraint Violation (23505 unique, 23503 foreign key, 23502 not null, 23514 check)
    code.startsWith('42') || // PostgreSQL Class 42: Syntax Error or Access Rule Violation (42501 insufficient privilege, 42P01 undefined table, 42703 undefined column)
    code.startsWith('08') || // PostgreSQL Class 08: Connection Exception
    code.startsWith('P0') || // PostgreSQL Class P0: PL/pgSQL Error
    code.startsWith('XX') || // PostgreSQL Class XX: Internal Error
    code.startsWith('53') || // PostgreSQL Class 53: Insufficient Resources
    code.startsWith('54') || // PostgreSQL Class 54: Program Limit Exceeded
    code.startsWith('57') || // PostgreSQL Class 57: Operator Intervention (57014 statement timeout)
    code.startsWith('58') || // PostgreSQL Class 58: System Error
    code.startsWith('PGRST') || // PostgREST errors (PGRST116, PGRST301, etc.)
    code.startsWith('auth-') ||
    code.startsWith('auth/')
  ) {
    return false;
  }

  // 2. Reject if error contains Postgres/Supabase driver internal metadata
  if (
    typeof err?.routine === 'string' ||
    typeof err?.schema === 'string' ||
    typeof err?.table === 'string' ||
    typeof err?.column === 'string' ||
    typeof err?.constraint === 'string' ||
    typeof err?.internalQuery === 'string' ||
    typeof err?.internalPosition === 'string' ||
    typeof err?.where === 'string'
  ) {
    return false;
  }

  // 3. Strict sanitization: reject any error message containing internal database, SQL, or infrastructure leaks
  if (
    (/\brelation\b/i.test(msg) && !msg.includes('correlation')) ||
    msg.includes('syntax error') ||
    /\bcolumn\b/i.test(msg) ||
    /\bschema\b/i.test(msg) ||
    (/\btable\b/i.test(msg) && !msg.includes('immutable')) ||
    msg.includes('violates') ||
    msg.includes('constraint') ||
    msg.includes('permission denied for') ||
    (msg.includes('permission denied') && (msg.includes('table') || msg.includes('relation') || msg.includes('schema') || msg.includes('sequence') || msg.includes('database'))) ||
    msg.includes('row-level security') ||
    msg.includes('postgresql') ||
    msg.includes('postgres') ||
    msg.includes('supabase') ||
    msg.includes('pgrst') ||
    msg.includes('postgrest') ||
    msg.includes('duplicate key') ||
    msg.includes('foreign key') ||
    msg.includes('unique constraint') ||
    msg.includes('check constraint') ||
    msg.includes('not-null constraint') ||
    msg.includes('null value in') ||
    msg.includes('already exists') ||
    msg.includes('database error') ||
    msg.includes('cannot read properties') ||
    msg.includes('undefined is not') ||
    msg.includes('is not a function') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('statement timeout') ||
    msg.includes('deadlock') ||
    msg.includes('terminating connection') ||
    msg.includes('could not connect') ||
    msg.includes('connection refused') ||
    (msg.includes('jwt') && !isAuthMessage) ||
    msg.includes('secret') ||
    (msg.includes('token') && !isAuthMessage) ||
    msg.includes('apikey') ||
    msg.includes('service_role') ||
    msg.includes('internal server error') ||
    msg.includes('sql') ||
    msg.includes('plpgsql') ||
    msg.includes('query execution')
  ) {
    return false;
  }

  if (err instanceof AppError) {
    return err.isOperational;
  }

  // Certain status codes on custom errors indicate operational business exceptions (400 - 499)
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) {
    return true;
  }

  // Known application-level business error codes that are safe to expose
  if (
    code.endsWith('_NOT_FOUND') ||
    code === 'INVALID_STATUS_TRANSITION' ||
    code === 'REJECTION_REASON_REQUIRED' ||
    code === 'INSUFFICIENT_BALANCE' ||
    code === 'PENDING_EVENT_LIMIT_REACHED' ||
    code === 'THEME_GAME_MISMATCH' ||
    code === 'GAME_INACTIVE' ||
    code === 'GAME_CONFLICT' ||
    code === 'GAME_IN_USE' ||
    code === 'GAME_TYPE_ALREADY_REGISTERED' ||
    code === 'GAME_SLUG_ALREADY_REGISTERED' ||
    code === 'UNSUPPORTED_FILE_TYPE' ||
    code === 'DIRECT_UPLOAD_SIZE_EXCEEDED' ||
    code === 'FILE_TOO_LARGE' ||
    code === 'INVALID_FILE_TYPE' ||
    code === 'MALICIOUS_SVG_DETECTED' ||
    code === 'INVALID_AMOUNT' ||
    code === 'INVALID_CURRENCY' ||
    code === 'INVALID_PAYMENT_METHOD' ||
    code === 'INVALID_PAYMENT_MODE' ||
    code === 'INVALID_SIGNATURE' ||
    code === 'WEBHOOK_VERIFICATION_FAILED' ||
    code === 'SCORE_SUBMISSION_ERROR' ||
    code === 'DUPLICATE_ORDER' ||
    code === 'ORGANIZATION_NOT_FOUND' ||
    code === 'THEME_NOT_FOUND' ||
    code === 'EVENT_NOT_FOUND' ||
    code === 'GAME_NOT_FOUND' ||
    code === 'SHOWCASE_NOT_FOUND'
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves or creates a secure request/correlation ID.
 */
export function resolveCorrelationId(reqHeadersOrRequest: any): string {
  if (!reqHeadersOrRequest) {
    return crypto.randomUUID();
  }

  // Fetch Request instance
  if (typeof reqHeadersOrRequest.headers?.get === 'function') {
    const correlation =
      reqHeadersOrRequest.headers.get('x-correlation-id') ||
      reqHeadersOrRequest.headers.get('x-request-id');
    if (correlation && typeof correlation === 'string' && correlation.trim()) {
      return correlation.trim();
    }
    return crypto.randomUUID();
  }

  // Express request object or raw headers
  const headers = reqHeadersOrRequest.headers || reqHeadersOrRequest;
  const correlation =
    headers['x-correlation-id'] ||
    headers['x-request-id'] ||
    reqHeadersOrRequest.id;

  if (correlation && typeof correlation === 'string' && correlation.trim()) {
    return correlation.trim();
  }

  return crypto.randomUUID();
}

// ----------------------------------------------------------------------------
// Express Handler: handleApiError
// ----------------------------------------------------------------------------

export interface HandleApiErrorOptions {
  userId?: string;
  endpoint?: string;
  method?: string;
  metadata?: Record<string, any>;
}

/**
 * Central Express API error handler.
 * Safely sanitizes errors, prevents leaking internal infrastructure details,
 * logs detailed error information to database & console, and returns a safe response.
 */
export function handleApiError(
  err: any,
  req: ExpressRequest,
  res: ExpressResponse,
  options?: HandleApiErrorOptions
): void {
  const requestId =
    (req as any).id ||
    resolveCorrelationId(req);

  res.setHeader('x-correlation-id', requestId);

  const isOperational = isOperationalError(err);
  const detectedService = detectErrorService(err, req.originalUrl || req.url);

  const isPendingLimit =
    String(err?.code || '') === 'PENDING_EVENT_LIMIT_REACHED' ||
    String(err?.message || '').toLowerCase().includes('pending_event_limit_reached') ||
    String(err?.message || '').toLowerCase().includes('maximum 2 pending payment events reached');

  let statusCode = Number(err?.statusCode || err?.status);
  if (!statusCode || statusCode < 400 || statusCode > 599) {
    if (isPendingLimit) {
      statusCode = 422;
    } else if (isOperational) {
      const code = String(err?.code || '');
      if (code.endsWith('_NOT_FOUND')) {
        statusCode = 404;
      } else if (
        code === 'GAME_CONFLICT' ||
        code === 'GAME_IN_USE' ||
        code === 'GAME_TYPE_ALREADY_REGISTERED' ||
        code === 'GAME_SLUG_ALREADY_REGISTERED' ||
        code === 'DUPLICATE_ORDER'
      ) {
        statusCode = 409;
      } else if (code === 'INSUFFICIENT_BALANCE') {
        statusCode = 402;
      } else if (code === 'DIRECT_UPLOAD_SIZE_EXCEEDED' || code === 'FILE_TOO_LARGE') {
        statusCode = 413;
      } else if (
        code === 'THEME_SETUP_REQUIRED' ||
        code === 'REJECTION_REASON_REQUIRED' ||
        code === 'PENDING_EVENT_LIMIT_REACHED' ||
        code === 'THEME_GAME_MISMATCH' ||
        code === 'GAME_INACTIVE' ||
        code === 'UNSUPPORTED_FILE_TYPE' ||
        code === 'INVALID_FILE_TYPE' ||
        code === 'MALICIOUS_SVG_DETECTED' ||
        code === 'INVALID_AMOUNT' ||
        code === 'INVALID_CURRENCY' ||
        code === 'INVALID_PAYMENT_METHOD' ||
        code === 'INVALID_PAYMENT_MODE'
      ) {
        statusCode = 422;
      } else {
        statusCode = 400;
      }
    } else {
      statusCode = 500;
    }
  }

  const userId = options?.userId || (req as any).user?.id || (req as any).userId || null;
  const endpoint = options?.endpoint || req.originalUrl || req.baseUrl || req.path || '/api';
  const method = options?.method || req.method || 'GET';

  // 1. Operational / Safe Business Error
  if (isOperational && statusCode < 500) {
    const errorCode = isPendingLimit
      ? 'PENDING_EVENT_LIMIT_REACHED'
      : (err?.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST'));
    const errorMessage = isPendingLimit
      ? 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.'
      : (err.message || 'Bad Request');
    res.status(statusCode).json({
      error: errorMessage,
      code: errorCode,
      ...(err.code === 'THEME_SETUP_REQUIRED' || err.theme_setup_required ? { theme_setup_required: true } : {}),
      ...(err.code === 'INSUFFICIENT_BALANCE' ? {
        ...(err.required !== undefined ? { required: err.required } : {}),
        ...(err.available !== undefined ? { available: err.available } : {}),
        ...(err.shortfall !== undefined ? { shortfall: err.shortfall } : {}),
      } : {}),
      ...(err.eligibility ? { eligibility: err.eligibility } : {}),
      ...(err.metadata ? { metadata: sanitizeData(err.metadata) } : {}),
    });
    return;
  }

  // 2. Unexpected / Infrastructure Error (HTTP 500 or unhandled failure)
  // Format structured log for server observability
  const structuredLog = {
    level: 'error',
    requestId,
    service: detectedService,
    endpoint,
    method,
    statusCode: 500,
    errorType: err?.name || 'Error',
    errorCode: err?.code || 'INTERNAL_ERROR',
    message: err?.message || 'Unknown internal error',
    userId,
  };
  console.error(`[API Error][${requestId}]:`, JSON.stringify(structuredLog));
  if (err?.stack) {
    console.error(`[API Error Stack][${requestId}]:`, err.stack);
  }

  // Persist to database asynchronously (fail-safe)
  logApiError({
    request_id: requestId,
    user_id: userId,
    method,
    endpoint,
    status_code: 500,
    error_type: err?.name || 'Error',
    error_code: err?.code ? String(err.code) : 'INTERNAL_SERVER_ERROR',
    error_message: err?.message || 'Unknown internal server error',
    stack_trace: err?.stack || null,
    service: detectedService,
    metadata: {
      headers: sanitizeHeaders(req.headers),
      query: sanitizeData(req.query),
      body: sanitizeData(req.body),
      ...sanitizeData(options?.metadata || {}),
    },
  }).catch(loggingErr => {
    console.error('[ErrorLogger] Failed to persist error log in handleApiError:', loggingErr);
  });

  // Client response: strictly generic internal server error + requestId
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
    requestId,
  });
}

// ----------------------------------------------------------------------------
// Cloudflare Worker Handler: handleWorkerApiError
// ----------------------------------------------------------------------------

export interface WorkerErrorOptions {
  endpoint?: string;
  method?: string;
  userId?: string;
  metadata?: Record<string, any>;
  parsedBody?: any;
}

/**
 * Central Cloudflare Worker API error handler.
 */
export async function handleWorkerApiError(
  err: any,
  request: globalThis.Request,
  corsOrEnv?: Record<string, string> | any,
  envOrCors?: any,
  options?: WorkerErrorOptions
): Promise<globalThis.Response> {
  // Disambiguate cors vs env
  let cors: Record<string, string> = {};
  let env: any = undefined;

  if (corsOrEnv && (corsOrEnv['Access-Control-Allow-Origin'] !== undefined || corsOrEnv['Access-Control-Allow-Methods'] !== undefined)) {
    cors = corsOrEnv;
    env = envOrCors;
  } else if (envOrCors && (envOrCors['Access-Control-Allow-Origin'] !== undefined || envOrCors['Access-Control-Allow-Methods'] !== undefined)) {
    cors = envOrCors;
    env = corsOrEnv;
  } else if (corsOrEnv && (corsOrEnv.SUPABASE_URL || corsOrEnv.SUPABASE_SERVICE_ROLE_KEY || corsOrEnv.NODE_ENV)) {
    env = corsOrEnv;
    cors = (envOrCors && typeof envOrCors === 'object') ? envOrCors : {};
  } else if (corsOrEnv && typeof corsOrEnv === 'object') {
    cors = corsOrEnv;
    env = envOrCors;
  }

  const requestId = resolveCorrelationId(request);
  const isOperational = isOperationalError(err);
  const url = new URL(request.url);
  const endpoint = options?.endpoint || url.pathname;
  const method = options?.method || request.method;
  const detectedService = detectErrorService(err, endpoint);

  const isPendingLimit =
    String(err?.code || '') === 'PENDING_EVENT_LIMIT_REACHED' ||
    String(err?.message || '').toLowerCase().includes('pending_event_limit_reached') ||
    String(err?.message || '').toLowerCase().includes('maximum 2 pending payment events reached');

  let statusCode = Number(err?.statusCode || err?.status);
  if (!statusCode || statusCode < 400 || statusCode > 599) {
    if (isPendingLimit) {
      statusCode = 422;
    } else if (isOperational) {
      const code = String(err?.code || '');
      if (code.endsWith('_NOT_FOUND')) {
        statusCode = 404;
      } else if (
        code === 'GAME_CONFLICT' ||
        code === 'GAME_IN_USE' ||
        code === 'GAME_TYPE_ALREADY_REGISTERED' ||
        code === 'GAME_SLUG_ALREADY_REGISTERED' ||
        code === 'DUPLICATE_ORDER'
      ) {
        statusCode = 409;
      } else if (code === 'INSUFFICIENT_BALANCE') {
        statusCode = 402;
      } else if (code === 'DIRECT_UPLOAD_SIZE_EXCEEDED' || code === 'FILE_TOO_LARGE') {
        statusCode = 413;
      } else if (
        code === 'THEME_SETUP_REQUIRED' ||
        code === 'REJECTION_REASON_REQUIRED' ||
        code === 'PENDING_EVENT_LIMIT_REACHED' ||
        code === 'THEME_GAME_MISMATCH' ||
        code === 'GAME_INACTIVE' ||
        code === 'UNSUPPORTED_FILE_TYPE' ||
        code === 'INVALID_FILE_TYPE' ||
        code === 'MALICIOUS_SVG_DETECTED' ||
        code === 'INVALID_AMOUNT' ||
        code === 'INVALID_CURRENCY' ||
        code === 'INVALID_PAYMENT_METHOD' ||
        code === 'INVALID_PAYMENT_MODE'
      ) {
        statusCode = 422;
      } else {
        statusCode = 400;
      }
    } else {
      statusCode = 500;
    }
  }

  const userId = options?.userId || null;
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-correlation-id': requestId,
    ...cors,
  };

  // 1. Operational Error
  if (isOperational && statusCode < 500) {
    const errorCode = isPendingLimit
      ? 'PENDING_EVENT_LIMIT_REACHED'
      : (err?.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST'));
    const errorMessage = isPendingLimit
      ? 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.'
      : (err.message || 'Bad Request');
    return new globalThis.Response(
      JSON.stringify({
        error: errorMessage,
        code: errorCode,
        ...(err.code === 'THEME_SETUP_REQUIRED' || err.theme_setup_required ? { theme_setup_required: true } : {}),
        ...(err.code === 'INSUFFICIENT_BALANCE' ? {
          ...(err.required !== undefined ? { required: err.required } : {}),
          ...(err.available !== undefined ? { available: err.available } : {}),
          ...(err.shortfall !== undefined ? { shortfall: err.shortfall } : {}),
        } : {}),
        ...(err.eligibility ? { eligibility: err.eligibility } : {}),
        ...(err.metadata ? { metadata: sanitizeData(err.metadata) } : {}),
      }),
      {
        status: statusCode,
        headers: responseHeaders,
      }
    );
  }

  // 2. Unexpected Infrastructure Error
  console.error(`[Worker API Error][${requestId}]:`, JSON.stringify({
    level: 'error',
    requestId,
    service: detectedService,
    endpoint,
    method,
    statusCode: 500,
    errorType: err?.name || 'Error',
    errorCode: err?.code || 'INTERNAL_ERROR',
    message: err?.message || 'Unknown internal error',
    userId,
  }));
  if (err?.stack) {
    console.error(`[Worker API Error Stack][${requestId}]:`, err.stack);
  }

  // Persist to database defensively
  try {
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((val, k) => {
      queryParams[k] = val;
    });

    await logApiError(
      {
        request_id: requestId,
        user_id: userId,
        method,
        endpoint,
        status_code: 500,
        error_type: err?.name || 'Error',
        error_code: err?.code ? String(err.code) : 'INTERNAL_SERVER_ERROR',
        error_message: err?.message || 'Unknown internal server error',
        stack_trace: err?.stack || null,
        service: detectedService,
        metadata: {
          headers: sanitizeHeaders(request.headers),
          query: sanitizeData(queryParams),
          body: sanitizeData(options?.parsedBody),
          ...sanitizeData(options?.metadata || {}),
        },
      },
      env
    );
  } catch (loggingErr) {
    console.error('[Worker ErrorLogger] Failed to persist error log in handleWorkerApiError:', loggingErr);
  }

  return new globalThis.Response(
    JSON.stringify({
      error: 'Something went wrong. Please try again.',
      requestId,
    }),
    {
      status: 500,
      headers: responseHeaders,
    }
  );
}
