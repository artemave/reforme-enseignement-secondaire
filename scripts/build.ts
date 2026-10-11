import { writePassagePages } from '../src/passage-pages.js';
import { configFromEnv } from '../src/config.js';
import { build } from 'vite';
import './prepare.js';
await build();
await writePassagePages(configFromEnv(process.env).siteUrl);
