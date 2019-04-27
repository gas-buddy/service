import { superagentFunctor } from './superagentHelper';

/**
 * Turn most inputs into real errors.
 */
function normalizeError(error) {
  const isError = error instanceof Error;

  if (isError) {
    return error;
  }

  const props = {
    message: (typeof error === 'string') ? error : JSON.stringify(error),
    name: 'NormalizedError',
  };

  const newError = Error.call(props);
  Error.captureStackTrace(newError, normalizeError);
  Object.assign(newError, props, (typeof error === 'object' ? error : {}));

  return newError;
}

/**
 * Swagger client returns a wrapped error. Unwrap it.
 * Also avoids non-serializable errors.
 */
export function loggableError(error) {
  if (error.originalStack) {
    const originalError = normalizeError(error.originalStack);
    originalError.message = error.message;
    return originalError;
  }
  return normalizeError(error);
}

/**
 * Build and throw a well formed error to be caught and sent in finalHandler
 */
export function throwError(serviceName, codeOrError = 'nocode', message = 'nomessage', status = 500, domainOrOpts, opts = {}) {
  let error = codeOrError;
  if (!(error instanceof Error)) {
    error = new Error(message);
  }

  const isOpts = domainOrOpts instanceof Object;
  const finalOpts = isOpts ? domainOrOpts : opts;
  const domain = (!isOpts && domainOrOpts) || serviceName;

  error.code = error.code || codeOrError;
  error.status = error.status || status;
  error.domain = error.domain || domain;

  if (finalOpts) {
    const { displayMessage } = finalOpts;
    if (displayMessage) {
      error.displayMessage = (displayMessage === !!displayMessage) ? error.message : displayMessage;
    }
  }

  throw error;
}

export function childContextCreator(service, req, propName) {
  return (suffix) => {
    const newId = `${req.headers.correlationid}#${suffix}`;
    const newReq = Object.assign({}, req);
    newReq.headers = Object.assign({}, req.headers, { correlationid: newId });
    const newLogger = req[propName].logger.loggerWithDefaults({ c: newId });
    newReq[propName] = Object.assign({}, req[propName], {
      logger: newLogger,
      requestWithContext: superagentFunctor(service, newReq, newLogger),
      childCorrelationContext: childContextCreator(service, newReq, propName),
    });
    return newReq;
  };
}

export function syntheticRequest(service, correlationid) {
  const req = {
    app: service.app,
    gb: Object.create(Object.getPrototypeOf(service)),
    headers: {
      correlationid,
    },
  };
  const logger = service.logger.loggerWithDefaults({ c: req.headers.correlationid });
  Object.assign(req.gb, service, {
    logger,
    throwError: throwError.bind(this, service.name),
    wrapError(...args) { return service.wrapError(...args); },
    requestWithContext: superagentFunctor(service, req, logger),
    childCorrelationContext: childContextCreator(service, req, 'gb'),
  });
  service.emit('request', req);
  return req;
}
