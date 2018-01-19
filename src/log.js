import winston from 'winston';
import onFinished from 'on-finished';
import Service from './Service';
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

let metricsHistogram;
let hostname;

// Inspired by morgan
// https://github.com/expressjs/morgan/blob/master/index.js
// But logs direct to winston with json fields

export function logger(req, res, next) {
  const svc = Service.get(req);
  if (svc) {
    if (!metricsHistogram && svc.metrics) {
      metricsHistogram = new svc.metrics.Histogram(
        'service_requests',
        'HTTP/S metrics for @gasbuddy/service instances',
        ['status', 'method', 'path', 'service']);
    }
    if (hostname === undefined) {
      hostname = svc.config.get('connections:logger:meta:host') || null;
    }
  }

  const start = process.hrtime();

  const url = req.originalUrl || req.url;
  onFinished(res, (error) => {
    const hrdur = process.hrtime(start);
    const dur = hrdur[0] + (hrdur[1] / 1000000000);
    if (metricsHistogram && res) {
      const path = req.route ? req.route.path : null;
      metricsHistogram.observe({
        service: svc.name,
        status: res.statusCode || 0,
        path,
        method: req.method,
      }, dur);
    }
    const rqInfo = {
      url,
      m: req.method,
      ts: Date.now(),
      dur,
      ip: getip(req),
      ua: req.headers['user-agent'],
      v: `${req.httpVersionMajor}.${req.httpVersionMinor}`,
    };

    if (req.user) {
      rqInfo.u = req.user.id;
    }
    if (hostname) {
      rqInfo.host = hostname;
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
    if (req.headers && req.headers.span) {
      rqInfo.sp = req.headers.span;
    } else if (req.gb && req.gb.logger && req.gb.logger.spanId) {
      rqInfo.sp = req.gb.logger.spanId;
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

export function finalHandlerFactory(options) {
  const { shouldRenderResponse = true } = options || {};

  return [
    // TODO: Reintroduce explicit 404 handling at the right place.
    // We can't have it as just the final route because gb-services-tester
    // depends on appending routes to the end and that won't happen if we
    // catch all here.
    //
    // function finalHandler(req, res) {
    //   const reqLogger = (req.gb && req.gb.logger) || winston;
    //   const reqProps = {
    //     reqMethod: req.method,
    //     reqUrl: req.url,
    //   };

    //   reqLogger.error('No handler for request. Returning 404', reqProps);
    //   res.status(404).send({
    //     code: 'NoHandler',
    //     message: 'No handler that matches request',
    //     domain: 'service',
    //   });
    // },
    function finalErrorHandler(error, req, res, next) {
      if (res.headersSent) {
        next(error);
        return;
      }

      const reqLogger = (req.gb && req.gb.logger) || winston;
      const reqProps = {
        reqMethod: req.method,
        reqUrl: req.url,
      };

      Object.assign(error, reqProps);
      reqLogger.error('Handler exception', winstonError(error));

      if (shouldRenderResponse) {
        // Check to see if it's a nested error and send
        // consumable errors upstream
        let loggable = error;
        if (error.obj && error.obj.domain && error.obj.code && error.obj.message) {
          loggable = {
            message: error.obj.message,
            domain: error.obj.domain,
            code: error.obj.code,
            display_message: error.obj.display_message,
          };
        }
        res.status(loggable.status || 500).send({
          code: loggable.code,
          message: loggable.message,
          domain: loggable.domain,
          display_message: loggable.display_message,
        });
      } else {
        next(error);
      }
    }];
}
