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
  },
  bodyParsers?: {
    json?: boolean;
    form?: boolean;
  },
  internalPort?: number,
  port?: number,
  connections: Record<string, ServiceConfiguration>;
}
