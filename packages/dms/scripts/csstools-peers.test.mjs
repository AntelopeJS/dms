import assert from "node:assert/strict";
import { unmetTokenizerPeers } from "./helpers/csstools-peers.mjs";

assert.deepEqual(unmetTokenizerPeers(), []);
