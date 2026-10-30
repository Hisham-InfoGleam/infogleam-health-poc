'use strict';

const express = require('express');
const { toFhirPatient, ValidationError } = require('./patient-mapper');

const FHIR_JSON = 'application/fhir+json; charset=utf-8';

function operationOutcome(issueCode, diagnostics) {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: issueCode, diagnostics }]
  };
}

function sendFhir(res, status, resource) {
  res.status(status).type(FHIR_JSON).send(JSON.stringify(resource, null, 2));
}

// The HL7 message control ID (MSH-10) is the only value from the message that
// is written to the log. It is cleaned so it cannot break the log line.
function messageId(body) {
  const id = body && typeof body.messageControlId === 'string' ? body.messageControlId : '';
  return id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'unknown';
}

/**
 * Creates the Express app.
 * options.mrnSystem: Identifier.system for MRNs without a URI in PID-3.4.
 * options.logger: object with info/warn/error (default: console).
 */
function createApp(options = {}) {
  const logger = options.logger || console;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Converts the channel JSON to a FHIR R4 Patient and returns it.
  // Nothing is stored, so the answer is 200 OK (not 201 Created).
  app.post('/convert/patient', (req, res) => {
    const id = messageId(req.body);
    try {
      const { patient, warnings } = toFhirPatient(req.body, { mrnSystem: options.mrnSystem });
      for (const warning of warnings) logger.warn(`message ${id}: ${warning}`);
      logger.info(`message ${id}: converted to a FHIR Patient`);
      sendFhir(res, 200, patient);
    } catch (error) {
      if (error instanceof ValidationError) {
        logger.warn(`message ${id}: rejected: ${error.message}`);
        sendFhir(res, 400, operationOutcome('invalid', error.message));
        return;
      }
      logger.error(`message ${id}: conversion failed (${error.name})`);
      sendFhir(res, 500, operationOutcome('exception', 'The conversion failed.'));
    }
  });

  app.use((req, res) => {
    sendFhir(res, 404, operationOutcome('not-found', 'Unknown path. Use POST /convert/patient.'));
  });

  // Errors from express.json(), for example a body that is not valid JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      sendFhir(res, 400, operationOutcome('invalid', 'The request body is not valid JSON.'));
      return;
    }
    if (error.status >= 400 && error.status < 500) {
      sendFhir(res, error.status, operationOutcome('invalid', 'The request could not be read.'));
      return;
    }
    logger.error(`request failed (${error.name})`);
    sendFhir(res, 500, operationOutcome('exception', 'The request failed.'));
  });

  return app;
}

module.exports = { createApp };
