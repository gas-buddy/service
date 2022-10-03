import type pino from 'pino';
import type { Server } from 'http';
import type confit from 'confit';
import type { Request, Response } from 'express';
import type { Application } from 'express-serve-static-core';

export type ConfigStore = Parameters<Parameters<ReturnType<typeof confit>['create']>[0]>[1];

export interface InternalLocals extends Record<string, any> {
  server?: Server;
  mainApp: ServiceExpress;
}

export interface ServiceLocals extends Record<string, any> {
  name: string;
  service: Service;
  logger: pino.BaseLogger;
  config: ConfigStore;
  internalApp: Application<InternalLocals>;
}

export interface RequestLocals extends Record<string, any> {
  // Set this to true during the request "attachment" and if there is a body,
  // it will be set to the buffer before API and route handlers run.
  rawBody?: Buffer | true;
}

export type ServiceExpress = Application<ServiceLocals>;

export interface Service {
  name?: string;

  start(app: ServiceExpress): void | Promise<void>;
  stop?: () => Promise<void>;

  healthy?: () => Promise<boolean>;

  onRequest?(req: Request, res: Response<any, RequestLocals>): void | Promise<void>;
}

export type ServiceFactory = () => Service;

export interface ServiceStartOptions {
  name: string;
  rootDirectory: string;
  // Defaults to "build", but can be set to "src" to run off non-built source
  codepath?: 'build' | 'src';
  // If you need multiple configuration directories, pass them here
  // in the desired order (later trumps earlier)
  configurationDirectories?: string[];
  service: () => Service;
}

export interface DelayLoadServiceStartOptions extends Omit<ServiceStartOptions, 'service'> {
  service: string;
}

/**
 * An error that gives more structured information to callers. Throw inside a handler as
 *
 *   throw new Error(req, 'Something broke', { code: 'SomethingBroke', status: 400 });
 *
 * You can also include a display_message which is intended to be viewed by the end user
 */
export class ServiceError extends Error {
  public status: number | undefined;

  public code?: string;

  public domain: string;

  public display_message?: string;

  constructor(req: Request, message: string, spec: {
    status?: number;
    code?: string;
    domain?: string;
    display_message?: string;
  }) {
    super(message);
    this.domain = (req.app as ServiceExpress).locals.name;
    Object.assign(this, spec);
  }
}