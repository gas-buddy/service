import { RestApiErrorResponse, RestApiSuccessResponse } from 'rest-api-support';
import type { Service, ServiceLocals } from '../../../src/types';

export interface FakeServLocals extends ServiceLocals {
  services: {
    fakeServ: {
      get_something(): RestApiSuccessResponse<{ things: string[] }> | RestApiErrorResponse;
    }
  }
}

export default function fakeServ(): Service<FakeServLocals> {
  return {
    start(app) {
      app.locals.services.fakeServ = {
        get_something() { throw new Error('Should not be called.'); },
      };
    },
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
