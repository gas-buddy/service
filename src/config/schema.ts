import type { createKmsCryptoProvider } from '@gasbuddy/kms-crypto';
import type { Level } from 'pino';

export interface ServiceConfiguration {
  protocol?: string;
  port?: number;
  host?: string;
  basePath?: string;
  proxy?: string | false;
}

export interface ConfigurationSchema extends Record<string, any> {
  trustProxy?: string[];
  logging?: {
    level?: Level;
    logHttpRequests?: boolean;
    logRequestBody?: boolean;
    logResponseBody?: boolean;
  },
  crypto?: {
    kms?: Parameters<typeof createKmsCryptoProvider>[0];
  },
  routing?: {
    openapi?: boolean;
    // Relative to the *root directory* of the app
    routes?: string;
    // Whether to handle errors and return them to clients
    // (currently means we will return JSON errors)
    errors?: {
      renderErrors: boolean;
      // Check to see if we got an error from an upstream
      // service that has code/domain/message, and if so return
      // that as is. Otherwise we will sanitize it to avoid leaking
      // information.
      unnest: boolean;
    };
    // Whether to add middleware that "freezes" the query string
    // rather than preserving the new Express@5 behavior of reparsing
    // every time (which causes problems for OpenAPI validation)
    freezeQuery?: boolean;
    // Whether to compute etag headers. http://expressjs.com/en/api.html#etag.options.table
    etag?: boolean;
    cookieParser?: boolean;
    bodyParsers?: {
      json?: boolean;
      form?: boolean;
    },
    static?: {
      // True to enable static assets to be served
      enabled?: boolean;
      // The path relative to the root directory of the app
      path?: string;
      // The path on which to mount the static assets (defaults to /)
      mountPath?: string;
    },
  },
  server?: {
    internalPort?: number,
    port?: number,
    metrics: {
      enabled?: boolean;
    },
  },
  connections: Record<string, ServiceConfiguration>;
}
