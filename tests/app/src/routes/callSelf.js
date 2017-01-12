export default function (router) {
  router.get('/', async (req, res) => {
    const response = await req.gb.services.Self.default
      .get_hello_world({}, {
        requestInterceptor() {
          this.url = this.url.replace(':8000', `:${req.query.port}`);
        },
      });
    res.json(response);
  });
}
