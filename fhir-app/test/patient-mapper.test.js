'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MRN_SYSTEM,
  ValidationError,
  decodeEscapes,
  mapGender,
  toFhirDate,
  toFhirPatient
} = require('../src/patient-mapper');
const sampleA01 = require('./fixtures/sample_adt_a01.channel.json');
const sampleA01Patient = require('./fixtures/sample_adt_a01.patient.json');
const sampleA08 = require('./fixtures/sample_adt_a08_repeats.channel.json');
const sampleA08Patient = require('./fixtures/sample_adt_a08_repeats.patient.json');

const MR_TYPE = {
  coding: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
      code: 'MR',
      display: 'Medical record number'
    }
  ]
};

// A small valid input; each test changes only the part it checks.
function input(overrides = {}) {
  return {
    messageControlId: 'MSG-TEST',
    delimiters: '|^~\\&',
    identifiers: [{ value: 'TEST000009', authority: 'INFOGLEAM', type: 'MR' }],
    names: [{ family: 'PATIENT', given: 'TEST' }],
    ...overrides
  };
}

test('the sample ADT^A01 gives the documented Patient', () => {
  const { patient, warnings } = toFhirPatient(sampleA01);
  assert.deepEqual(patient, sampleA01Patient);
  assert.deepEqual(warnings, []);
});

test('the sample ADT^A08 with repeats and escapes gives the documented Patient', () => {
  const { patient, warnings } = toFhirPatient(sampleA08);
  assert.deepEqual(patient, sampleA08Patient);
  assert.deepEqual(warnings, []);
});

test('gender codes follow the V2-to-FHIR map for HL7 table 0001', () => {
  assert.equal(mapGender('F'), 'female');
  assert.equal(mapGender('M'), 'male');
  assert.equal(mapGender('O'), 'other');
  assert.equal(mapGender('U'), 'unknown');
  assert.equal(mapGender('A'), 'other');
  assert.equal(mapGender('N'), 'other');
  assert.equal(mapGender(' f '), 'female');
});

test('empty, unknown or non-text gender values give no gender and do not crash', () => {
  for (const value of ['', 'X', undefined, null, 7, {}, ['F'], true]) {
    assert.equal(mapGender(value), null, `value ${JSON.stringify(value)}`);
  }
  const { patient, warnings } = toFhirPatient(input({ gender: 'X' }));
  assert.equal(patient.gender, undefined);
  assert.equal(warnings.length, 1);
});

test('birth dates keep the precision of the HL7 value', () => {
  assert.equal(toFhirDate('1970'), '1970');
  assert.equal(toFhirDate('197003'), '1970-03');
  assert.equal(toFhirDate('19700315'), '1970-03-15');
  assert.equal(toFhirDate('197003151230'), '1970-03-15');
  assert.equal(toFhirDate('19700315123045.1234+0200'), '1970-03-15');
  assert.equal(toFhirDate(19700315), '1970-03-15');
});

test('birth dates are checked against the calendar', () => {
  assert.equal(toFhirDate('20240229'), '2024-02-29');
  assert.equal(toFhirDate('20000229'), '2000-02-29');
  assert.equal(toFhirDate('20230229'), null);
  assert.equal(toFhirDate('19000229'), null);
  assert.equal(toFhirDate('19700431'), null);
  assert.equal(toFhirDate('19700100'), null);
  assert.equal(toFhirDate('197000'), null);
  assert.equal(toFhirDate('197013'), null);
  assert.equal(toFhirDate('0000'), null);
});

test('values that are not HL7 dates give no birth date', () => {
  for (const value of ['', '19705', '1970031', '1970-03-15', 'abc', '19700315X', undefined, null, {}]) {
    assert.equal(toFhirDate(value), null, `value ${JSON.stringify(value)}`);
  }
  const { patient, warnings } = toFhirPatient(input({ birthDate: '1970-03-15' }));
  assert.equal(patient.birthDate, undefined);
  assert.equal(warnings.length, 1);
});

test('the five HL7 escape sequences are decoded', () => {
  assert.equal(decodeEscapes('A\\F\\B'), 'A|B');
  assert.equal(decodeEscapes('A\\S\\B'), 'A^B');
  assert.equal(decodeEscapes('A\\T\\B'), 'A&B');
  assert.equal(decodeEscapes('A\\R\\B'), 'A~B');
  assert.equal(decodeEscapes('A\\E\\B'), 'A\\B');
  // An escaped escape character is decoded once, not twice.
  assert.equal(decodeEscapes('A\\E\\T\\E\\B'), 'A\\T\\B');
});

test('escape decoding uses the delimiters of the message', () => {
  // MSH-1 is "#", MSH-2 is "$*!@": component $, repetition *, escape !, subcomponent @
  assert.equal(decodeEscapes('A!F!B!T!C!E!D', '#$*!@'), 'A#B@C!D');
  assert.equal(decodeEscapes('A\\F\\B', '#$*!@'), 'A\\F\\B');
});

test('other escape sequences and plain text are left as they are', () => {
  assert.equal(decodeEscapes('\\H\\BOLD\\N\\'), '\\H\\BOLD\\N\\');
  assert.equal(decodeEscapes('LINE\\X0D\\'), 'LINE\\X0D\\');
  assert.equal(decodeEscapes('PLAIN TEXT'), 'PLAIN TEXT');
  assert.equal(decodeEscapes(undefined), '');
});

