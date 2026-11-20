#!/usr/bin/env node
import { main } from "../src/cli.js";

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(process.env.BEES_DEBUG ? err : `✖ Unexpected error: ${err.message}\n  Set BEES_DEBUG=1 for details, and please report it.`);
    process.exitCode = 1;
  },
);
