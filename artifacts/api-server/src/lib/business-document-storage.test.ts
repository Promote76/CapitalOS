import assert from "node:assert/strict";
import test from "node:test";
import { assertDocumentUploadGrant, createDocumentUploadGrant } from "./business-document-storage";

test("upload grants bind household, user, object, content type, and size", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-only-document-grant-secret";
  try {
    const claims = {
      householdId: "household-a",
      userId: "user-a",
      objectPath: "/objects/uploads/12345678-1234-1234-1234-123456789abc",
      contentType: "text/csv",
      size: 128,
    };
    const grant = createDocumentUploadGrant(claims);
    assert.doesNotThrow(() => assertDocumentUploadGrant(grant, claims));
    assert.throws(() => assertDocumentUploadGrant(grant, { ...claims, householdId: "household-b" }), /another household/i);
    assert.throws(() => assertDocumentUploadGrant(grant, { ...claims, size: 129 }), /another household/i);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});