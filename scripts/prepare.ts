import { prepare } from '../src/artifacts.js';
import { configFromEnv } from '../src/config.js';
await prepare(configFromEnv(process.env), new Date().toISOString());
