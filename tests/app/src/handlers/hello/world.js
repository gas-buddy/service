import assert from 'assert';

export function get(req, res) {
  assert(req.headers.correlationid === 'FAKE_CORRELATION_ID');
  res.json({});
}
