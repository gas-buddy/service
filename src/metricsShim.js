import assert from 'assert';
import winston from 'winston';

const CALL_TIMER = Symbol('Timing generic calls');
const MY_TIMER = Symbol('Internal timer for logging long running operations');

/**
 * This module listens to start/finish/error events on another module
 * and makes metrics for them
 */
export class metricsShim {
  constructor(context, config) {
    const callMetrics = {};

    assert(config.baseModule, 'MetricsShim needs a baseModule configuration parameter');
    let ClassConstructor = config.baseModule;
    if (typeof ClassConstructor !== 'function' && typeof ClassConstructor.default === 'function') {
      ClassConstructor = ClassConstructor.default;
    }
    assert(typeof ClassConstructor === 'function', 'MetricsShim baseModule must be a constructor');
    const gb = context.service;
    this.logAboveMs = config.logAboveMs;

    this.instance = new ClassConstructor(context, config);
    this.instance.on('start', (callInfo) => {
      if (!gb || !gb.metrics) {
        return;
      }

      const keyname = `${config.metricPrefix || ''}${callInfo.operationName}`;
      let histo = callMetrics[keyname];
      try {
        if (!histo) {
          histo = new gb.metrics.Histogram(
            keyname,
            `${config.metricDescription} ${callInfo.operationName}`,
            ['success', 'source'],
          );
          callMetrics[keyname] = histo;
        }
        callInfo[CALL_TIMER] = histo.startTimer({ source: gb.options.name });
        if (this.logAboveMs) {
          callInfo[MY_TIMER] = process.hrtime();
        }
      } catch (error) {
        winston.error('Failed to create call metric', {
          message: error.message,
          stack: error.stack,
        });
      }
    });
    this.instance.on('finish', (callInfo) => {
      if (callInfo[CALL_TIMER]) {
        callInfo[CALL_TIMER]({ success: true });
      }
      if (callInfo[MY_TIMER]) {
        const elapsed = process.hrtime(callInfo[MY_TIMER]);
        const dur = (elapsed[0] * 1000) + (elapsed[1] / 1000000);
        if (dur > config.logAboveMs) {
          winston.warn('Long running operation', {
            key: `${config.metricPrefix || ''}${callInfo.operationName}`,
            elapsed,
          });
        }
      }
    });
    this.instance.on('error', (callInfo) => {
      if (callInfo[CALL_TIMER]) {
        callInfo[CALL_TIMER]({ success: false });
      }
      if (callInfo[MY_TIMER]) {
        const elapsed = process.hrtime(callInfo[MY_TIMER]);
        const dur = (elapsed[0] * 1000) + (elapsed[1] / 1000000);
        if (dur > config.logAboveMs) {
          winston.warn('Long running operation failed', {
            key: `${config.metricPrefix || ''}${callInfo.operationName}`,
            elapsed,
          });
        }
      }
    });
    if (this.instance.start) {
      this.start = (...args) => this.instance.start(...args);
    }
    if (this.instance.stop) {
      this.stop = (...args) => this.instance.stop(...args);
    }
  }
}
