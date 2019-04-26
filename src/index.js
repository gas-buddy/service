import bodyParser from 'body-parser';

export { default as Service } from './Service';
export { default as Server } from './Server';
export { default as requestFactory } from './requestFactory';
export { syntheticRequest } from './util';
export { metricsShim } from './metricsShim';
export { MetadataServer } from './metadata';
export { runWithService } from './runWithService';
export { default as NetworkedRepl } from './networkedRepl';

export {
  loggerFactory,
  bodyLoggerFactory,
  responseLoggerFactory,
  finalHandlerFactory,
} from './log';

export function saveRawBodyFactory() {
  return bodyParser.json({
    verify(req, res, buf) {
      req.rawBody = buf;
    },
  });
}
