import { create } from 'zustand';
import { getUserId } from '../lib/session';
import { getBalances } from '../lib/walletApi';

/**
 * PARAG wallet balance store. Reads the DERIVED balances off the append-only
 * ledger (lib/walletApi.getBalances). `balance` stays the settled available
 * balance so every existing call site keeps working; cash / promo / pending /
 * locked and the low-balance flag are exposed for the wallet dashboard. Fails
 * soft to zeros when signed out or empty, so the UI never crashes.
 * When parag-api is live getBalances() maps to GET /wallet/balances.
 */
type WalletState = {
  balance: number; // settled available (cash + promo)
  cash: number;
  promo: number;
  pending: number;
  locked: number;
  lowBalance: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ZERO = { balance: 0, cash: 0, promo: 0, pending: 0, locked: 0, lowBalance: false };

export const useWallet = create<WalletState>((set) => ({
  ...ZERO,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const uid = await getUserId();
      if (!uid) {
        set({ ...ZERO, loading: false });
        return;
      }
      const b = await getBalances();
      set({
        balance: b.available,
        cash: b.cash,
        promo: b.promo,
        pending: b.pending,
        locked: b.locked,
        lowBalance: b.lowBalance,
        loading: false,
      });
    } catch {
      // Transient failure (network blip / cold-start timeout): keep the
      // last-known balances on screen instead of flashing ₹0. A real sign-out
      // is the only thing that zeroes (handled above when uid is null).
      set({ loading: false });
    }
  },
}));
