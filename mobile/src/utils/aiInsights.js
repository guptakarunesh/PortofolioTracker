export function canRequestAiExplanation({
  userPresent,
  premiumActive,
  aiLoading,
  aiExplainLoading,
  hasScorePayload,
  hasExplanation,
  requestLocked
}) {
  return Boolean(
    userPresent &&
      premiumActive &&
      !aiLoading &&
      !aiExplainLoading &&
      hasScorePayload &&
      !hasExplanation &&
      !requestLocked
  );
}
