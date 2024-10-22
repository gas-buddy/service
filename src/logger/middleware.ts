import type { RequestHandler } from 'express';
import type { ServiceExpress, ServiceLocals } from '../types';
import { LogPrefs } from './types';
import { LOG_PREFS } from './constants';
import { finishLog, getBasicInfo } from './hooks';

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
      c: req.headers.correlationid || undefined,
    };
    service.getLogFields?.(req as any, preLog);
    logger.info(preLog, 'pre');

    const logWriter = () => finishLog(app, undefined, req, res);
    res.on('finish', logWriter);
    next();
  };
}
