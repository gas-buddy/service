import assert from 'assert';
import express from 'express';
import request from 'superagent';
import { exec } from 'child_process';
import { syntheticRequest } from './util';

const JobStatus = {
  Processing: 'processing',
  Complete: 'success',
  Fail: 'failed',
};

/**
 * An http server that exposes metadata about the app including health information
 */
export class MetadataServer {
  constructor(context, config) {
    assert(config.port || config.port === 0, 'Must have a port setting. Use 0 to let us pick a port');
    this.port = config.port;
    this.service = context.service;
  }

  start(context) {
    this.app = express();

    this.app.get('/health', async (req, res) => {
      try {
        res.json(await this.service.health(req));
      } catch (error) {
        res.sendStatus(500);
      }
    });

    this.app.get('/modules', (req, res, next) => {
      let depth = Number(req.query.depth || 0);
      if (!Number.isSafeInteger(depth)) {
        depth = 0;
      }
      if (this.npmls && this.npmls[depth]) {
        res.json(this.npmls[depth]);
        return;
      }
      exec(`npm ls --json --depth=${depth}`, (err, stdout) => {
        if (err) {
          next(err);
        }
        try {
          const info = JSON.parse(stdout);
          this.npmls = this.npmls || {};
          this.npmls[depth] = info;
          res.json(info);
        } catch (parseError) {
          next(parseError);
        }
      });
    });

    this.app.get('/connections/:component', async (req, res) => {
      const component = this.service[req.params.component];
      if (!component) {
        res.sendStatus(404);
        return;
      }
      if (typeof component.metadata !== 'function') {
        res.sendStatus(405);
        return;
      }
      const rz = await component.metadata(req.query);
      res.json(rz);
    });

    this.app.post('/job', async (req, res) => {
      const { job_name: name, callback_url: url } = req.body;
      const job = this.service.jobs[name];
      if (!job) {
        res.sendStatus(404);
        return;
      }
      if (typeof job !== 'function') {
        res.sendStatus(405);
        return;
      }
      const synth = syntheticRequest(this.service, req.headers.correlationid || `job-${name}-${Date.now()}`);
      const { maxExecutionSeconds = 60 * 60, interruptable = false, heartbeatIntervalSeconds = 10 } = job;
      let status = JobStatus.Processing;
      let progress = 0;
      const start = Date.now();
      const ping = (obj = {}) => request.post(url).retry(3).send({ status, progress, ...obj }).catch((error) => {
        synth.gb.logger.error('Failed to notify job server', this.service.wrapError(error, { name, url }));
      });
      const interval = setInterval(() => {
        if (Date.now() - start > maxExecutionSeconds * 1000) {
          status = JobStatus.Fail;
          // Tell the URL we failed.
          ping({
            error: {
              code: 'Timeout',
              message: `Job timed out after ${(Date.now() - start) / 1000} seconds`,
            },
          });
        } else {
          ping();
        }
      }, heartbeatIntervalSeconds * 1000);
      if (interruptable) {
        interval.unref();
      }
      try {
        synth.gb.logger.info('Starting job', { name });
        job(synth, req.body, (newProgress) => {
          progress = newProgress;
        }).then((result) => {
          clearInterval(interval);
          if (status === JobStatus.Processing) {
            status = JobStatus.Complete;
            ping({ result });
          } else {
            synth.gb.logger.warn('Failed to record job completion before timeout', { name, url });
          }
        }).catch((error) => {
          clearInterval(interval);
          if (status === JobStatus.Processing) {
            status = JobStatus.Fail;
            synth.gb.logger.error('Job failed', context.wrapError(error, { name }));
            ping({ error: context.wrapError(error) });
          } else {
            synth.gb.logger.warn('Failed to record job failure before timeout', context.wrapError(error, { name, url }));
          }
        });
        res.json({ accepted: true });
      } catch (error) {
        synth.gb.logger.error('Job could not be accepted', context.wrapError(error, { name: req.params.name }));
        res.status(500).json(context.wrapError(error));
      }
    });

    this.server = this.app.listen(this.port, () => {
      context.logger.info('Service metadata server listening', { port: this.server.address().port });
    });
    this.server.on('error', (error) => {
      context.logger.error('Could not setup metadata server', error);
    });
    return this;
  }

  stop(context) {
    if (this.server) {
      context.logger.info('Shutting down metadata server');
      this.server.close();
      delete this.server;
      delete this.app;
    }
  }
}
