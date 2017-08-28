import assert from 'assert';
import express from 'express';
import { exec } from 'child_process';

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
      exec('npm ls --json', (err, stdout) => {
        if (err) {
          next(err);
        }
        try {
          res.json(JSON.parse(stdout));
        } catch (parseError) {
          next(parseError);
        }
      });
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
