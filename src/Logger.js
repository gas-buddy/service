import winston from 'winston';
import { winstonError } from './util';

const REQUEST_KEY = Symbol('Current active web request for a GasBuddy logger');

/**
 * A logger that splices in the correlationId from a request.
 */
export default class Logger {
  constructor(req) {
    this[REQUEST_KEY] = req;
  }

  // eslint-disable-next-line class-methods-use-this
  wrapError(error) {
    return winstonError(error);
  }

  metaMap(meta) {
    if (this[REQUEST_KEY]) {
      const newMeta = Object.assign({}, meta);
      newMeta.correlationId = this[REQUEST_KEY].headers.CorrelationId;
      return newMeta;
    }
    return meta;
  }

  debug(msg, meta) {
    return winston.debug(msg, this.metaMap(meta));
  }

  info(msg, meta) {
    return winston.info(msg, this.metaMap(meta));
  }

  warn(msg, meta) {
    return winston.warn(msg, this.metaMap(meta));
  }

  error(msg, meta) {
    return winston.error(msg, this.metaMap(meta));
  }
}
