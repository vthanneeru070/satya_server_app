const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.WEBSITE_URL = "https://www.sathya.co.za";
process.env.DONATION_RECIPIENT_NAME = "Example Recipient (Pty) Ltd";
process.env.DONATION_PURPOSE = "Support Sathya spiritual programmes";
process.env.DONATION_CONTACT_EMAIL = "donations@example.com";

const {
  readDonationPublicConfig,
  isAllowedWebsiteDonationRedirect,
} = require("./websiteDonation");

describe("websiteDonation config", () => {
  it("exposes non-secret public config", () => {
    const cfg = readDonationPublicConfig();
    assert.equal(cfg.currency, "ZAR");
    assert.equal(cfg.minAmount, 10);
    assert.equal(cfg.maxAmount, 1_000_000);
    assert.deepEqual(cfg.suggestedAmounts, [50, 100, 250, 500]);
    assert.equal(cfg.recipientName, "Example Recipient (Pty) Ltd");
    assert.equal(cfg.configIncomplete, false);
    assert.ok(cfg.returnUrl.includes("/donate/success"));
    assert.ok(cfg.cancelUrl.includes("/donate/cancelled"));
  });

  it("rewrites origin-only return/cancel env URLs to donate landings", () => {
    process.env.WEBSITE_DONATION_RETURN_URL = "https://www.sathya.co.za/";
    process.env.WEBSITE_DONATION_CANCEL_URL = "https://www.sathya.co.za";
    // Re-require so this process picks up env (module already loaded — call normalize via config).
    const {
      normalizeWebsiteDonationLandingUrl,
      readWebsiteUrl,
    } = require("./websiteDonation");
    assert.equal(
      normalizeWebsiteDonationLandingUrl("https://www.sathya.co.za/", "/donate/success"),
      `${readWebsiteUrl()}/donate/success`
    );
    assert.equal(
      normalizeWebsiteDonationLandingUrl("https://www.sathya.co.za", "/donate/cancelled"),
      `${readWebsiteUrl()}/donate/cancelled`
    );
    assert.equal(
      normalizeWebsiteDonationLandingUrl(
        "https://www.sathya.co.za/donate/success?from=app",
        "/donate/success"
      ),
      "https://www.sathya.co.za/donate/success?from=app"
    );
    delete process.env.WEBSITE_DONATION_RETURN_URL;
    delete process.env.WEBSITE_DONATION_CANCEL_URL;
  });

  it("allows only HTTPS sathya website and known API payment landings", () => {
    assert.equal(
      isAllowedWebsiteDonationRedirect("https://www.sathya.co.za/donate/success"),
      true
    );
    assert.equal(
      isAllowedWebsiteDonationRedirect("https://www.sathya.co.za/#/donate/success"),
      true
    );
    assert.equal(
      isAllowedWebsiteDonationRedirect("https://api.sathya.co.za/payment-success"),
      true
    );
    assert.equal(
      isAllowedWebsiteDonationRedirect("http://www.sathya.co.za/donate/success"),
      false
    );
    assert.equal(
      isAllowedWebsiteDonationRedirect("https://evil.example/donate/success"),
      false
    );
    assert.equal(isAllowedWebsiteDonationRedirect(""), false);
  });
});

