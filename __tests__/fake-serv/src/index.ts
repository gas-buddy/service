import type { Service } from '@pkg/types';

export default function fakeServ(): Service {
  return {
    start() {},
    onRequest(req, res) {
      res.locals.rawBody = true;
    },
    async healthy() {
      return new Promise((accept) => {
        setTimeout(accept, 1000);
      });
    },
  };
}
