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
