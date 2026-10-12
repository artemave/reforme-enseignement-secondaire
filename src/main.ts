import { installPageTransitions } from './transitions.js';
import { installTheme } from './theme.js';
import { load } from './ui.js';
installPageTransitions(document);
installTheme(document);
await load(document);
