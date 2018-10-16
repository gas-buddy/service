import _ from 'lodash';
import queryString from 'query-string';
import request from 'superagent';

let superagentHistogram;

function safeStringify(obj) {
  if (_.isString(obj)) {
    return obj;
  }
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return `${obj}`;
  }
}

function formify(obj) {
  if (_.isString(obj)) {
    return `-F '${obj}' `;
  }
  try {
    return _.map(obj, (val, key) => `-F '${key}=${safeStringify(val)}' `).join('');
  } catch (e) {
    return `${obj}`;
  }
}

function superagentLogger(logger) {
  return (rq) => {
    rq.on('response', (response) => {
      const method = rq.method.toUpperCase();
      const query = _.isEmpty(rq.qs) ? '' : `?${queryString.stringify(rq.qs)}`;
      const url = `${rq.url}${query}`;
      const headers = _.reduce(rq.header, (acc, val, name) => `${acc}-H '${name}: ${val}' `, '');
      const contentType = _.find(rq.header, (val, name) => name.toLowerCase() === 'content-type');
      const isForm = contentType && contentType.toLowerCase() === 'application/x-www-form-urlencoded';
      let body = '';
      /* eslint-disable no-underscore-dangle */
      if (rq._data && isForm) {
        body = formify(rq._data);
      } else if (rq._data) {
        body = `-d '${safeStringify(rq._data)}' `;
      }
      /* eslint-enable no-underscore-dangle */
      const curl = `curl -i -X ${method} ${headers}${body}'${url}'`;
      const responseBody = response.body ? `${safeStringify(response.body)}` : response.text;
      logger.info(`Superagent request:\n${curl}\nResponse ${response.status}:\n${responseBody}`);
    });
  };
}

export function superagentFunctor(service, req, logger) {
  const shouldLogRequests = service.config.get('log_superagent_requests');
  return function superagentWithLog(method, url, {
    logErrors = true,
    addCorrelation = true,
    loggableUrl,
  } = {}) {
    if (!superagentHistogram && service.metrics) {
      superagentHistogram = new service.metrics.Histogram(
        'superagent_http_requests',
        'Outbound SuperAgent requests',
        ['status', 'source', 'endpoint', 'method'],
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
          endpoint: loggableUrl || url,
          method: method.toUpperCase(),
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
          endpoint: loggableUrl || url,
          method: method.toUpperCase(),
        }, dur);
      }
      if (logErrors) {
        newLogger.error('Http request failed', {
          status: error.status,
          url: loggableUrl || url,
          method: method.toUpperCase(),
          dur,
        });
      }
    });
    if (shouldLogRequests) {
      return newRequest.use(superagentLogger(newLogger));
    }
    return newRequest;
  };
}
