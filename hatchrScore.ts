// lib/hatchrScore.ts

export interface HatchrFollowersScoreBreakdown {
  followerCount: number;
  meanFollowerScore: number;
  sizeFactor: number;
  followersScore: number;        // 0–1
}

export interface HatchrScoreBreakdown extends HatchrFollowersScoreBreakdown {
  creatorScore: number;          // 0–1 (из Neynar)
  hatchrSocialScore: number;     // 0–1
  hatchrScore: number;           // 0–100 (готовый для UI)
}

/**
 * followersScores — массив Neynar score всех подписчиков (0–1).
 * Если подписчиков нет, followersScore = 0.
 */
export function computeFollowersScore(
  followersScores: number[],
  maxFollowersRef: number = 1000 // реф. размер аудитории, после которого sizeFactor ≈ 1
): HatchrFollowersScoreBreakdown {
  const followerCount = followersScores.length;

  if (followerCount === 0) {
    return {
      followerCount: 0,
      meanFollowerScore: 0,
      sizeFactor: 0,
      followersScore: 0,
    };
  }

  // Средний Neynar score по всем подписчикам
  const sum = followersScores.reduce((acc, s) => acc + (s || 0), 0);
  const meanFollowerScore = sum / followerCount; // 0–1

  // Size factor: учитываем размер аудитории, но с логарифмическим загибом
  const sizeFactorRaw =
    Math.log10(followerCount + 1) / Math.log10(maxFollowersRef + 1);
  const sizeFactor = Math.max(0, Math.min(1, sizeFactorRaw));

  /**
   * Итоговый followersScore:
   * - если аудитория маленькая, но очень качественная → score будет ок, но не космос;
   * - если большая и с нормальным quality → score выше.
   *
   * Формула: followersScore = mean * (0.5 + 0.5 * sizeFactor)
   *  - при маленьком n: sizeFactor ≈ 0 → множитель ≈ 0.5
   *  - при большом n:  sizeFactor → 1 → множитель → 1.0
   */
  const multiplier = 0.5 + 0.5 * sizeFactor;
  const followersScore = Math.max(
    0,
    Math.min(1, meanFollowerScore * multiplier)
  );

  return {
    followerCount,
    meanFollowerScore,
    sizeFactor,
    followersScore,
  };
}

/**
 * creatorScore — Neynar score создателя (0–1).
 * followersScores — массив Neynar score всех подписчиков (0–1).
 */
export function computeHatchrScore(
  creatorScore: number,
  followersScores: number[],
  weights = { wCreator: 0.6, wFollowers: 0.4 }
): HatchrScoreBreakdown {
  const safeCreatorScore = Math.max(0, Math.min(1, creatorScore || 0));

  const followers = computeFollowersScore(followersScores);
  const { followersScore } = followers;

  const hatchrSocialScore =
    weights.wCreator * safeCreatorScore +
    weights.wFollowers * followersScore; // 0–1

  const hatchrScore = Math.round(hatchrSocialScore * 100); // 0–100

  return {
    creatorScore: safeCreatorScore,
    ...followers,
    hatchrSocialScore,
    hatchrScore,
  };
}
