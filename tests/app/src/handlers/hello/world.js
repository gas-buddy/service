import assert from 'assert';

export function get(req, res) {
  assert(req.headers.CorrelationId === 'FAKE_CORRELATION_ID');
  res.json({});
}
