import { Inject, Injectable } from "@nestjs/common";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { notConfigured, upstreamFailed } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";

/** Circle-issued native USDC on Sui mainnet (circle.com/blog/now-available-native-usdc-on-sui). */
export const USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const USDC_DECIMALS = 6;

/** Tatum's Sui mainnet gateway currently exposes GraphQL (see https://sui-mainnet.gateway.tatum.io/_methods). */
const TATUM_SUI_GRAPHQL = "https://sui-mainnet.gateway.tatum.io/graphql";
/** Public Mysten endpoint, used only to verify sign-in signatures when no Tatum key is set. */
const PUBLIC_SUI_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";

export type UsdcTransfer = {
  digest: string;
  date: string | null;
  direction: "in" | "out";
  amount: string;
  counterparty: string | null;
  status: "success" | "failure" | "unknown";
};

type TransfersQuery = {
  transactions: {
    nodes: {
      digest: string;
      sender: { address: string } | null;
      effects: {
        timestamp: string | null;
        status: string | null;
        balanceChanges: {
          nodes: { owner: { address: string } | null; coinType: { repr: string } | null; amount: string | null }[];
        } | null;
      } | null;
    }[];
  } | null;
};

const TRANSFERS_QUERY = `
  query SovraUsdcTransfers($address: SuiAddress!, $last: Int!) {
    transactions(last: $last, filter: { affectedAddress: $address }) {
      nodes {
        digest
        sender { address }
        effects {
          timestamp
          status
          balanceChanges(first: 20) {
            nodes { owner { address } coinType { repr } amount }
          }
        }
      }
    }
  }
`;

/** Converts a raw integer amount with `decimals` places into a decimal string. */
export function formatUnits(raw: bigint, decimals: number) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

const normalize = (address: string) => address.toLowerCase();

@Injectable()
export class TatumService {
  private readonly tatum: SuiGraphQLClient | null;
  private readonly publicClient: SuiGraphQLClient;

  constructor(@Inject(ENV) env: Env) {
    this.tatum = env.TATUM_API_KEY
      ? new SuiGraphQLClient({ url: TATUM_SUI_GRAPHQL, network: "mainnet", headers: { "x-api-key": env.TATUM_API_KEY } })
      : null;
    this.publicClient = new SuiGraphQLClient({ url: PUBLIC_SUI_GRAPHQL, network: "mainnet" });
  }

  get configured() {
    return this.tatum !== null;
  }

  /** Client used to verify zkLogin signatures. Prefers Tatum, falls back to the public endpoint. */
  get verificationClient(): SuiGraphQLClient {
    return this.tatum ?? this.publicClient;
  }

  private get client(): SuiGraphQLClient {
    if (!this.tatum) throw notConfigured("Tatum (TATUM_API_KEY)");
    return this.tatum;
  }

  async getUsdcBalance(address: string) {
    const client = this.client;
    try {
      const { balance } = await client.core.getBalance({ owner: address, coinType: USDC_COIN_TYPE });
      return { raw: balance.balance, usdc: formatUnits(BigInt(balance.balance), USDC_DECIMALS) };
    } catch (err) {
      throw upstreamFailed("Tatum", err instanceof Error ? err.message : undefined);
    }
  }

  /** Recent transactions touching `address`, reduced to USDC movements in or out of it. */
  async getRecentUsdcTransfers(address: string, limit = 25): Promise<UsdcTransfer[]> {
    const client = this.client;
    const result = await client
      .query<TransfersQuery, { address: string; last: number }>({
        query: TRANSFERS_QUERY,
        variables: { address, last: limit },
      })
      .catch((err: unknown) => {
        throw upstreamFailed("Tatum", err instanceof Error ? err.message : undefined);
      });
    if (result.errors?.length) throw upstreamFailed("Tatum", result.errors[0].message);

    const me = normalize(address);
    const transfers: UsdcTransfer[] = [];
    for (const tx of result.data?.transactions?.nodes ?? []) {
      const changes = (tx.effects?.balanceChanges?.nodes ?? []).filter(
        (c) => c.coinType?.repr && normalize(c.coinType.repr) === normalize(USDC_COIN_TYPE) && c.amount,
      );
      const mine = changes.find((c) => c.owner && normalize(c.owner.address) === me);
      if (!mine?.amount) continue;
      const amount = BigInt(mine.amount);
      if (amount === 0n) continue;
      const direction = amount > 0n ? "in" : "out";
      const other = changes.find(
        (c) => c.owner && normalize(c.owner.address) !== me && c.amount && (BigInt(c.amount) > 0n) !== (amount > 0n),
      );
      transfers.push({
        digest: tx.digest,
        date: tx.effects?.timestamp ?? null,
        direction,
        amount: formatUnits(amount < 0n ? -amount : amount, USDC_DECIMALS),
        counterparty: other?.owner?.address ?? (direction === "in" ? (tx.sender?.address ?? null) : null),
        status: tx.effects?.status === "SUCCESS" ? "success" : tx.effects?.status === "FAILURE" ? "failure" : "unknown",
      });
    }
    return transfers.reverse();
  }
}
