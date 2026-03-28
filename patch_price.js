const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

const regex =
  /\{profile\?\.alias && \(\n\s*<div class=\{hintStyle\}>\n\s*Your public link:\n\s*<br \/>\n\s*<a\n\s*href=\{chatWithMeLink\(profile\.alias\)\}\n\s*target="_blank"\n\s*class="text-blue-500 hover:text-blue-600 dark:text-blue-400"\n\s*>\n\s*\{chatWithMeLink\(profile\.alias\)\}\n\s*<\/a>\n\s*<\/div>\n\s*\)\}\n\s*<\/div>/;

const insert = `{profile?.alias && (
          <div class={hintStyle}>
            Your public link:
            <br />
            <a
              href={chatWithMeLink(profile.alias)}
              target="_blank"
              class="text-blue-500 hover:text-blue-600 dark:text-blue-400"
            >
              {chatWithMeLink(profile.alias)}
            </a>
          </div>
        )}
      </div>
      
      {/* Price Tag Setting */}
      <div class="flex flex-col gap-2">
        <label class="font-bold text-sm text-gray-700 dark:text-gray-300">
          Message Price (USD)
        </label>
        <div class="flex gap-2">
          <span class="self-center">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceTagInput}
            onInput={(e) => setPriceTagInput(e.currentTarget.value)}
            class={inputStyle}
            style={{ flex: 1 }}
            placeholder="0.00"
          />
          <button
            type="button"
            class={buttonGreenStyle}
            onClick={onSavePrice}
            disabled={savingPrice}
          >
            {savingPrice ? "Saving..." : "Save"}
          </button>
        </div>
        <div class={hintStyle}>
          Cost for new users to start a conversation with you.
        </div>
        {priceStatus && (
          <div
            class={\`text-xs \${
              priceStatus.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }\`}
          >
            {priceStatus.message}
          </div>
        )}
      </div>`;

if (code.match(regex)) {
  code = code.replace(regex, insert);
  fs.writeFileSync("landing/src/chat.tsx", code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find regex to patch");
}
