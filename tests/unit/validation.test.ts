import { describe, expect, it } from "vitest";
import { ValidationError } from "@/domain/errors";
import { mailboxAddresses } from "@/domain/mailbox-addresses";
import { createOrderSchema, idempotencyKeySchema } from "@/server/validation/order-schemas";
import { parseOrThrow } from "@/server/validation/parse";

describe("createOrderSchema", () => {
  it("normalises the domain and coerces the count", () => {
    expect(createOrderSchema.parse({ domain: " Acme.COM ", provider: "google", mailboxCount: "7" })).toEqual({
      domain: "acme.com",
      provider: "google",
      mailboxCount: 7,
    });
  });

  it.each([
    ["https://acme.com", "domain"],
    ["acme", "domain"],
    ["-acme.com", "domain"],
  ])("rejects domain %s", (domain, field) => {
    const r = createOrderSchema.safeParse({ domain, provider: "google", mailboxCount: 1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual([field]);
  });

  it.each([0, 51, 2.5, "abc"])("rejects mailboxCount %s", (mailboxCount) => {
    expect(createOrderSchema.safeParse({ domain: "acme.com", provider: "google", mailboxCount }).success).toBe(false);
  });

  it("rejects unknown providers", () => {
    expect(createOrderSchema.safeParse({ domain: "acme.com", provider: "yahoo", mailboxCount: 1 }).success).toBe(false);
  });
});

describe("parseOrThrow", () => {
  it("turns zod issues into a 400 ValidationError with per-field messages", () => {
    try {
      parseOrThrow(createOrderSchema, { domain: "nope", provider: "google", mailboxCount: 99 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const e = err as ValidationError;
      expect(e.status).toBe(400);
      expect(e.details).toEqual({
        fields: {
          domain: "Enter a domain like acme.com (no http://, no paths).",
          mailboxCount: "At most 50 mailboxes per order.",
        },
      });
    }
  });

  it("requires a sane Idempotency-Key", () => {
    expect(() => parseOrThrow(idempotencyKeySchema, undefined)).toThrow("Idempotency-Key header is required.");
    expect(() => parseOrThrow(idempotencyKeySchema, "short")).toThrow(ValidationError);
    expect(parseOrThrow(idempotencyKeySchema, "0b9a4b8e-6f1d-4a43-9d2a-3c1f2f5e8a10")).toHaveLength(36);
  });
});

describe("mailboxAddresses", () => {
  it("is deterministic and unique up to 50", () => {
    const a = mailboxAddresses("acme.com", 50);
    expect(a).toEqual(mailboxAddresses("acme.com", 50));
    expect(new Set(a).size).toBe(50);
    expect(a[0]).toBe("alex@acme.com");
    expect(a[25]).toBe("alex2@acme.com");
  });
});
