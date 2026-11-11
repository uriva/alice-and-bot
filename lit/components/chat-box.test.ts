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

Deno.test(
  "chat-box header menu and close buttons share headerButtonStyle and centered SVG icons",
  () => {
    const code = Deno.readTextFileSync(
      new URL("./chat-box.ts", import.meta.url).pathname,
    );
    assertMatch(
      code,
      /headerButtonStyle[\s\S]*?font-size:16px;line-height:1;flex-shrink:0/,
    );
    assertMatch(
      code,
      /data-testid="widget-close-button"[\s\S]*?style="\$\{headerButtonStyle\}"[\s\S]*?\$\{faTimes\}/,
    );
  },
);

Deno.test(
  "chat-box input row buttons share 18px icon sizing and hide send-button when inactive",
  () => {
    const chatBoxCode = Deno.readTextFileSync(
      new URL("./chat-box.ts", import.meta.url).pathname,
    );
    const iconsCode = Deno.readTextFileSync(
      new URL("./icons.ts", import.meta.url).pathname,
    );
    assertMatch(
      iconsCode,
      /faPaperclip = icon\(\s*"[^"]+",\s*"0 61 450 450"/,
    );
    assertMatch(
      chatBoxCode,
      /attachButtonStyle[\s\S]*?font-size:18px;line-height:1/,
    );
    assertMatch(
      chatBoxCode,
      /showActionBtn = showMic \|\| showStop \|\| showSendBtn/,
    );
    assertMatch(
      chatBoxCode,
      /data-testid="send-button"[\s\S]*?display:\$\{showActionBtn\s*\?\s*"flex"\s*:\s*"none"\}/,
    );
  },
);
