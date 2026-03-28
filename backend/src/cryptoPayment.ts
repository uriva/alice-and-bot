import { query, transact, tx } from "./db.ts";
import { id } from "@instantdb/admin";

type CryptoPayment = {
  order_id: string;
  amount: string;
  amount_in_btc: string;
  amount_paid_in_btc: string;
  status: string;
  address: string;
  tid: string;
  transaction_ids: string;
  keychain_id: string;
  last_keychain_id: string;
  after_payment_redirect_to: string;
  auto_redirect: string;
  "data[publicSignKey]": string;
  "data[exchange_rate]": string;
};

const extractRate = (input: string): number => {
  const match = /"rate"\s*=>\s*"(\d+(\.\d+)?\s+BTC\s*=\s*\d+(\.\d+)?\s+USD)"/
    .exec(input);
  if (match?.[1]) {
    const rateString = match[1];
    const rateNumberMatch = /(\d+(\.\d+)?)\s+USD/.exec(rateString);
    if (rateNumberMatch?.[1]) {
      return Number.parseFloat(rateNumberMatch[1]);
    }
    throw new Error("Rate number not found in rate string");
  }
  throw new Error("Rate not found in input string");
};

export const handleCryptoPayment = async (payment: CryptoPayment) => {
  console.log("Processing crypto payment:", payment);
  const publicSignKey = payment["data[publicSignKey]"];
  if (!publicSignKey) {
    console.error("Missing data[publicSignKey] in crypto payment payload");
    return;
  }

  const rate = extractRate(payment["data[exchange_rate]"]);
  const sumBtc = Number.parseFloat(payment.amount_paid_in_btc);
  if (isNaN(sumBtc)) {
    console.error("Invalid amount_paid_in_btc");
    return;
  }

  const usdAmount = Math.round(sumBtc * rate * 100); // converting to cents

  const { identities } = await query({
    identities: { wallet: {}, $: { where: { publicSignKey } } },
  });

  if (identities.length === 0) {
    console.error("Identity not found for publicSignKey:", publicSignKey);
    return;
  }

  const identity = identities[0];
  const newBalance = (identity.wallet?.balance || 0) + usdAmount;

  await transact([
    tx.wallets[identity.wallet?.id || id()].update({ balance: newBalance })
      .link({ identity: identity.id }),
    tx.transactions[id()].update({
      amount: usdAmount,
      type: "deposit",
      timestamp: Date.now(),
      status: "completed",
    }).link({ receiver: identity.id }),
  ]);

  console.log(`Successfully credited ${usdAmount} cents to ${publicSignKey}`);
};
