/**
 * CWP Data App - Test Helper Utilities
 * Provides unified access to frontend assets (Index.html, public/css/style.css, public/js/app.js)
 * supporting both modular architecture and monolithic virtual bundles.
 */

const fs = require('fs');
const path = require('path');

function getFrontendAssets() {
  const indexPath = path.join(__dirname, '..', 'Index.html');
  const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
  const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const cropperPath = path.join(__dirname, '..', 'public', 'js', 'cropper.min.js');

  const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
  const cropper = fs.existsSync(cropperPath) ? fs.readFileSync(cropperPath, 'utf8') : '';

  // Full unified runtime bundle for comprehensive frontend verification
  const fullDocument = indexHtml +
    (css ? `\n<style>\n${css}\n</style>` : '') +
    (cropper ? `\n<script>\n${cropper}\n</script>` : '') +
    (js ? `\n<script>\n${js}\n</script>` : '');

  return {
    indexPath,
    cssPath,
    jsPath,
    cropperPath,
    indexHtml,
    css,
    js,
    cropper,
    fullDocument
  };
}

module.exports = { getFrontendAssets };
