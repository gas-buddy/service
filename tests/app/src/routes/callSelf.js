export default function (router) {
  router.get('/', async (req, res) => {
    const response = await req.gb.services.Self.default
      .get_hello_world();
    res.json(response);
  });
}
