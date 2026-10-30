'use strict';

const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
// 127.0.0.1 by default so a local run is not reachable from the network.
// The Docker image sets HOST=0.0.0.0, because the engine container must reach it.
const host = process.env.HOST || '127.0.0.1';

const app = createApp({ mrnSystem: process.env.MRN_SYSTEM });

app.listen(port, host, () => {
  console.log(`FHIR converter listening on http://${host}:${port} (POST /convert/patient)`);
});
