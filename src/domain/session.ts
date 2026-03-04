export interface Session {
  phone: string;
  state: string;
  answers: Record<string, unknown>;
  stack: string[];
  updatedAt: number;
}
