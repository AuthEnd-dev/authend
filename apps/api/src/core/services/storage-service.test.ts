import { describe, expect, test } from "bun:test";
import { HttpError } from "../lib/http";
import { validateImageMagicBytes } from "./storage-service";

describe("validateImageMagicBytes", () => {
  test("allows non-image MIME without checking", () => {
    expect(() => validateImageMagicBytes(Buffer.from("hello"), "application/pdf")).not.toThrow();
  });

  test("accepts valid PNG signature", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(() => validateImageMagicBytes(buf, "image/png")).not.toThrow();
  });

  test("rejects invalid PNG", () => {
    const buf = Buffer.from("not a png");
    expect(() => validateImageMagicBytes(buf, "image/png")).toThrow(HttpError);
  });

  test("accepts valid JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(() => validateImageMagicBytes(buf, "image/jpeg")).not.toThrow();
  });

  test("accepts valid GIF89a", () => {
    const buf = Buffer.from("GIF89a\x00");
    expect(() => validateImageMagicBytes(buf, "image/gif")).not.toThrow();
  });

  test("accepts minimal WebP", () => {
    const buf = Buffer.alloc(12);
    buf.write("RIFF", 0);
    buf.write("WEBP", 8);
    expect(() => validateImageMagicBytes(buf, "image/webp")).not.toThrow();
  });
});
