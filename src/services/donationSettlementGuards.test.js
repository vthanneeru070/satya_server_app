const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

/**
 * Mirrors the ownership guard used in settleDonationInTransaction so we can
 * regression-test APP vs WEBSITE behaviour without Mongo.
 */
const assertDonationOwnerOrAdmin = ({ contribution, userId, isAdmin }) => {
  if (!isAdmin) {
    if (!contribution.user || String(contribution.user) !== String(userId)) {
      const err = new Error("No payment record matches this reference");
      err.status = 404;
      throw err;
    }
  }
};

describe("donation settlement ownership", () => {
  it("allows ITN/admin settlement for website donations with null user", () => {
    assert.doesNotThrow(() =>
      assertDonationOwnerOrAdmin({
        contribution: { user: null, source: "WEBSITE" },
        userId: "null",
        isAdmin: true,
      })
    );
  });

  it("rejects non-admin verify against website donations", () => {
    assert.throws(
      () =>
        assertDonationOwnerOrAdmin({
          contribution: { user: null, source: "WEBSITE" },
          userId: "507f1f77bcf86cd799439011",
          isAdmin: false,
        }),
      (err) => err.status === 404
    );
  });

  it("allows owner verify for authenticated APP donations", () => {
    const userId = "507f1f77bcf86cd799439011";
    assert.doesNotThrow(() =>
      assertDonationOwnerOrAdmin({
        contribution: { user: userId, source: "APP" },
        userId,
        isAdmin: false,
      })
    );
  });
});
