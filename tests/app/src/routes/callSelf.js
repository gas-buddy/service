async function thisShouldBeTopOfStack(req) {
  const { body, status } = await req.gb.services.Self.apis.default
    .get_throw({}, {
      requestInterceptor(request) {
        request.url = request.url.replace(':8000', `:${req.query.port}`);
      },
    });
  return { body, status };
}

export default function (router) {
  router.get('/', async (req, res) => {
    const response = await req.gb.services.Self.apis.default
      .get_hello_world({}, {
        requestInterceptor(request) {
          request.url = request.url.replace(':8000', `:${req.query.port}`);
        },
      });
    res.json(response.body);
  });

  router.get('/superagent', async (req, res) => {
    await new Promise(accept => setTimeout(accept, 500));
    try {
      const { body, status, headers } = await req.gb
        .requestWithContext('post', `http://localhost:${req.query.port}/${req.query.ep}`)
        .set('custom-header', 'hello-world')
        .send({ hello: 'world' });
      res.json({ body, status, headers });
    } catch (error) {
      res.json({ status: error.status });
    }
  });

  router.get('/swaggerthrow', async (req, res) => {
    res.json(await thisShouldBeTopOfStack(req));
  });
}
