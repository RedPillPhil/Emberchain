/**
 * chain-client — thin HTTP wrapper used by api-server to talk to chain-node.
 *
 * All methods read CHAIN_NODE_URL from the environment (default:
 * http://localhost:8082). They throw on non-2xx responses so callers can
 * propagate the error naturally.
 *
 * Internal endpoints (/api/internal/*) require service-to-service auth.
 * The shared secret is read from CHAIN_NODE_INTERNAL_SECRET.
 */
declare class ChainClientError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, path: string);
}
/** Re-export so callers can inspect chain-node error status */
export { ChainClientError };
export declare function callContract(opts: {
    to: string;
    data: string;
    from?: string | null;
}): Promise<{
    success: boolean;
    returnData: string;
    gasUsed: string;
}>;
export declare function getContractCode(address: string): Promise<string>;
export declare function submitTransaction(input: {
    fromPrivateKey: string;
    to: string | null;
    value?: string;
    data?: string;
    gasLimit?: string;
}): Promise<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
    blockNumber: number | null;
    status: "pending" | "confirmed" | "failed";
}>;
export declare function submitRawEVMTransaction(params: {
    hash: string;
    from: string;
    to: string | null;
    value: string;
    data: string;
    gasLimit: string;
    nonce: bigint;
}): Promise<void>;
export declare function getTransaction(hash: string): Promise<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
    data: string;
    blockNumber: number | null;
    status: "pending" | "confirmed" | "failed";
    error?: string | null;
} | undefined>;
export declare function listWallets(): Promise<{
    address: string;
    balance: string;
    nonce: number;
}[]>;
export declare function listTransactions(address?: string, limit?: number): Promise<unknown[]>;
export declare function getBlockForTx(txHash: string): Promise<unknown | null>;
type ExchangeListing = {
    id: string;
    sellerAddress: string;
    currency: string;
    priceAmount: string;
    receiveAddress: string;
    networkAddresses?: Record<string, string>;
    status: string;
    buyerAddress?: string | null;
    paymentTxHash?: string | null;
};
export declare function listExchangeListings(status?: string): Promise<ExchangeListing[]>;
export declare function getExchangeListing(id: string): Promise<ExchangeListing | undefined>;
export declare function createListing(input: unknown): Promise<ExchangeListing>;
export declare function cancelListing(id: string, sellerPrivateKey: string): Promise<ExchangeListing>;
export declare function reserveListing(id: string, buyerAddress: string): Promise<ExchangeListing>;
export declare function lockListingForFulfillment(id: string, paymentTxHash: string, buyerAddress: string): Promise<ExchangeListing>;
export declare function unlockListing(id: string): Promise<void>;
export declare function commitFulfillment(id: string, buyerAddress: string, paymentTxHash: string, selectedNetwork?: string): Promise<ExchangeListing>;
export declare function getPrivacyStatus(): Promise<{
    totalNotes: number;
    unspentNotes: number;
    shieldedTxCount: number;
}>;
export declare function getStealthMeta(address: string): Promise<unknown | null>;
export declare function getPrivateBalance(privateKey: string): Promise<{
    balance: string;
    notes: number;
}>;
export declare function shield(input: unknown): Promise<unknown>;
export declare function privateSend(input: unknown): Promise<unknown>;
export declare function unshield(input: unknown): Promise<unknown>;
export declare function listPrivacyLedger(limit?: number): Promise<unknown[]>;
