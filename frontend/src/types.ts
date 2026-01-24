export interface Creator {
  id: string;
  name: string;
  handle: string;
  category: 'Art' | 'Code' | 'Music' | 'Gaming';
  avatar: string;
  bio: string;
  verified: boolean;
  color: 'yellow' | 'green' | 'pink' | 'orange';
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: 'ALEO' | 'USD';
  type: 'received' | 'sent';
  senderOrReceiver: string;
  isPrivate: boolean;
}

export interface UserProfile {
  name: string;
  handle: string;
  bio: string;
  twitter?: string;
  github?: string;
  aleoAddress: string;
}
