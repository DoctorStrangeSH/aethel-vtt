interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string;
}

export function getStoredUser(): GitHubUser | null {
  const stored = localStorage.getItem('aethel_user');
  return stored ? JSON.parse(stored) : null;
}

export function saveUser(user: GitHubUser) {
  localStorage.setItem('aethel_user', JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem('aethel_user');
}

export function loginWithGitHub() {
  // Для dev-режима: просто запрашиваем никнейм
  const login = prompt('Введите ваш никнейм:');
  if (login) {
    const user: GitHubUser = {
      login,
      avatar_url: `https://github.com/${login}.png`,
      name: login,
    };
    saveUser(user);
    window.location.reload();
  }
}

export async function handleCallback(code: string): Promise<GitHubUser> {
  // Заглушка — не используется в dev-режиме
  return { login: 'dev', avatar_url: '', name: 'Dev' };
}