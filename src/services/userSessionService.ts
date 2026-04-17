export interface DemoUser {
  id: string;
  name: string;
  plan: string;
}

const USER_STORAGE_KEY = 'selectedUserId';

export const DEMO_USERS: DemoUser[] = [
  { id: 'user-1', name: 'Alex Morgan', plan: 'Prepaid Basic' },
  { id: 'user-2', name: 'Jamie Chen', plan: 'Value Plus' },
  { id: 'user-3', name: 'Sam Patel', plan: 'Unlimited Pro' },
];

export const userSessionService = {
  getSelectedUserId(): string {
    if (typeof window === 'undefined') return DEMO_USERS[0].id;
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) return DEMO_USERS[0].id;

    return DEMO_USERS.some((user) => user.id === stored) ? stored : DEMO_USERS[0].id;
  },

  setSelectedUserId(userId: string): void {
    localStorage.setItem(USER_STORAGE_KEY, userId);
  },

  getDemoUsers(): DemoUser[] {
    return DEMO_USERS;
  },
};
