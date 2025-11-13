// 入出力DTO／メトリクス：挙動変更なしの型だけ
export type WriterTone = 'warm_intelligent' | 'formal' | 'emotional_sincere';

export interface WriterInputDTO {
  productName: string;
  purpose: string;
  features: string;
  target?: string;
  template?: 'LP' | 'email' | 'headline_only' | 'sns_short';
  tone?: WriterTone;
  length?: 'short' | 'normal' | 'long';
  withCTA?: boolean;
}

export interface WriterMetrics {
  ttfpMs?: number;  // First token
  ttpMs?: number;   // Preview paragraph ready
  totalMs?: number; // Done
}

export interface WriterOutputDTO {
  ok: true;
  data: { text: string; meta?: Record<string, unknown> };
  metrics?: WriterMetrics;
}

export interface WriterErrorDTO {
  ok: false;
  reason: 'bad_request' | 'server_error';
  message?: string;
}

export type WriterResponseDTO = WriterOutputDTO | WriterErrorDTO;
