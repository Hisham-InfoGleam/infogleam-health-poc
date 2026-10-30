#!/usr/bin/env node
'use strict';

// Sends one HL7 v2 message file over MLLP and checks the ACK that comes back.
//
//   node test-hl7-sender.js [file] [--host HOST] [--port PORT] [--expect CODES] [--timeout MS]
//
//   file       HL7 file to send (default: samples/sample_adt.hl7)
//   --host     engine host (default: localhost, or the HL7_HOST variable)
//   --port     MLLP port of the channel (default: 6661, or the HL7_PORT variable)
//   --expect   ACK codes (MSA-1) that count as success, comma separated (default: AA,CA)
//   --timeout  milliseconds to wait for the ACK (default: 10000)
//
// The exit code is 0 only when MSA-1 of the ACK is one of the expected codes.
// The script prints the ACK, never the message itself.

const net = require('net');
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const START_BLOCK = Buffer.from([0x0b]);
const END_BLOCK = Buffer.from([0x1c, 0x0d]);

/** Puts a message in an MLLP frame: <VT> segments, each ending with <CR> <FS><CR>. */
function frame(message) {
  const segments = String(message)
    .split(/\r\n|\n|\r/)
    .filter((segment) => segment.trim() !== '');
  const body = Buffer.from(segments.map((segment) => `${segment}\r`).join(''), 'utf8');
  return Buffer.concat([START_BLOCK, body, END_BLOCK]);
}

/**
 * Returns the message inside the first complete MLLP frame in "buffer",
 * or null when the end of the frame has not arrived yet.
 */
function unframe(buffer) {
  const end = buffer.indexOf(END_BLOCK);
  if (end === -1) return null;
  const start = buffer.lastIndexOf(START_BLOCK, end);
  return buffer.subarray(start === -1 ? 0 : start + 1, end).toString('utf8');
}

/** Reads MSA-1 (ACK code), MSA-2 (control ID) and MSA-3 (text) from an ACK. */
function parseAck(ack) {
  const segments = String(ack).split(/\r\n|\n|\r/);
  const msh = segments.find((segment) => segment.startsWith('MSH'));
  const separator = msh && msh.length > 3 ? msh[3] : '|';
  const msa = segments.find((segment) => segment.startsWith(`MSA${separator}`));
  if (!msa) return { code: null, controlId: '', text: '' };
  const fields = msa.split(separator);
  return { code: fields[1] || null, controlId: fields[2] || '', text: fields[3] || '' };
}

/** Sends one message and resolves with the ACK text (MLLP frame removed). */
function sendMessage(message, { host = 'localhost', port = 6661, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let received = Buffer.alloc(0);
    let finished = false;

    const finish = (error, ack) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(ack);
    };

    socket.setTimeout(timeoutMs, () => finish(new Error(`no complete ACK within ${timeoutMs} ms`)));
    socket.on('connect', () => socket.write(frame(message)));
    socket.on('data', (chunk) => {
      // The ACK can arrive in more than one chunk; wait for the end of the frame.
      received = Buffer.concat([received, chunk]);
      const ack = unframe(received);
      if (ack !== null) finish(null, ack);
    });
    socket.on('error', (error) => finish(error));
    socket.on('end', () => finish(new Error('the connection closed before a complete ACK arrived')));
  });
}

function readOptions(argv, env) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      host: { type: 'string' },
      port: { type: 'string' },
      expect: { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  });

  const port = Number(values.port || env.HL7_PORT || 6661);
  const timeoutMs = Number(values.timeout || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port: ${values.port || env.HL7_PORT}`);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error(`invalid timeout: ${values.timeout}`);

  return {
    help: Boolean(values.help),
    file: positionals[0] || path.join(__dirname, 'samples', 'sample_adt.hl7'),
    host: values.host || env.HL7_HOST || 'localhost',
    port,
    timeoutMs,
    expect: (values.expect || 'AA,CA')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  };
}

const USAGE = 'Usage: node test-hl7-sender.js [file] [--host HOST] [--port PORT] [--expect AA,CA] [--timeout MS]';

/** Runs the command line tool and returns the exit code. */
async function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = readOptions(argv, env);
  } catch (error) {
    console.error(`ERROR: ${error.message}\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  let message;
  try {
    message = fs.readFileSync(options.file, 'utf8');
  } catch (error) {
    console.error(`ERROR: cannot read ${options.file}: ${error.message}`);
    return 2;
  }

  console.log(`Sending ${path.basename(options.file)} to ${options.host}:${options.port} over MLLP`);
  let ack;
  try {
    ack = await sendMessage(message, options);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }

  console.log('ACK received:');
  for (const segment of ack.split('\r').filter(Boolean)) console.log(`  ${segment}`);

  const { code } = parseAck(ack);
  if (code && options.expect.includes(code.toUpperCase())) {
    console.log(`OK: MSA-1 is ${code}`);
    return 0;
  }
  console.error(`FAILED: MSA-1 is ${code || '(missing)'}, expected ${options.expect.join(' or ')}`);
  return 1;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { frame, unframe, parseAck, sendMessage, main };
