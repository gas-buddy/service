import type pino from 'pino';
import type { Server } from 'http';
import type { Request, Response } from 'express';
import type { Application } from 'express-serve-static-core';
import type { middleware } from 'express-openapi-validator';
import type metrics from '@opentelemetry/sdk-metrics';
import type { ConfigStore } from './config/types';

export interface InternalLocals extends Record<string, any> {
  server?: Server;
  mainApp: ServiceExpress;
}

export type ServiceLogger = pino.BaseLogger & Pick<pino.Logger, 'isLevelEnabled'>;

export interface ServiceLocals extends Record<string, any> {
  name: string;
  service: Service;
  logger: ServiceLogger;
  config: ConfigStore;
  meters: metrics.MeterProvider;
  internalApp: Application<InternalLocals>;
}

export interface RequestLocals extends Record<string, any> {
  // Set this to true during the request "attachment" and if there is a body,
  // it will be set to the buffer before API and route handlers run.
  rawBody?: Buffer | true;
  logger: ServiceLogger;
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

  // Modify options used for application start
  configure?: (
    startOptions: ServiceStartOptions<SLocals, RLocals>,
    options: ServiceOptions,
  ) => ServiceOptions;

  start(app: ServiceExpress<SLocals>): void | Promise<void>;
  stop?: (app: ServiceExpress<SLocals>) => void | Promise<void>;

  healthy?: (app: ServiceExpress<SLocals>) => boolean | Promise<boolean>;

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

  // NOTE: if you use this, you need to cast it because of a Typescript error:
  // https://github.com/microsoft/TypeScript/issues/22229
  // locals: { stuff } as Partial<MyLocals>
  locals?: Partial<SLocals>;

  // And finally, the function that creates the service instance
  service: () => Service<SLocals, RLocals>;
}

export interface DelayLoadServiceStartOptions extends Omit<ServiceStartOptions, 'service'> {
  service: string;
}

// Handled by service.configure
export interface ServiceOptions {
  // If you need multiple configuration directories, pass them here
  // in the desired order (later trumps earlier)
  configurationDirectories: string[];

  // Add or control OpenAPI options such as security handlers
  openApiOptions?: Parameters<typeof middleware>[0];
}

export interface ServiceLike<SLocals extends ServiceLocals = ServiceLocals> {
  locals: SLocals;
}

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export interface RequestLike<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> {
  app: ServiceLike<SLocals>;
  res: {
    locals: RLocals;
  };
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

  // If true, this shouldn't be logged as an error, but as an info log.
  // This is common when the error needs to go to the client, but should not
  // take up the valuable mental space of an error log.
  public expected_error?: boolean;

  constructor(
    app: ServiceLike<ServiceLocals>,
    message: string,
    spec: {
      status?: number;
      code?: string;
      domain?: string;
      display_message?: string;
      log_stack?: boolean;
      expected_error?: boolean;
    },
  ) {
    super(message);
    this.domain = app.locals.name;
    Object.assign(this, spec);
  }
}
