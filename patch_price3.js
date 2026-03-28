const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

const targetStr = `        {profile?.alias && (
          <div class={hintStyle}>
            Current alias:&nbsp;
            <span class="font-mono">@{profile.alias}</span>
          </div>
        )}
      </div>`;

const insert = `        {profile?.alias && (
          <div class={hintStyle}>
            Current alias:&nbsp;
            <span class="font-mono">@{profile.alias}</span>
          </div>
        )}
      </div>
      
      {/* Balance Display */}
      {balanceData && (
        <div class="flex flex-row justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg mb-2">
          <div>
            <div class="font-semibold text-sm opacity-70">Account Balance</div>
            <div class="text-2xl font-bold">$\{(balanceData.balance / 100).toFixed(2)\}</div>
          </div>
          {balanceData.balance > 0 && (
            <button
              class={buttonBlueStyle}
              onClick={() => toast("Payouts are coming soon!")}
            >
              Withdraw
            </button>
          )}
        </div>
      )}

      {/* Price Tag Setting */}
      <div class="flex flex-col gap-2 mb-4">
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

code = code.replace(targetStr, insert);
fs.writeFileSync("landing/src/chat.tsx", code);
