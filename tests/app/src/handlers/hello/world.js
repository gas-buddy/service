import assert from 'assert';

export function get(req, res) {
  assert(req.headers.correlationid === 'FAKE_CORRELATION_ID');
  const child = req.gb.childCorrelationContext('FOOBAR');
  assert(child.headers.correlationid === 'FAKE_CORRELATION_ID#FOOBAR');
  res.json({
    span: req.headers.span,
  });
}
