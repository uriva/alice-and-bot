import { assertEquals, assertFalse, assertNotEquals } from "@std/assert";
import {
  attachmentPrimaryColor,
  defaultOtherBubble,
  defaultPrimary,
  isLightColor,
  messageBubbleColor,
  messageParticipantColor,
  quoteBarColor,
  shouldShowAvatar,
  shouldShowName,
} from "./design.ts";
import { renderMarkdown, textDirection } from "./markdown.ts";

Deno.test("attachmentPrimaryColor uses custom primary when provided", () => {
  assertEquals(attachmentPrimaryColor(true, { primary: "#ff0000" }), "#ff0000");
});

Deno.test("attachmentPrimaryColor falls back to defaultPrimary for dark", () => {
  assertEquals(attachmentPrimaryColor(true), defaultPrimary(true));
});

Deno.test("attachmentPrimaryColor does not use otherBubble color even when set", () => {
  const otherBubble = defaultOtherBubble(true);
  assertNotEquals(
    attachmentPrimaryColor(true, { otherBubble, primary: "#00ff00" }),
    otherBubble,
  );
});

Deno.test("attachmentPrimaryColor ignores otherBubble when primary not set", () => {
  const otherBubble = defaultOtherBubble(true);
  assertEquals(
    attachmentPrimaryColor(true, { otherBubble }),
    defaultPrimary(true),
  );
});

Deno.test(
  "1:1 chat other message bubble and name have different colors",
  () => {
    const bubble = messageBubbleColor({
      isOwn: false,
      isDark: false,
      customColors: undefined,
    });
    const participant = messageParticipantColor({
      isGroupChat: false,
      isDark: false,
      customColors: undefined,
      authorId: "x",
    });
    assertNotEquals(bubble, participant);
  },
);

Deno.test(
  "1:1 chat other message bubble and name differ with custom primary",
  () => {
    const customColors = { primary: "#ff0000" };
    const bubble = messageBubbleColor({
      isOwn: false,
      isDark: false,
      customColors,
    });
    const participant = messageParticipantColor({
      isGroupChat: false,
      isDark: false,
      customColors,
      authorId: "x",
    });
    assertNotEquals(bubble, participant);
  },
);

Deno.test("other message text color is dark in light mode", () => {
  const bubble = messageBubbleColor({
    isOwn: false,
    isDark: false,
    customColors: undefined,
  });
  const textColor = isLightColor(bubble) ? "#222" : "#fff";
  assertEquals(textColor, "#222");
});

Deno.test("quote bar color uses primary not blue", () => {
  const color = quoteBarColor(false);
  assertFalse(
    color.startsWith("#4f") || color.startsWith("#63") ||
      color.startsWith("#81"),
  );
});

Deno.test("avatar hidden in 1:1 chat", () => {
  assertFalse(
    shouldShowAvatar({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: false,
    }),
  );
});

Deno.test("avatar shown in group chat", () => {
  assertEquals(
    shouldShowAvatar({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: true,
    }),
    true,
  );
});

Deno.test("name hidden in 1:1 chat", () => {
  assertFalse(
    shouldShowName({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: false,
      hideNames: false,
    }),
  );
});

Deno.test("name shown in group chat", () => {
  assertEquals(
    shouldShowName({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: true,
      hideNames: false,
    }),
    true,
  );
});

Deno.test("fenced code block has fenced-code-wrap class for copy handler", () => {
  const html = renderMarkdown("```ts\nconst x = 1;\n```", "#222", false);
  assertEquals(html.includes('class="fenced-code-wrap'), true);
});

Deno.test("inline code has user-select: text and -webkit-user-select: text styling", () => {
  const html = renderMarkdown("This is `code` inline.", "#222", false);
  assertEquals(html.includes("user-select:text"), true);
  assertEquals(html.includes("-webkit-user-select:text"), true);
});

Deno.test("renderMarkdown strips wrapping p/span tags for single-paragraph messages to prevent trailing newlines on copy", () => {
  const html = renderMarkdown("Hello World", "#222", false);
  assertEquals(html, "Hello World");
});

Deno.test("renderMarkdown preserves span tags with bottom margin for multi-paragraph messages", () => {
  const html = renderMarkdown("Hello World\n\nSecond Paragraph", "#222", false);
  assertEquals(html.startsWith('<span dir="ltr"'), true);
  assertEquals(html.endsWith("</span>"), true);
});

