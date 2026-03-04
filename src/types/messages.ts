export interface OutgoingMessage {
  to: string;
  text?: string;
  media?: {
    type: 'image' | 'document';
    id?: string;
    url?: string;
  };
  buttons?: Array<{
    id: string;
    title: string;
  }>;
}
