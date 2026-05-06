export interface Post {
  id: string;
  authorId: string;
  authorName?: string;
  authorColor: string;
  content: string;
  likes: number;
  createdAt: number;
  replyToId?: string;
  replyToAuthor?: string;
}

export interface PrivateMessage {
  id: string;
  fromId: string;
  fromName?: string;
  fromColor: string;
  toId: string;
  content: string;
  createdAt: number;
  read: boolean;
}

export interface VoiceNote {
  id: string;
  authorId: string;
  authorName?: string;
  authorColor: string;
  audioUrl: string;
  createdAt: number;
}
