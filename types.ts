
export interface Participant {
  id: string;
  name: string;
  isDuplicate?: boolean;
}

export interface Winner {
  id: string;
  name: string;
  timestamp: number;
  fortune?: string;
}

export interface Group {
  id: string;
  name: string; // 隊名 (AI 生成)
  members: Participant[];
}

export enum AppMode {
  DRAW = 'DRAW',
  GROUP = 'GROUP'
}

export enum DrawMode {
  SINGLE = 'SINGLE',
  ELIMINATE = 'ELIMINATE'
}
