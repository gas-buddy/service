import type {
  RequestHandler, ErrorRequestHandler,
} from 'express';
import { ServiceError } from '../error';
import type { ServiceExpress, ServiceLocals } from '../types';
import type { ServiceHandler } from './types';
import { finishLog, LOG_PREFS, LogPrefs } from '../logger';

export function errorHandlerMiddleware<SLocals extends ServiceLocals = ServiceLocals>(
  app: ServiceExpress<SLocals>,
  unnest?: boolean,
  returnError?: boolean,
) {
  const gbErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
    let loggable: Partial<ServiceError> = error;
    const body = error.response?.body || error.body;
    if (unnest && body?.domain && body?.code && body?.message) {
      loggable = {
        status: error.status,
        message: body.message,
        domain: body.domain,
        code: body.code,
        display_message: body.display_message,
      };
    }
    // Set the status to error, even if we aren't going to render the error.
    res.status(loggable.status || 500);
    if (returnError) {
      finishLog(app, error, req, res);
      const prefs = res.locals[LOG_PREFS as any] as LogPrefs;
      prefs.logged = true;
      res.json({
        code: loggable.code,
        message: loggable.message,
        domain: loggable.domain,
        display_message: loggable.display_message,
      });
    } else {
      next(error);
    }
  };
  return gbErrorHandler;
}

export function notFoundMiddleware() {
  const gbNotFoundHandler: ServiceHandler = (req, res, next) => {
    const error = new ServiceError(req.app, `Cannot ${req.method} ${req.path}`, {
      status: 404,
      code: 'NotFound',
      domain: 'http',
    });
    next(error);
  };
  return gbNotFoundHandler as RequestHandler;
}
