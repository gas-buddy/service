import winston from 'winston';
import requestIp from 'request-ip';
import onFinished from 'on-finished';
import Service from './Service';
import { winstonError } from './util';

const SHOULD_LOG_BODY = Symbol('Whether to log the request body for all requests');

export function requestBodyLogger(req, res, next) {
  req[SHOULD_LOG_BODY] = true;
  next();
}

let metricsHistogram;
let hostname;

function getBasicInfo(req) {
  const url = req.originalUrl || req.url;

  const preInfo = {
    url,
    m: req.method,
    ts: Date.now(),
  };
  if (req.headers && req.headers.correlationid) {
    preInfo.c = req.headers.correlationid;
  }
  if (req.headers && req.headers.span) {
    preInfo.sp = req.headers.span;
  } else if (req.gb && req.gb.logger && req.gb.logger.spanId) {
    preInfo.sp = req.gb.logger.spanId;
  }
  if (hostname) {
    preInfo.host = hostname;
  }
  return preInfo;
}

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

  winston.info('pre', getBasicInfo(req));

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
    // Run getBasicInfo again just in case req processing
    // has changed any values
    const rqInfo = Object.assign(getBasicInfo(req), {
      dur,
      ip: requestIp.getClientIp(req),
      ua: req.headers['user-agent'],
      v: `${req.httpVersionMajor}.${req.httpVersionMinor}`,
    });

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
        if (error.body && error.body.domain && error.body.code && error.body.message) {
          loggable = {
            status: error.status,
            message: error.body.message,
            domain: error.body.domain,
            code: error.body.code,
            display_message: error.body.display_message,
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
