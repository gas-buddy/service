export async function get(req) {
  req.gb.throwError('YouAskedForIt', 'You got it', 500);
}
