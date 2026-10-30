'use strict';

// Turns the JSON that the OIE / Mirth Connect channel sends into a FHIR R4
// Patient resource.
//
// The channel sends the PID values exactly as they are in the HL7 v2 message.
// This module decodes the HL7 escape sequences and maps the codes. The code
// tables below follow the concept maps of the HL7 "V2-to-FHIR" implementation
// guide: https://hl7.org/fhir/uv/v2mappings/

const DEFAULT_MRN_SYSTEM = 'https://example.org/fhir/mrn';
const DEFAULT_DELIMITERS = '|^~\\&';
const IDENTIFIER_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0203';

// HL7 table 0001 (administrative sex) to FHIR administrative-gender.
const GENDER = { F: 'female', M: 'male', O: 'other', U: 'unknown', A: 'other', N: 'other' };

// HL7 table 0200 (name type) to FHIR HumanName.use.
const NAME_USE = {
  L: 'official',
  R: 'official',
  D: 'usual',
  M: 'maiden',
  N: 'nickname',
  BAD: 'old',
  MSK: 'anonymous',
  NAV: 'temp',
  TEMP: 'temp'
};

// HL7 table 0190 (address type) to FHIR Address.use.
const ADDRESS_USE = { H: 'home', B: 'work', O: 'work', C: 'temp', BA: 'old', BI: 'billing' };

// HL7 table 0201 (telecommunication use code) to FHIR ContactPoint.use.
const TELECOM_USE = { PRN: 'home', WPN: 'work', PRS: 'mobile' };

// HL7 table 0202 (telecommunication equipment type) to FHIR ContactPoint.system.
const TELECOM_SYSTEM = {
  PH: 'phone',
  CP: 'phone',
  FX: 'fax',
  BP: 'pager',
  MD: 'other',
  SAT: 'other',
  TDD: 'other',
  TTY: 'other',
  INTERNET: 'email',
  'X.400': 'email'
};

// HL7 v2 date/time (DTM): YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
const DTM = /^(\d{4})(?:(\d{2})(?:(\d{2})(?:\d{2}(?:\d{2}(?:\d{2}(?:\.\d{1,4})?)?)?)?)?)?(?:[+-]\d{4})?$/;

