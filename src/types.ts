import type pino from 'pino';
import type { Server } from 'http';
import type { NextFunction, Request, Response } from 'express';
import type { Application } from 'express-serve-static-core';
import type { middleware } from 'express-openapi-validator';

export interface InternalLocals extends Record<string, any> {
  server?: Server;
  mainApp: ServiceExpress;
}

export interface ConfigStore {
  // Confit supports more things (set, use), but that's not how we
  // intend it to be used.
  get(name: string): any;
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
  logger: pino.BaseLogger;
}

export type ServiceExpress<Locals extends ServiceLocals = ServiceLocals> = Application<Locals>;
export type RequestWithApp<Locals extends ServiceLocals = ServiceLocals> = Omit<Request, 'app'> & {
  app: Application<Locals>;
};

export interface Service<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> {
  name?: string;

  start(app: ServiceExpress<SLocals>): void | Promise<void>;
  stop?: () => void | Promise<void>;

  healthy?: () => boolean | Promise<boolean>;

  // This runs as middleware right BEFORE the body parsers.
  // If you want to run AFTER the body parsers, the current
  // way to do that would be via /routes/index.ts and router.use()
  // in that file.
  onRequest?(req: RequestWithApp<SLocals>, res: Response<any, RLocals>): void | Promise<void>;

  // This runs after body parsing but before routing
  authorize?(req: RequestWithApp<SLocals>, res: Response<any, RLocals>): void | Promise<void>;
}

export type ServiceFactory<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> = () => Service<SLocals, RLocals>;

export interface ServiceStartOptions<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> {
  name: string;
  rootDirectory: string;

  // Defaults to "build", but can be set to "src" to run off non-built source
  codepath?: 'build' | 'src';

  // If you need multiple configuration directories, pass them here
  // in the desired order (later trumps earlier)
  configurationDirectories?: string[];

  // Add or control OpenAPI options such as security handlers
  openApiOptions?: Parameters<typeof middleware>[0];

  // And finally, the function that creates the service instance
  service: () => Service<SLocals, RLocals>;
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

  public log_stack?: boolean;

  constructor(
    req: Request,
    message: string,
    spec: {
      status?: number;
      code?: string;
      domain?: string;
      display_message?: string;
      log_stack?: boolean;
    },
  ) {
    super(message);
    this.domain = (req.app as ServiceExpress).locals.name;
    Object.assign(this, spec);
  }
}

export type ServiceHandler<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> = (
  req: RequestWithApp<SLocals>,
  res: Response<any, RLocals>,
  next: NextFunction,
) => any | Promise<any>;

// Make it easier to declare route files. This is not an exhaustive list
// of supported router methods, but it has the most common ones.
export interface ServiceRouter<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> {
  all(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  get(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  post(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  put(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  delete(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  patch(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  options(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  head(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  use(...handlers: ServiceHandler<SLocals, RLocals>[]): void;
}