test('the MRN is the PID-3 repetition with type code MR', () => {
  const { patient } = toFhirPatient(
    input({
      identifiers: [
        { value: 'PI000001', authority: 'INFOGLEAM', type: 'PI' },
        { value: 'TEST000009', authority: 'INFOGLEAM', type: 'MR' }
      ]
    })
  );
  assert.deepEqual(patient.identifier, [
    { type: MR_TYPE, system: DEFAULT_MRN_SYSTEM, value: 'TEST000009', assigner: { display: 'INFOGLEAM' } }
  ]);
});

test('without an MR repetition the Patient has no identifier', () => {
  const { patient, warnings } = toFhirPatient(
    input({ identifiers: [{ value: 'PI000001', type: 'PI' }, { value: '', type: 'MR' }, { value: 'X1' }] })
  );
  assert.equal(patient.identifier, undefined);
  assert.equal(warnings.length, 1);

  assert.equal(toFhirPatient(input({ identifiers: undefined })).patient.identifier, undefined);
});

test('the identifier system comes from PID-3.4 only when it is a URI, OID or UUID', () => {
  const system = (authorityId, authorityIdType) =>
    toFhirPatient(input({ identifiers: [{ value: 'TEST000009', type: 'MR', authorityId, authorityIdType }] }))
      .patient.identifier[0].system;

  assert.equal(system('https://example.org/fhir/sid/test-mrn', 'URI'), 'https://example.org/fhir/sid/test-mrn');
  assert.equal(system('2.16.840.1.113883.19.5', 'ISO'), 'urn:oid:2.16.840.1.113883.19.5');
  assert.equal(
    system('A1B2C3D4-0000-4000-8000-000000000001', 'UUID'),
    'urn:uuid:a1b2c3d4-0000-4000-8000-000000000001'
  );
  assert.equal(system('NOT AN OID', 'ISO'), DEFAULT_MRN_SYSTEM);
  assert.equal(system('https://example.org/x', ''), DEFAULT_MRN_SYSTEM);
  assert.equal(system('', ''), DEFAULT_MRN_SYSTEM);
});

test('the default MRN system can be changed', () => {
  const { patient } = toFhirPatient(input(), { mrnSystem: 'https://example.org/fhir/sid/other-mrn' });
  assert.equal(patient.identifier[0].system, 'https://example.org/fhir/sid/other-mrn');
});

test('names map family, given, middle names, prefix, suffix and type', () => {
  const { patient } = toFhirPatient(
    input({
      names: [
        { family: 'SAMPLE', given: 'JANE', middle: 'ANN  MARIE', suffix: 'JR', prefix: 'MS', type: 'L' },
        { family: 'TESTER', given: 'JANE', type: 'M' },
        { given: 'JJ', type: 'N' },
        { family: 'OTHER', type: 'U' },
        { family: '', given: '' }
      ]
    })
  );
  assert.deepEqual(patient.name, [
    { use: 'official', family: 'SAMPLE', given: ['JANE', 'ANN', 'MARIE'], prefix: ['MS'], suffix: ['JR'] },
    { use: 'maiden', family: 'TESTER', given: ['JANE'] },
    { use: 'nickname', given: ['JJ'] },
    { family: 'OTHER' }
  ]);
});

test('a message without a usable name is rejected', () => {
  for (const names of [undefined, [], [{}], [{ family: ' ', given: '' }], 'PATIENT^TEST']) {
    assert.throws(() => toFhirPatient(input({ names })), ValidationError);
  }
});

test('a body that is not a JSON object is rejected', () => {
  for (const body of [undefined, null, 'text', 42, [input()]]) {
    assert.throws(() => toFhirPatient(body), ValidationError);
  }
});

test('addresses map street lines, state and address type', () => {
  const { patient } = toFhirPatient(
    input({
      addresses: [
        { street: '1 MAIN ST', other: 'APT 2', city: 'TESTVILLE', state: 'TS', postalCode: '00000', country: 'USA', type: 'H' },
        { street: 'PO BOX 1', type: 'M' },
        { city: 'WORKTOWN', type: 'B' },
        { type: 'H' }
      ]
    })
  );
  assert.deepEqual(patient.address, [
    { use: 'home', line: ['1 MAIN ST', 'APT 2'], city: 'TESTVILLE', state: 'TS', postalCode: '00000', country: 'USA' },
    { line: ['PO BOX 1'] },
    { use: 'work', city: 'WORKTOWN' }
  ]);
});

test('phone numbers and e-mail addresses map to telecom', () => {
  const { patient } = toFhirPatient(
    input({
      phones: [
        { number: '(555)0100' },
        { use: 'WPN', equipment: 'PH', areaCode: '555', localNumber: '0102', extension: '7' },
        { use: 'PRN', equipment: 'FX', countryCode: '1', areaCode: '555', localNumber: '0103' },
        { equipment: 'CP', number: '555 0104' },
        { use: 'NET', equipment: 'Internet', email: 'test.patient@example.com' },
        { use: 'ORN', number: '555 0105' },
        { use: 'PRN' }
      ]
    })
  );
  assert.deepEqual(patient.telecom, [
    { system: 'phone', value: '(555)0100', use: 'home' },
    { system: 'phone', value: '(555) 0102 ext. 7', use: 'work' },
    { system: 'fax', value: '+1 (555) 0103', use: 'home' },
    { system: 'phone', value: '555 0104', use: 'mobile' },
    { system: 'email', value: 'test.patient@example.com' },
    { system: 'phone', value: '555 0105' }
  ]);
});

test('empty optional fields are left out of the Patient', () => {
  const { patient } = toFhirPatient(
    input({ identifiers: [], gender: '', birthDate: '', addresses: [{}], phones: [{}, null, 'x'] })
  );
  assert.deepEqual(patient, { resourceType: 'Patient', name: [{ family: 'PATIENT', given: ['TEST'] }] });
});