/** Thrown when the request cannot become a Patient. The message is safe to return to the caller. */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Any input value as a trimmed string. Values that are not text become ''.
function text(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function code(value) {
  return text(value).toUpperCase();
}

// Only the objects of an array; anything else becomes an empty list.
function objects(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a function that decodes the HL7 escape sequences \F\ \S\ \T\ \R\ \E\.
 * "delimiters" is MSH-1 followed by MSH-2, for example "|^~\&".
 * Other escape sequences (\X..\, \H\, \N\, \.br\ and so on) are left as they are.
 */
function makeDecoder(delimiters) {
  const d = typeof delimiters === 'string' && delimiters.length >= 4 ? delimiters : DEFAULT_DELIMITERS;
  const escape = d[3];
  const replacements = { F: d[0], S: d[1], R: d[2], E: escape, T: d[4] || '' };
  const pattern = new RegExp(`${escapeRegExp(escape)}([FSTRE])${escapeRegExp(escape)}`, 'g');

  return (value) => {
    const s = text(value);
    if (!s.includes(escape)) return s;
    return s.replace(pattern, (match, letter) => replacements[letter] || match);
  };
}

function decodeEscapes(value, delimiters) {
  return makeDecoder(delimiters)(value);
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * HL7 v2 date (PID-7) to FHIR date. Keeps the precision of the source:
 * "1970" -> "1970", "197003" -> "1970-03", "19700315" or longer -> "1970-03-15".
 * Returns null when the value is not a valid date. The time part is dropped.
 */
function toFhirDate(value) {
  const match = DTM.exec(text(value));
  if (!match) return null;

  const [, year, month, day] = match;
  if (year === '0000') return null;
  if (!month) return year;

  const m = Number(month);
  if (m < 1 || m > 12) return null;
  if (!day) return `${year}-${month}`;

  const dd = Number(day);
  if (dd < 1 || dd > daysInMonth(Number(year), m)) return null;
  return `${year}-${month}-${day}`;
}

/** HL7 table 0001 code (PID-8) to FHIR gender. Returns null for empty or unknown codes. */
function mapGender(value) {
  return GENDER[code(value)] || null;
}

// Identifier.system from PID-3.4 when it holds a real URI, OID or UUID
// (PID-3.4.2 with type PID-3.4.3). A namespace name alone (PID-3.4.1) is not
// a URI, so then the default system is used and the name goes to assigner.
function identifierSystem(universalId, universalIdType, defaultSystem) {
  const type = code(universalIdType);
  if (universalId) {
    if (type === 'URI' && /^[a-z][a-z0-9+.-]*:\S+$/i.test(universalId)) return universalId;
    if (type === 'ISO' && /^[0-2](\.(0|[1-9]\d*))+$/.test(universalId)) return `urn:oid:${universalId}`;
    if (type === 'UUID' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(universalId)) {
      return `urn:uuid:${universalId.toLowerCase()}`;
    }
  }
  return defaultSystem;
}

// The medical record number: the first PID-3 repetition with type code MR.
function mapMrn(identifiers, decode, defaultSystem) {
  const mrn = objects(identifiers).find((id) => code(id.type) === 'MR' && decode(id.value));
  if (!mrn) return null;

  const identifier = {
    type: {
      coding: [{ system: IDENTIFIER_TYPE_SYSTEM, code: 'MR', display: 'Medical record number' }]
    },
    system: identifierSystem(decode(mrn.authorityId), mrn.authorityIdType, defaultSystem),
    value: decode(mrn.value)
  };

  const authority = decode(mrn.authority);
  if (authority) identifier.assigner = { display: authority };
  return identifier;
}

// One PID-5 repetition (XPN) to a HumanName.
function mapName(xpn, decode) {
  const family = decode(xpn.family);
  // PID-5.3 can hold more than one middle name, separated by spaces.
  const given = [decode(xpn.given), ...decode(xpn.middle).split(/\s+/)].filter(Boolean);
  if (!family && given.length === 0) return null;

  const name = {};
  const use = NAME_USE[code(xpn.type)];
  if (use) name.use = use;
  if (family) name.family = family;
  if (given.length > 0) name.given = given;
  const prefix = decode(xpn.prefix);
  if (prefix) name.prefix = [prefix];
  const suffix = decode(xpn.suffix);
  if (suffix) name.suffix = [suffix];
  return name;
}

// One PID-11 repetition (XAD) to an Address.
function mapAddress(xad, decode) {
  const address = {};
  const use = ADDRESS_USE[code(xad.type)];
  if (use) address.use = use;

  const line = [decode(xad.street), decode(xad.other)].filter(Boolean);
  if (line.length > 0) address.line = line;
  for (const field of ['city', 'state', 'postalCode', 'country']) {
    const value = decode(xad[field]);
    if (value) address[field] = value;
  }

  const hasContent = Object.keys(address).some((key) => key !== 'use');
  return hasContent ? address : null;
}

// Phone number from the XTN parts when PID-13.1 is empty.
function composeNumber(xtn, decode) {
  const local = decode(xtn.localNumber);
  if (!local) return '';
  const country = decode(xtn.countryCode).replace(/^\+/, '');
  const area = decode(xtn.areaCode);
  const extension = decode(xtn.extension);
  return [country && `+${country}`, area && `(${area})`, local, extension && `ext. ${extension}`]
    .filter(Boolean)
    .join(' ');
}

// One PID-13 repetition (XTN) to a ContactPoint.
function mapTelecom(xtn, decode) {
  const useCode = code(xtn.use);
  const equipment = code(xtn.equipment);
  const email = decode(xtn.email);

  let system;
  let value;
  if (email || TELECOM_SYSTEM[equipment] === 'email' || useCode === 'NET') {
    system = 'email';
    value = email || decode(xtn.number);
  } else {
    system = TELECOM_SYSTEM[equipment] || 'phone';
    value = decode(xtn.number) || composeNumber(xtn, decode);
  }
  if (!value) return null;

  const contact = { system, value };
  // V2-to-FHIR: when PID-13.2 is empty, the use is "home" (PID-13 is the home number field).
  let use = TELECOM_USE[useCode];
  if (!use && equipment === 'CP') use = 'mobile';
  if (!use && !useCode) use = 'home';
  if (use) contact.use = use;
  return contact;
}

/**
 * Builds a FHIR R4 Patient from the channel JSON.
 * Returns { patient, warnings }. "warnings" lists fields that were left out;
 * the texts contain no patient data, so they are safe to log.
 * Throws ValidationError when the input has no usable patient name.
 */
function toFhirPatient(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('The request body must be a JSON object.');
  }

  const decode = makeDecoder(input.delimiters);
  const warnings = [];
  const patient = { resourceType: 'Patient' };

  const identifier = mapMrn(input.identifiers, decode, options.mrnSystem || DEFAULT_MRN_SYSTEM);
  if (identifier) {
    patient.identifier = [identifier];
  } else {
    warnings.push('no PID-3 repetition with type code MR, so the Patient has no identifier');
  }

  const names = objects(input.names).map((xpn) => mapName(xpn, decode)).filter(Boolean);
  if (names.length === 0) {
    throw new ValidationError('The message has no patient name (PID-5).');
  }
  patient.name = names;

  const telecom = objects(input.phones).map((xtn) => mapTelecom(xtn, decode)).filter(Boolean);
  if (telecom.length > 0) patient.telecom = telecom;

  const gender = mapGender(input.gender);
  if (gender) {
    patient.gender = gender;
  } else if (text(input.gender)) {
    warnings.push('PID-8 is not a code from HL7 table 0001, so gender was left out');
  }

  const birthDate = toFhirDate(input.birthDate);
  if (birthDate) {
    patient.birthDate = birthDate;
  } else if (text(input.birthDate)) {
    warnings.push('PID-7 is not a valid HL7 date, so birthDate was left out');
  }

  const addresses = objects(input.addresses).map((xad) => mapAddress(xad, decode)).filter(Boolean);
  if (addresses.length > 0) patient.address = addresses;

  return { patient, warnings };
}

module.exports = {
  DEFAULT_MRN_SYSTEM,
  ValidationError,
  decodeEscapes,
  mapGender,
  toFhirDate,
  toFhirPatient
};
