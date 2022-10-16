import type { ServiceExpress, ServiceRouter } from '../../../../src';

export default function route(router: ServiceRouter, app: ServiceExpress) {
  const worldRequests = app.locals.meter.createCounter('world_requests', {
    description: 'Metrics about requests to world',
  });

  router.get('/world', (req, res) => {
    worldRequests.add(1, { method: 'get' });
    res.json({ hello: 'world' });
  });

  router.post('/world', async (req, res) => {
    await req.app.locals.services.fakeServ.get_something();
    worldRequests.add(1);
    res.sendStatus(204);
  });
}
