import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ingwpmkbonxfkkgbewvn.supabase.co';
const supabaseKey = 'sb_publishable_wTGTqQ8fC50Ac6sDX-vyVA_r3bu57f-';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Получить текущий roomId из URL
export function getRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'default';
}

// Подписка на комнату
export function subscribeToRoom(
  roomId: string,
  callback: (data: { tokens: any[]; messages: any[]; fog: number[][]; objects: any[]; effects: any[] } | null) => void
) {
  supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()
    .then(({ data }) => {
      if (data) callback({ tokens: data.tokens, messages: data.messages, fog: data.fog || [], objects: data.objects || [], effects: data.effects || [] });
      else callback(null);
    });

  const channel = supabase
    .channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => {
        const data = payload.new as any;
        if (data) callback({ tokens: data.tokens, messages: data.messages, fog: data.fog || [], objects: data.objects || [], effects: data.effects || [] });
      }
    ).subscribe();

  return () => { supabase.removeChannel(channel); };
}

// Сохранение комнаты
export async function saveRoom(roomId: string, data: { tokens: any[]; messages: any[]; fog: number[][]; objects: any[]; effects: any[] }) {
  await supabase.from('rooms').upsert({
    id: roomId,
    name: roomId,
    tokens: data.tokens, messages: data.messages, fog: data.fog,
    objects: data.objects, effects: data.effects,
    updated_at: new Date().toISOString(),
  });
}

// Создать новую комнату
export async function createRoom(name: string): Promise<string> {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
  await supabase.from('rooms').insert({
    id, name,
    tokens: [], messages: [], fog: [], objects: [], effects: [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  return id;
}

export function loginWithGitHub() {
  supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
}

export async function loginWithEmail(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function registerWithEmail(email: string, password: string, displayName?: string) {
  return await supabase.auth.signUp({ email, password, options: { data: { full_name: displayName || email.split('@')[0] } } });
}

export function logoutUser() { supabase.auth.signOut(); }

export function onUserChanged(callback: (user: { uid: string; email: string | null; name: string | null; avatar: string | null } | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_, session) => {
    if (session?.user) {
      callback({ uid: session.user.id, email: session.user.email || null, name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Игрок', avatar: session.user.user_metadata?.avatar_url || null });
    } else callback(null);
  });
  return () => { data.subscription.unsubscribe(); };
}

export async function uploadMap(file: File): Promise<string> {
  const fileName = `map-${Date.now()}.${file.name.split('.').pop()}`;
  const { data, error } = await supabase.storage.from('maps').upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('maps').getPublicUrl(data.path);
  return urlData.publicUrl;
}