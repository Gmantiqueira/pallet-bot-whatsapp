export interface OutgoingMessage {
  to: string;
  /** Presente nas respostas explícitas de texto ou documento (ex.: entrega do PDF). */
  type?: 'text' | 'document';
  text?: string;
  media?: {
    type: 'image' | 'document';
    id?: string;
    url?: string;
  };
  buttons?: Array<{
    id: string;
    label: string;
  }>;
  document?: {
    filename: string;
    /** Opcional; este core não assume URL pública. Gateway pode preencher após anexar media. */
    url?: string;
  };
}
