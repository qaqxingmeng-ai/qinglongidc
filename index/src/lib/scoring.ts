export const SCORE_DIMENSIONS = [
  { field: 'scoreNetwork', noteKey: 'network', label: '网络质量', color: '#3b82f6' },
  { field: 'scoreCpuSingle', noteKey: 'cpuSingle', label: 'CPU单核', color: '#22c55e' },
  { field: 'scoreMemory', noteKey: 'memory', label: '内存', color: '#8b5cf6' },
  { field: 'scoreStorage', noteKey: 'storage', label: '硬盘', color: '#ef4444' },
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type ScoreField = ScoreDimension['field'];
export type ScoreNoteKey = ScoreDimension['noteKey'];
export type ScoreMap = Record<ScoreField, number>;
export type ScoreInputMap = Record<ScoreField, string>;

export const DEFAULT_SCORE_WEIGHTS: ScoreMap = {
  scoreNetwork: 10,
  scoreCpuSingle: 10,
  scoreMemory: 10,
  scoreStorage: 10,
};

export function createEmptyScoreInputs(defaultValue = ''): ScoreInputMap {
  return {
    scoreNetwork: defaultValue,
    scoreCpuSingle: defaultValue,
    scoreMemory: defaultValue,
    scoreStorage: defaultValue,
  };
}

export function sumScoreFields(source: Partial<Record<ScoreField, number | string>>) {
  return SCORE_DIMENSIONS.reduce((total, dimension) => total + Number(source[dimension.field] ?? 0), 0);
}

export function readScoreMap(source: Partial<Record<ScoreField, unknown>>, fallback = 0): ScoreMap {
  return {
    scoreNetwork: Number(source.scoreNetwork ?? fallback),
    scoreCpuSingle: Number(source.scoreCpuSingle ?? fallback),
    scoreMemory: Number(source.scoreMemory ?? fallback),
    scoreStorage: Number(source.scoreStorage ?? fallback),
  };
}