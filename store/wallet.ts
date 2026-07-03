import { create } from 'zustand';
import { supabase } from '../lib/supabase';

/**
 * PYAAS Wallet balance store. Reads public.wallets (created by
 * pyaas_v2_schema.sql). Fails soft to 0 if the table doesn't exist yet or the
 * user is signed out, so the UI never crashes during rollout.
 */
type WalletState = {
  balance: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useWallet = create<WalletState>((set) => ({
  balance: 0,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        set({ balance: 0, loading: false });
        return;
      }
      const { data, error } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', uid)
        .maybeSingle();
      // error (e.g. table not created yet) → keep 0, don't throw
      set({ balance: error ? 0 : Number(data?.balance ?? 0), loading: false });
    } catch {
      set({ balance: 0, loading: false });
    }
  },
}));
