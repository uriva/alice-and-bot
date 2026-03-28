const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

// Inject new state variables and logic into YourKey
code = code.replace(
  /const \[aliasStatus, setAliasStatus\] = useState<\n    null \| \{ type: "success" \| "error"; message: string \}\n  >\(null\);/,
  `const [aliasStatus, setAliasStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  
  const [priceTagInput, setPriceTagInput] = useState(profile?.priceTag ? (profile.priceTag / 100).toString() : "0");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceStatus, setPriceStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [balanceData, setBalanceData] = useState<{balance: number, transactions: any[]} | null>(null);

  useEffect(() => {
    setPriceTagInput(profile?.priceTag ? (profile.priceTag / 100).toString() : "0");
  }, [profile?.priceTag]);

  useEffect(() => {
    getBalanceAndTransactionsSigned(credentials).then((res) => {
      if (!("error" in res)) {
        setBalanceData(res);
      }
    });
  }, [credentials]);

  const onSavePrice = async () => {
    const val = parseFloat(priceTagInput);
    if (isNaN(val) || val < 0) {
      setPriceStatus({ type: "error", message: "Invalid price" });
      return;
    }
    setSavingPrice(true);
    setPriceStatus(null);
    // Convert USD to cents
    const priceTagCents = Math.round(val * 100);
    const res = await setPriceTagSigned({ priceTag: priceTagCents, credentials });
    setSavingPrice(false);
    if (res.success) {
      setPriceStatus({ type: "success", message: "Price saved" });
      setTimeout(() => setPriceStatus(null), 2000);
    } else {
      setPriceStatus({ type: "error", message: "Failed to save price" });
    }
  };`,
);

// Inject UI for balance and price tag
code = code.replace(
  /<div style=\{\{\n          display: "flex",\n          flexDirection: "column",\n          gap: 16,\n          width: "100%",\n        \}\}>/,
  `<div style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: "100%",
        }}>
        {/* Balance Display */}
        {balanceData && (
          <div style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.05)",
            borderRadius: "8px"
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", opacity: 0.7 }}>Account Balance</div>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>$\{(balanceData.balance / 100).toFixed(2)\}</div>
            </div>
            {balanceData.balance > 0 && (
              <button
                className="button-base primary"
                style={{ alignSelf: "center", padding: "8px 16px" }}
                onClick={() => toast("Payouts are coming soon!")}
              >
                Withdraw
              </button>
            )}
          </div>
        )}`,
);

code = code.replace(
  /\{aliasStatus && \(\n            <div\n              style=\{\{\n                color: aliasStatus\.type === "error" \? "#e53e3e" \: "#38a169",\n                fontSize: "14px",\n              \}\}\n            >\n              \{aliasStatus\.message\}\n            <\/div>\n          \)\}\n        <\/div>\n      <\/div>/,
  `{aliasStatus && (
            <div
              style={{
                color: aliasStatus.type === "error" ? "#e53e3e" : "#38a169",
                fontSize: "14px",
              }}
            >
              {aliasStatus.message}
            </div>
          )}
        </div>

        {/* Price Tag Setting */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Message Price (USD)</label>
          <div style={{ fontSize: "14px", opacity: 0.7 }}>
            Cost for new users to start a conversation with you.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ alignSelf: "center" }}>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceTagInput}
              onInput={(e) => setPriceTagInput(e.currentTarget.value)}
              className="text-input"
              style={{ flex: 1 }}
              placeholder="0.00"
            />
            <button
              onClick={onSavePrice}
              disabled={savingPrice}
              className="button-base primary"
            >
              {savingPrice ? "Saving..." : "Save"}
            </button>
          </div>
          {priceStatus && (
            <div
              style={{
                color: priceStatus.type === "error" ? "#e53e3e" : "#38a169",
                fontSize: "14px",
              }}
            >
              {priceStatus.message}
            </div>
          )}
        </div>
      </div>`,
);

fs.writeFileSync("landing/src/chat.tsx", code);
