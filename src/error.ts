import type { ServiceLike, ServiceLocals } from './types';

export interface ServiceErrorSpec {
  status?: number;
  code?: string;
  domain?: string;
  display_message?: string;
  log_stack?: boolean;
  expected_error?: boolean;
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
    spec?: ServiceErrorSpec,
  ) {
    super(message);
    this.domain = app.locals.name;
    Object.assign(this, spec);
  }
}
