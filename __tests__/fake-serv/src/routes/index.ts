import type { ServiceExpress, ServiceRouter } from '../../../../src';

export default function route(router: ServiceRouter, app: ServiceExpress) {
  const serviceMeter = app.locals.meters.getMeter('fake-serv');
  const worldRequests = serviceMeter.createCounter('world_requests', {
    description: 'Metrics about requests to world',
  });

  router.get('/world', (req, res) => {
    worldRequests.add(1, { method: 'get' });
    app.locals.meters.forceFlush();
    res.json({ hello: 'world' });
  });

  router.post('/world', async (req, res) => {
    await req.app.locals.services.fakeServ.get_something();
    worldRequests.add(1);
    app.locals.meters.forceFlush();
    res.sendStatus(204);
  });
}