Deno.test("renderMarkdown list items do not contain double line breaks between bullets", () => {
  const html = renderMarkdown("* first\n* second\n* third", "#222", false);
  assertFalse(/<li[\s\S]*?<br\s*\/?>\s*<br\s*\/?>[\s\S]*?<\/li>/i.test(html));
});

Deno.test("renderMarkdown renders unclosed anchor tag as a link during streaming without escaping to raw html", () => {
  const html = renderMarkdown(
    'Visit <a href="https://example.com">Google',
    "#222",
    false,
  );
  assertEquals(html.includes('<a href="https://example.com"'), true);
  assertEquals(html.includes("&lt;a"), false);
  assertEquals(html.includes("Google</a>"), true);
});

Deno.test("renderMarkdown does not display incomplete trailing tag during streaming", () => {
  const html = renderMarkdown(
    'Visit <a href="https://example.c',
    "#222",
    false,
  );
  assertEquals(html.includes("&lt;a"), false);
  assertEquals(html.includes("<a href="), false);
  assertEquals(html, "Visit ");
});

Deno.test("renderMarkdown renders RTL text with bullet points as an RTL list", () => {
  const input = `אספתי את כל המידע מהאתר של Social Dental Clinic:

• כתובת: לוינסקי 81, תל אביב-יפו
• טלפון: 03-6996544 | אימייל: office@clinic.org.il
• זמינות: פתוח 7 ימים בשבוע (כולל שישי, שבת ומקרי חירום)
• שירותים עיקריים: יישור שיניים, שיננית, הלבנות, ציפויי חרסינה, השתלות, כתרים וגשרים, סתימות, טיפולי שורש, עקירות ושיקום פה מלא
• שפות שירות: עברית, English, Tagalog
• אינטגרציה: מערכת RapidOne לניהול וזימון תורים, טיפול בלידים ומעקב מטופלים (נשתמש ב-API Key שהעברת)

אז אתה מעוניין בסוכן חכם לקליניקה שיספק מענה ושירות למטופלים, יקלוט פניות ויתממשק למערכת RapidOne. להמשיך ולבנות אותו עבורך?`;

  const html = renderMarkdown(input, "#222", false);
  assertEquals(html.includes('<ul dir="rtl"'), true);
  assertEquals(
    html.includes(
      '<li style="margin:2px 0"><span dir="rtl">כתובת: לוינסקי 81, תל אביב-יפו</span></li>',
    ),
    true,
  );
});

Deno.test("renderMarkdown renders RTL paragraphs and bullets starting with English words with dir=rtl", () => {
  const input = `הסוכן של Social Dental Clinic נוצר בהצלחה! 🦷✨
שמרתי גם את ה-API Key של RapidOne בצורה מאובטחת בהגדרות הסוכן.

קישורים לבדיקה והתנסות מיידית:
• צ'אט ישיר ב-Alice & Bot
• התנסות ב-Telegram Demo

אפשרויות פריסה והטמעה:
לאחר שתתנסה, נוכל לחבר את הסוכן ל:

WhatsApp ייעודי (הרשמי של מטא או קו סופרגרין).
ווידג'ט צ'אט מעוצב להטמעה ישירה באתר המרפאה.
Telegram ייעודי או ערוצים נוספים.
בנוסף, תוכל לנהל ולערוך את הגדרות הסוכן בכל עת ב-דשבורד של prompt2bot, ומוזמן להצטרף ל-קבוצת הוואטסאפ של הקהילה לשאלות, טיפים ועדכונים!`;

  const html = renderMarkdown(input, "#222", false);
  assertEquals(html.includes('<span dir="rtl">WhatsApp ייעודי'), true);
  assertEquals(html.includes('<ul dir="rtl"'), true);
  assertEquals(
    html.includes(
      '<li style="margin:2px 0"><span dir="rtl">צ&#39;אט ישיר ב-Alice &amp; Bot</span></li>',
    ),
    true,
  );
  assertEquals(
    html.includes(
      '<li style="margin:2px 0"><span dir="rtl">התנסות ב-Telegram Demo</span></li>',
    ),
    true,
  );
});

Deno.test(
  "textDirection detects Hebrew greeting with English bot name as rtl",
  () => {
    const text =
      "שלום אורי! נעים להכיר, אני כאן כדי לעזור לך לבנות ולהגדיר את האייג'נט שלך ב-prompt2bot.";
    assertEquals(textDirection(text), "rtl");
  },
);
