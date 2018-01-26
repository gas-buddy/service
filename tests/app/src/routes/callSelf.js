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
    try {
      const { body, status } = await req.gb
        .doHttpRequest('post', `http://localhost:${req.query.port}/${req.query.ep}`)
        .set('custom-header', 'value')
        .send({ hello: 'world' });
      res.json({ body, status });
    } catch (error) {
      res.json({ status: error.status });
    }
  });
}
