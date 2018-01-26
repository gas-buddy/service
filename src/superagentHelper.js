import request from 'superagent';

let superagentHistogram;

export function superagentFunctor(service, req, logger) {
  return function superagentWithLog(method, url, {
    logErrors = true,
    addCorrelation = true,
    loggableUrl,
  } = {}) {
    if (!superagentHistogram && service.metrics) {
      superagentHistogram = new service.metrics.Histogram(
        'superagent_http_requests',
        'Outbound SuperAgent requests',
        ['status', 'source', 'endpoint'],
      );
    }

    const startTime = process.hrtime();

    const newLogger = logger.loggerWithNewSpan();
    const newRequest = request[method.toLowerCase()](url);
    if (addCorrelation && req && req.headers) {
      newRequest.set('correlationid', req.headers.correlationid);
      newRequest.set('span', newLogger.spanId);
    }

    let dur;
    let finished = false;
    newRequest.once('end', () => {
      if (!finished && superagentHistogram) {
        finished = true;
        const hrdur = process.hrtime(startTime);
        dur = hrdur[0] + (hrdur[1] / 1000000000);
        superagentHistogram.observe({
          source: service.name,
          status: newRequest.res ? newRequest.res.statusCode : 0,
          endpoint: `${method}_${loggableUrl || url}`,
        }, dur);
      }
    });
    newRequest.once('error', (error) => {
      if (!finished && superagentHistogram) {
        finished = true;
        const hrdur = process.hrtime(startTime);
        dur = hrdur[0] + (hrdur[1] / 1000000000);
        superagentHistogram.observe({
          source: service.name,
          status: error.status,
          endpoint: `${method}_${loggableUrl || url}`,
        }, dur);
      }
      if (logErrors) {
        newLogger.error('Http request failed', {
          status: error.status,
          url: loggableUrl || url,
          method,
          dur,
        });
      }
    });
    return newRequest;
  };
}
