import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ingwpmkbonxfkkgbewvn.supabase.co';
const supabaseKey = 'sb_publishable_wTGTqQ8fC50Ac6sDX-vyVA_r3bu57f-';

export const supabase = createClient(supabaseUrl, supabaseKey);

export function subscribeToCampaign(
  callback: (data: { tokens: any[]; messages: any[] } | null) => void
) {
  supabase
    .from('campaigns')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()
    .then(({ data }) => {
      if (data) callback({ tokens: data.tokens, messages: data.messages });
      else callback(null);
    });

  const channel = supabase
    .channel('campaign-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'campaigns', filter: 'id=eq.default' },
      (payload) => {
        const data = payload.new as any;
        if (data) callback({ tokens: data.tokens, messages: data.messages });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function saveCampaign(data: { tokens: any[]; messages: any[] }) {
  await supabase
    .from('campaigns')
    .upsert({
      id: 'default',
      tokens: data.tokens,
      messages: data.messages,
      updated_at: new Date().toISOString(),
    });
}

export function loginWithGitHub() {
  supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  });
}

export async function loginWithEmail(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function registerWithEmail(email: string, password: string) {
  return await supabase.auth.signUp({ email, password });
}

export function logoutUser() {
  supabase.auth.signOut();
}

export function onUserChanged(callback: (user: { uid: string; email: string | null; name: string | null; avatar: string | null } | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_, session) => {
    if (session?.user) {
      callback({
        uid: session.user.id,
        email: session.user.email || null,
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Игрок',
        avatar: session.user.user_metadata?.avatar_url || null,
      });
    } else {
      callback(null);
    }
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function uploadMap(file: File): Promise<string> {
  const fileName = `map-${Date.now()}.${file.name.split('.').pop()}`;
  const { data, error } = await supabase.storage
    .from('maps')
    .upload(fileName, file, { upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('maps')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}