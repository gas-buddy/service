import type { ServiceRouter } from '../../../../src';

export default function route(router: ServiceRouter) {
  router.get('/world', (req, res) => {
    res.json({ hello: 'world' });
  });

  router.post('/world', async (req, res) => {
    await req.app.locals.services.fakeServ.get_something();
    res.sendStatus(204);
  });
}
