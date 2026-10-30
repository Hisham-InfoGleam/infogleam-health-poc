'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const { frame, unframe, parseAck, sendMessage, main } = require('../test-hl7-sender');

const SAMPLE = path.join(__dirname, '..', 'samples', 'sample_adt.hl7');

function ack(code, text = '') {
  return `MSH|^~\\&|OIE|TEST|HOSPITAL_SYSTEM|TEST|20260112093046||ACK|ACK00001|P|2.5\rMSA|${code}|MSG00001|${text}\r`;
}

// A fake MLLP listener that answers every message with "reply", cut in pieces.
async function fakeListener(t, reply, { pieces = 1 } = {}) {
  const received = [];
  const server = net.createServer((socket) => {
    let data = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (unframe(data) === null) return;
      received.push(unframe(data));
      const bytes = Buffer.concat([Buffer.from([0x0b]), Buffer.from(reply, 'utf8'), Buffer.from([0x1c, 0x0d])]);
      const size = Math.ceil(bytes.length / pieces);
      for (let i = 0; i < bytes.length; i += size) socket.write(bytes.subarray(i, i + size));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { port: server.address().port, received };
}

test('frame wraps the message in MLLP and ends each segment with CR', () => {
  const framed = frame('MSH|^~\\&|A\r\nPID|1\n\nPV1|1\r\n');
  assert.deepEqual([...framed.subarray(0, 1)], [0x0b]);
  assert.deepEqual([...framed.subarray(-2)], [0x1c, 0x0d]);
  assert.equal(framed.subarray(1, -2).toString(), 'MSH|^~\\&|A\rPID|1\rPV1|1\r');
});

test('unframe waits for the end of the frame', () => {
  const framed = frame('MSH|^~\\&|A');
  assert.equal(unframe(framed.subarray(0, 5)), null);
  assert.equal(unframe(framed), 'MSH|^~\\&|A\r');
});

test('parseAck reads MSA-1, MSA-2 and MSA-3', () => {
  assert.deepEqual(parseAck(ack('AA')), { code: 'AA', controlId: 'MSG00001', text: '' });
  assert.deepEqual(parseAck(ack('AE', 'Error')), { code: 'AE', controlId: 'MSG00001', text: 'Error' });
  assert.deepEqual(parseAck('MSH|^~\\&|X\r'), { code: null, controlId: '', text: '' });
});

test('sendMessage collects an ACK that arrives in several pieces', async (t) => {
  const listener = await fakeListener(t, ack('AA'), { pieces: 4 });
  const reply = await sendMessage('MSH|^~\\&|A\nPID|1', { host: '127.0.0.1', port: listener.port });
  assert.equal(parseAck(reply).code, 'AA');
  assert.deepEqual(listener.received, ['MSH|^~\\&|A\rPID|1\r']);
});

test('the tool exits with 0 for AA', async (t) => {
  const listener = await fakeListener(t, ack('AA'));
  const code = await main([SAMPLE, '--host', '127.0.0.1', '--port', String(listener.port)], {});
  assert.equal(code, 0);
});

test('the tool exits with 1 for AE and AR (negative ACKs)', async (t) => {
  for (const nak of ['AE', 'AR']) {
    const listener = await fakeListener(t, ack(nak));
    const code = await main([SAMPLE, '--host', '127.0.0.1', '--port', String(listener.port)], {});
    assert.equal(code, 1, `ACK code ${nak}`);
  }
});

test('--expect makes a rejection the expected answer', async (t) => {
  const listener = await fakeListener(t, ack('AR'));
  const code = await main([SAMPLE, '--host', '127.0.0.1', '--port', String(listener.port), '--expect', 'AR'], {});
  assert.equal(code, 0);
});

test('the tool exits with 1 when nothing listens on the port', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await main([SAMPLE, '--host', '127.0.0.1', '--port', String(port)], {}), 1);
});

test('the tool exits with 2 for a bad port or a missing file', async () => {
  assert.equal(await main([SAMPLE, '--port', 'abc'], {}), 2);
  assert.equal(await main([path.join(__dirname, 'no-such-file.hl7')], {}), 2);
});
