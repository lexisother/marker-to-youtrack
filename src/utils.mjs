/**
 * @see https://github.com/form-data/form-data/blob/53adbd81e9bde27007b28083068f2fc8272614dc/lib/form_data.js#L347-L356
 */
export function generateBoundary() {
  var boundary = '--------------------------';
  for (var i = 0; i < 24; i++) {
    boundary += Math.floor(Math.random() * 10).toString(16);
  }
  return boundary;
}
