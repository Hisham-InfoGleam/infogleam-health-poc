'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const sampleA01 = require('./fixtures/sample_adt_a01.channel.json');
const sampleA01Patient = require('./fixtures/sample_adt_a01.patient.json');

// Starts the app on a free port with a logger that keeps the log lines.
async function startApp(t) {
  const lines = [];
  const keep = (line) => lines.push(line);
  const app = createApp({ logger: { info: keep, warn: keep, error: keep } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, lines };
}

function post(url, body, contentType = 'application/json') {
  return fetch(`${url}/convert/patient`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('POST /convert/patient returns 200 with a FHIR Patient', async (t) => {
  const { url } = await startApp(t);
  const res = await post(url, sampleA01);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/fhir\+json/);
  assert.deepEqual(await res.json(), sampleA01Patient);
});

test('the log has the message ID but no patient data', async (t) => {
  const { url, lines } = await startApp(t);
  await post(url, sampleA01);
  assert.deepEqual(lines, ['message MSG00001: converted to a FHIR Patient']);
  const log = lines.join('\n');
  for (const value of ['PATIENT', 'TEST000001', 'TESTVILLE', '0100', '1970']) {
    assert.equal(log.includes(value), false, `log contains ${value}`);
  }
});

test('a message ID with odd characters cannot break the log line', async (t) => {
  const { url, lines } = await startApp(t);
  await post(url, { ...sampleA01, messageControlId: 'ID\nFAKE LINE' });
  assert.deepEqual(lines, ['message ID_FAKE_LINE: converted to a FHIR Patient']);
});

test('a message without a name gets 400 and an OperationOutcome', async (t) => {
  const { url } = await startApp(t);
  const res = await post(url, { ...sampleA01, names: [] });
  assert.equal(res.status, 400);
  assert.match(res.headers.get('content-type'), /^application\/fhir\+json/);
  const body = await res.json();
  assert.equal(body.resourceType, 'OperationOutcome');
  assert.equal(body.issue[0].code, 'invalid');
  assert.equal(body.issue[0].diagnostics, 'The message has no patient name (PID-5).');
});

test('a body that is not valid JSON gets 400 without internal details', async (t) => {
  const { url } = await startApp(t);
  const res = await post(url, '{"names": [');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.resourceType, 'OperationOutcome');
  assert.equal(body.issue[0].diagnostics, 'The request body is not valid JSON.');
});

test('a body that is not JSON at all gets 400', async (t) => {
  const { url } = await startApp(t);
  const res = await post(url, 'PID|1||TEST000001', 'text/plain');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).resourceType, 'OperationOutcome');
});

test('GET /health answers ok', async (t) => {
  const { url } = await startApp(t);
  const res = await fetch(`${url}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('an unknown path gets 404', async (t) => {
  const { url } = await startApp(t);
  const res = await fetch(`${url}/fhir/Patient`, { method: 'POST' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).resourceType, 'OperationOutcome');
});
