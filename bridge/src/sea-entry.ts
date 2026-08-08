// Entry point for the compiled single-executable build (see sea/build.mjs).
// A Node SEA binary has no separate "script path" argv entry the way
// `node script.js a b` does — argv[0] is the executable itself and user
// args start at index 1, not 2.
import { main } from './cli.js';

main(process.argv.slice(1));
