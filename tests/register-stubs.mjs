import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./loader.stubs.mjs', pathToFileURL('./tests/'));
