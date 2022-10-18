import type { ServiceExpress, ServiceRouter } from '../../../../src';
import { FakeServLocals } from '../index';

export default function route(
  router: ServiceRouter<FakeServLocals>,
  app: ServiceExpress<FakeServLocals>,
) {
  const worldRequests = app.locals.meter.createCounter('world_requests', {
    description: 'Metrics about requests to world',
  });

  router.get('/world', (req, res) => {
    worldRequests.add(1, { method: 'get' });
    res.json({ hello: 'world' });
  });

  router.post('/world', async (req, res) => {
    await app.locals.services.fakeServ.get_something();
    worldRequests.add(1);
    res.sendStatus(204);
  });
}
