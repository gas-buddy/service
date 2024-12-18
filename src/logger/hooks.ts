import type { Request, Response } from 'express';
import { getClientIp } from 'request-ip';
import { ServiceError } from '../error';
import type { ServiceExpress, ServiceLocals } from '../types';
import { LOG_PREFS } from './constants';
import { LogPrefs } from './types';
import { currentTelemetryInfo } from '../telemetry';

export function getBasicInfo(req: Request) {
  const url = req.originalUrl || req.url;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'];
  const correlationid = req.headers.correlationid
    || currentTelemetryInfo()?.traceId
    || req.app?.locals?.traceId
    || undefined;
  const preInfo: Record<string, string> = {
    url,
    m: req.method,
    ...ip && { ip },
    ...ua && { ua },
    ...correlationid && { c: correlationid },
  };

  return preInfo;
}

export function finishLog<SLocals extends ServiceLocals = ServiceLocals>(
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
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'];
  const endLog: Record<string, any> = {
    ...getBasicInfo(req),
    ...ip && { ip },
    ...ua && { ua },
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
  // If service entrypoint has redactLog function, call it to clean log object
  service.redactLog?.(endLog);
  logger.info(endLog, 'req');
}
