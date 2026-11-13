import { assertEquals } from "@std/assert";
import { validateView } from "./view.ts";

Deno.test("validateView rejects unsafe URL protocols on href and src attributes", () => {
  const unsafeUrls = [
    "javascript:alert(1)",
    "  \tJaVaScRiPt:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "//evil.com/steal",
    "/\\evil.com/steal",
  ];

  unsafeUrls.forEach((badUrl) => {
    const linkCheck = validateView({
      tag: "a",
      attrs: { href: badUrl },
      text: "Click",
    });
    assertEquals(
      linkCheck.ok,
      false,
      `Expected validateView to reject <a href="${badUrl}">`,
    );

    const imgCheck = validateView({
      tag: "img",
      attrs: { src: badUrl, alt: "pic" },
    });
    assertEquals(
      imgCheck.ok,
      false,
      `Expected validateView to reject <img src="${badUrl}">`,
    );
  });
});

Deno.test("validateView accepts https:, http:, mailto:, #, and single-slash relative URLs", () => {
  const safeHrefs = [
    "https://aliceandbot.com/chat",
    "http://localhost:8000/test",
    "mailto:hello@aliceandbot.com",
    "/docs/getting-started",
    "#pricing",
  ];

  safeHrefs.forEach((goodUrl) => {
    const res = validateView({
      tag: "a",
      attrs: { href: goodUrl },
      text: "Safe",
    });
    assertEquals(
      res.ok,
      true,
      `Expected validateView to allow <a href="${goodUrl}">`,
    );
  });
});
