import assert from "node:assert/strict";
import {
    getVaultAccess,
    requireVaultPermission,
} from "./permissions.js";

const readOnly = getVaultAccess(["READ"]);
assert.equal(readOnly.canRead, true);
assert.equal(readOnly.canWrite, false);

const writeOnly = getVaultAccess(["WRITE"]);
assert.equal(writeOnly.canRead, false);
assert.equal(writeOnly.canWrite, true);

const readWrite = getVaultAccess(["READ", "WRITE"]);
assert.equal(readWrite.canRead, true);
assert.equal(readWrite.canWrite, true);

const noAccess = getVaultAccess([]);
assert.equal(noAccess.canRead, false);
assert.equal(noAccess.canWrite, false);

assert.equal(requireVaultPermission(["READ"], "READ"), true);
assert.equal(requireVaultPermission(["READ"], "WRITE"), false);
assert.equal(requireVaultPermission(["WRITE"], "READ"), false);
assert.equal(requireVaultPermission(["WRITE"], "WRITE"), true);

console.log("All authorization permission tests passed.");