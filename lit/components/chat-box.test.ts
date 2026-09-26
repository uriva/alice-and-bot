import { assertMatch } from "@std/assert";

Deno.test(
  "chat-box template assigns dir to spinner indicator container and text span based on textDirection",
  () => {
    const code = Deno.readTextFileSync(
      new URL("./chat-box.ts", import.meta.url).pathname,
    );
    assertMatch(
      code,
      /<div[^>]*data-testid="spinner-indicator"[^>]*dir="\$\{direction\}"[^>]*style="\$\{indicatorTextStyle\([^)]*isRtl[^)]*\)\}"/,
    );
    assertMatch(
      code,
      /<span[^>]*data-testid="spinner-text"[^>]*dir="\$\{direction\}"[^>]*>\$\{spinner\s*\.\s*text\}<\/span>/,
    );
  },
);

Deno.test(
  "chat-box indicatorTextStyle applies start alignment and RTL padding",
  () => {
    const code = Deno.readTextFileSync(
      new URL("./chat-box.ts", import.meta.url).pathname,
    );
    assertMatch(
      code,
      /indicatorTextStyle[\s\S]*?padding:\$\{isRtl \? "6px 44px 6px 12px" : "6px 12px 6px 44px"\}/,
    );
    assertMatch(
      code,
      /indicatorTextStyle[\s\S]*?text-align:start/,
    );
  },
);

Deno.test(
  "chat-box linearBarTrackStyle aligns to the right on RTL",
  () => {
    const code = Deno.readTextFileSync(
      new URL("./chat-box.ts", import.meta.url).pathname,
    );
    assertMatch(
      code,
      /linearBarTrackStyle[\s\S]*?margin-left:auto;margin-right:0/,
    );
  },
);
