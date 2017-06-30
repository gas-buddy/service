import winston from 'winston';
import onFinished from 'on-finished';
import { winstonError } from './util';

const SHOULD_LOG_BODY = Symbol('Whether to log the request body for all requests');

/**
 * Get request IP address.
 *
 * @private
 * @param {IncomingMessage} req
 * @return {string}
 */

function getip(req) {
  return req.ip
    || req._remoteAddress // eslint-disable-line no-underscore-dangle
    || (req.connection && req.connection.remoteAddress)
    || undefined;
}

export function requestBodyLogger(req, res, next) {
  req[SHOULD_LOG_BODY] = true;
  next();
}

// Inspired by morgan
// https://github.com/expressjs/morgan/blob/master/index.js
// But logs direct to winston with json fields

export function logger(req, res, next) {
  const start = process.hrtime();

  const url = req.originalUrl || req.url;
  if (url === '/health') {
    return next();
  }

  onFinished(res, (error) => {
    const rqInfo = {
      url: req.originalUrl || req.url,
      m: req.method,
      ts: Date.now(),
      dur: process.hrtime(start)[1],
      ip: getip(req),
      ua: req.headers['user-agent'],
      v: `${req.httpVersionMajor}.${req.httpVersionMinor}`,
    };

    if (req.user) {
      rqInfo.u = req.user.id;
    }
    if (res._header) { // eslint-disable-line no-underscore-dangle
      rqInfo.s = res.statusCode;
      rqInfo.l = res.getHeader('content-length');
    }
    if (error) {
      rqInfo.e = error.message;
      rqInfo.st = error.stack;
    }
    if (req.headers && req.headers.correlationid) {
      rqInfo.c = req.headers.correlationid;
    }
    if (req.headers && req.headers.spanid) {
      rqInfo.sp = req.headers.spanid;
    }
    if (req[SHOULD_LOG_BODY]) {
      // winston flattens JSON, so I guess we need to wrap it. Hrmph.
      if (Buffer.isBuffer(req.body)) {
        rqInfo.b = req.body.toString('base64');
      } else if (typeof logBody !== 'string') {
        rqInfo.b = JSON.stringify(req.body);
      } else if (req.body) {
        rqInfo.b = req.body;
      }
    }

    winston.info('req', rqInfo);
  });
  return next();
}

export function loggerFactory() {
  return logger;
}

export function bodyLoggerFactory() {
  return requestBodyLogger;
}

export function finalHandlerFactory() {
  return function finalHandler(error, req, res, next) {
    if (res.headersSent) {
      next(error);
      return;
    }

    const reqLogger = (req.gb && req.gb.logger) || winston;
    const reqDescription = `${req.method} ${req.url}`;
    if (error) {
      reqLogger.error(`Handler exception for ${reqDescription}`, winstonError(error));
      res.status(error.status || 500).send({
        code: error.code,
        message: error.message,
        domain: error.domain,
      });
    } else {
      reqLogger.error(`Page not found for ${reqDescription}`);
      res.status(404).send('Page not found');
    }
  };
}
