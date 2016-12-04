/**
 * Swagger client returns a wrapped error. Unwrap it.
 * Also avoids non-serializable errors.
 */
export function winstonError(error) {
  let message = error.message;
  let stack = error.stack;
  if (error.errObj) {
    message = error.statusText || error.errObj.message;
    stack = error.errObj.stack;
  }
  return {
    message,
    stack,
  };
}
