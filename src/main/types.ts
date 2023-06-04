export type Msg = {
  role: 'system' | 'user' | 'assistant';
  content?: string;
  id?: string;
  is_error?: boolean;
  response_time?: number;
  thinking?: boolean;
  canceled?: boolean;
};

export type Settings = {
  width?: number;
  height?: number;
  token?: string;
};
