const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

const targetStr = `  // Build title from names (fallback to key if missing)
  const names = await Promise.all(
    participantKeys.map((k) => nameFromPublicSignKey(k)),
  );
  const title = topic || names.join(", ");
  const response = await toast.promise(
    (async () => {
      const res = await createConversation(() => adminDb)(
        participantKeys,
        title,
        credentials
      );`;

const replacement = `  // Build title from names (fallback to key if missing)
  const names = await Promise.all(
    participantKeys.map((k) => nameFromPublicSignKey(k)),
  );
  const title = topic || names.join(", ");
  
  // Check for costs
  let totalCost = 0;
  for (const key of participantKeys) {
    if (key === credentials.publicSignKey) continue;
    const { profile } = await getProfile(key);
    if (profile?.priceTag) {
      totalCost += profile.priceTag;
    }
  }
  
  if (totalCost > 0) {
    const costInDollars = (totalCost / 100).toFixed(2);
    if (!window.confirm(\`This outreach will cost $\${costInDollars}. Proceed?\`)) {
      return null;
    }
  }

  const response = await toast.promise(
    (async () => {
      const res = await createConversation(() => adminDb)(
        participantKeys,
        title,
        credentials
      );`;

code = code.replace(targetStr, replacement);
fs.writeFileSync("landing/src/chat.tsx", code);
