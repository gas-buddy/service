import type {
  RequestHandler, Request, Response, ErrorRequestHandler,
} from 'express';
import { ServiceError } from '../error';
import type { ServiceExpress, ServiceLocals } from '../types';
import type { ServiceHandler } from '../express-app/types';

const LOG_PREFS = Symbol('Logging information');

interface LogPrefs {
  start: [number, number];
  logRequests?: boolean;
  chunks?: Array<Buffer>;
  logged: boolean;
}

function getBasicInfo(req: Request) {
  const url = req.originalUrl || req.url;

  const preInfo: Record<string, string> = {
    url,
    m: req.method,
  };

  return preInfo;
}

function finishLog<SLocals extends ServiceLocals = ServiceLocals>(
  app: ServiceExpress<SLocals>,
  error: Error | undefined,
  req: Request,
  res: Response,
) {
  const prefs = res.locals[LOG_PREFS as any] as LogPrefs;
  if (prefs.logged) {
    // This happens when error handler runs, but onEnd hasn't fired yet. We only log the first one.
    return;
  }

  const { logger, service } = app.locals;
  const hrdur = process.hrtime(prefs.start);

  const dur = hrdur[0] + hrdur[1] / 1000000000;
  const endLog: Record<string, any> = {
    ...getBasicInfo(req),
    s: (error as any)?.status || res.statusCode || 0,
    dur,
  };

  if (res.locals.user?.id) {
    endLog.u = res.locals.user.id;
  }

  if (error) {
    endLog.e = error.message;
    if (!(error instanceof ServiceError) || error.log_stack) {
      endLog.st = error.stack;
    }
  }

  if (prefs.logRequests) {
    if (Buffer.isBuffer(req.body)) {
      endLog.b = req.body.toString('base64');
    } else if (typeof req.body !== 'string') {
      endLog.b = JSON.stringify(req.body);
    } else if (req.body) {
      endLog.b = req.body;
    }
  }

  if (prefs.chunks?.length) {
    const bodyString = Buffer.concat(prefs.chunks).toString('utf8');
    if (bodyString) {
      endLog.resBody = bodyString;
    }
  }

  service.getLogFields?.(req as any, endLog);
  logger.info(endLog, 'req');
}

export function loggerMiddleware<SLocals extends ServiceLocals = ServiceLocals>(
  app: ServiceExpress<SLocals>,
  logRequests?: boolean,
  logResponses?: boolean,
): RequestHandler {
  const { logger, service } = app.locals;
  return function gblogger(req, res, next) {
    const prefs: LogPrefs = {
      start: process.hrtime(),
      logRequests,
      chunks: logResponses ? [] : undefined,
      logged: false,
    };

    res.locals[LOG_PREFS as any] = prefs;

    if (logResponses) {
      // res is a read-only stream, so the only way to intercept response
      // data is to monkey-patch.
      const oldWrite = res.write;
      const oldEnd = res.end;
      res.write = (...args) => {
        prefs.chunks!.push(Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0]));
        return (oldWrite as Function).apply(res, args);
      };
      (res as any).end = (
        ...args:
        | [chunk: any, encoding: BufferEncoding, cb?: (() => void) | undefined]
        | WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>[]
      ) => {
        if (args[0]) {
          prefs.chunks!.push(Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0]));
        }
        return oldEnd.apply(res, args as unknown as any);
      };
    }

    const preLog: Record<string, any> = {
      ...getBasicInfo(req),
      ref: req.headers.referer || undefined,
      sid: (req as any).session?.id,
      c: req.headers.correlationid || undefined,
    };
    service.getLogFields?.(req as any, preLog);
    logger.info(preLog, 'pre');

    const logWriter = () => finishLog(app, undefined, req, res);
    res.on('finish', logWriter);
    next();
  };
}

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
