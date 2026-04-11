import { canRequestAiExplanation } from '../utils/aiInsights';

describe('canRequestAiExplanation', () => {
  it('allows the first explanation request when score data is available', () => {
    expect(
      canRequestAiExplanation({
        userPresent: true,
        premiumActive: true,
        aiLoading: false,
        aiExplainLoading: false,
        hasScorePayload: true,
        hasExplanation: false,
        requestLocked: false
      })
    ).toBe(true);
  });

  it('disables the button once an explanation is already present', () => {
    expect(
      canRequestAiExplanation({
        userPresent: true,
        premiumActive: true,
        aiLoading: false,
        aiExplainLoading: false,
        hasScorePayload: true,
        hasExplanation: true,
        requestLocked: false
      })
    ).toBe(false);
  });

  it('disables the button while an explanation request is locked in flight', () => {
    expect(
      canRequestAiExplanation({
        userPresent: true,
        premiumActive: true,
        aiLoading: false,
        aiExplainLoading: false,
        hasScorePayload: true,
        hasExplanation: false,
        requestLocked: true
      })
    ).toBe(false);
  });
});
