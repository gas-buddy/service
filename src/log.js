import winston from 'winston';
import onFinished from 'on-finished';
import Service from './Service';
import { winstonError } from './util';

const SHOULD_LOG_BODY = Symbol('Whether to log the request body for all requests');
const HISTOGRAM = Symbol('Request histogram');

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
  let metricsHistogram;
  const svc = Service.get(req);
  if (svc) {
    metricsHistogram = svc[HISTOGRAM];
    if (!metricsHistogram && svc.metrics) {
      metricsHistogram = new svc.metrics.Histogram(
        `${svc.name.replace(/-/g, '_')}_requests`,
        `overall request metrics for ${svc.name}`,
        ['status', 'url']);
      svc[HISTOGRAM] = metricsHistogram;
    }
  }

  const start = process.hrtime();

  const url = req.originalUrl || req.url;
  if (url === '/-/healthz') {
    return next();
  }

  onFinished(res, (error) => {
    const dur = process.hrtime(start)[1];
    if (metricsHistogram && res) {
      metricsHistogram.observe(dur / 1000000, {
        status: res.statusCode || 0,
        url: req.originalUrl || req.url,
      });
    }
    const rqInfo = {
      url: req.originalUrl || req.url,
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

export function finalHandlerFactory() {
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
      res.status(error.status || 500).send({
        code: error.code,
        message: error.message,
        domain: error.domain,
      });
    }];
}
