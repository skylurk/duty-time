// Run after npm run build:
// node --no-experimental-require-module scripts/check-production-api.cjs
// Disabling require(esm) reproduces the module-loader limitation seen on Vercel.
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');

async function main() {
  for (const [path, method] of [
    ['duty', 'GET'], ['admin', 'GET'], ['manual', 'GET'],
    ['station-contacts', 'GET'], ['cutoff', 'POST'], ['reports/retry', 'POST'],
  ]) {
    const { routeModule } = require(`../.next/server/app/api/${path}/route.js`);
    const response = await routeModule.userland[method](
      new NextRequest(`http://localhost/api/${path}`, { method }),
    );
    assert.equal(response.status, 401, `${path} must require authentication`);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal((await response.json()).error, 'Please sign in to continue.');
    console.log(`${method} /api/${path}: JSON 401`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
