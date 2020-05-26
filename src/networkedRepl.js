import net from 'net';
import repl from 'repl';
import util from 'util';
import { syntheticRequest } from './util';

export default class NetworkedRepl {
  constructor(context, config) {
    this.config = {
      port: 0,
      ...config,
    };
    this.service = context.service;
  }

  async start(context) {
    this.server = net.createServer((socket) => {
      let promiseCounter = 1;
      this.service.logger.warn('TCP REPL connection');
      const rl = repl.start({
        prompt: `${this.service.name}::tcp-repl> `,
        input: socket,
        output: socket,
        writer(v) {
          if (v && typeof v.then === 'function' && typeof v.catch === 'function') {
            const me = promiseCounter;
            promiseCounter += 1;
            v
              // eslint-disable-next-line no-console
              .then((r) => {
                socket.write(`\nPromise #${me} returns\n${util.inspect(r)}\n`);
                rl.context.$ = r;
              })
              // eslint-disable-next-line no-console
              .catch((e) => {
                socket.write(`\nPromise #${me} error\n${util.inspect(e)}\n`);
                rl.context.$error = e;
              });
            return `{ Returned Promise #${me} }`;
          }
          return util.inspect(v);
        },
      });
      rl.on('exit', () => socket.end());
      // Build a synthetic req to make calls easier
      const correlationid = `${this.service.name}-tcprepl-${Date.now()}`;
      const req = syntheticRequest(this.service, correlationid);
      rl.context.service = this.service;
      rl.context.repl = rl;
      rl.context.req = req;
    }).listen(this.config.port, () => {
      context.logger.warn('TCP REPL listening', { port: this.server.address().port });
    });
    return this;
  }

  async stop(context) {
    if (this.server) {
      context.logger.info('Shutting down TCP REPL');
      this.server.close();
      delete this.server;
      delete this.app;
    }
  }
}
