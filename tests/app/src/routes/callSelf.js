export default function (router) {
  router.get('/', async (req, res) => {
    const response = await req.gb.services.Self.default
      .get_hello_world({}, {
        requestInterceptor() {
          this.url = this.url.replace(':8000', `:${req.query.port}`);
        },
      });
    res.json(response.obj);
  });

  router.get('/superagent', async (req, res) => {
    await new Promise(accept => setTimeout(accept, 500));
    console.error('MAKE IT', req.query.port);
    const { body, status } = await req.gb
      .doHttpRequest('post', `http://localhost:${req.query.port}/simple`)
      .send({ hello: 'world' });
    res.json({ body, status });
  });
}
