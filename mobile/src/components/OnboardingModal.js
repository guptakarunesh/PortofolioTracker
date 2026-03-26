import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isDarkHexColor(color) {
  const hex = String(color || '').trim().replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((ch) => `${ch}${ch}`).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return false;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5;
}

export default function OnboardingModal({
  visible = false,
  steps = [],
  index = 0,
  onBack,
  onNext,
  onSkip,
  t,
  theme
}) {
  if (!Array.isArray(steps) || !steps.length) return null;

  const safeIndex = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[safeIndex] || {};
  const isLast = safeIndex === steps.length - 1;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const appIsDark = isDarkHexColor(theme?.background);
  const cardSurface = appIsDark ? 'rgba(255,255,255,0.98)' : 'rgba(10, 18, 30, 0.97)';
  const cardBorder = appIsDark ? 'rgba(15,47,77,0.22)' : 'rgba(255,255,255,0.25)';
  const cardTitle = appIsDark ? '#0f2f4d' : '#f2f7ff';
  const cardMeta = appIsDark ? '#4b6784' : '#9fb5cf';
  const cardBody = appIsDark ? '#35506c' : '#d2deee';
  const actionColor = appIsDark ? theme.accent : '#facc15';
  const skipColor = appIsDark ? '#111111' : '#f8fafc';
  const inactiveDotColor = appIsDark ? theme.border : 'rgba(255,255,255,0.24)';
  const panel = String(step?.panel || 'top').toLowerCase();
  const stackHeaderActions = screenWidth < 480;

  const cardPositionStyle = useMemo(() => {
    if (panel === 'middle') {
      const middleTop = Math.round(screenHeight * 0.42);
      return { top: clamp(middleTop, 110, Math.max(110, screenHeight - 260)) };
    }
    const bottomOffset = clamp(Math.round(screenHeight * 0.1), 88, 126);
    return { bottom: bottomOffset };
  }, [panel, screenHeight]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <View
          style={[
            styles.card,
            cardPositionStyle,
            { backgroundColor: cardSurface, borderColor: cardBorder }
          ]}
        >
          <View style={[styles.cardAccent, { backgroundColor: theme.accent }]} />
          <View style={[styles.topRow, stackHeaderActions ? styles.topRowStacked : null]}>
            <Text style={[styles.stepMeta, { color: cardMeta }]}>
              {t('Step {current} of {total}', { current: safeIndex + 1, total: steps.length })}
            </Text>
            <View style={[styles.topActions, stackHeaderActions ? styles.topActionsStacked : null]}>
              {safeIndex > 0 ? (
                <Pressable style={[styles.topActionButton, { borderColor: actionColor }]} onPress={onBack}>
                  <Text style={[styles.topActionText, { color: actionColor }]}>{t('Back')}</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.topActionButton, { borderColor: skipColor }]} onPress={onSkip}>
                <Text style={[styles.topActionText, { color: skipColor }]}>{t('Skip')}</Text>
              </Pressable>
              <Pressable style={[styles.topActionButton, styles.topActionButtonPrimary, { backgroundColor: actionColor, borderColor: actionColor }]} onPress={onNext}>
                <Text style={[styles.nextText, { color: '#FFFFFF' }]}>
                  {isLast ? t('Get Started') : t('Next')}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.title, { color: cardTitle }]}>{String(step.title || '')}</Text>
          <Text style={[styles.body, { color: cardBody }]}>{String(step.body || '')}</Text>

          <View style={styles.dotsRow}>
            {steps.map((_, i) => (
              <View
                key={`onboarding-dot-${i}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === safeIndex ? actionColor : inactiveDotColor,
                    width: i === safeIndex ? 20 : 8
                  }
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  card: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20
  },
  cardAccent: {
    width: 42,
    height: 4,
    borderRadius: 999,
    marginBottom: 2
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  topRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  topActionsStacked: {
    width: '100%',
    flexWrap: 'wrap',
    justifyContent: 'flex-start'
  },
  topActionButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1
  },
  topActionButtonPrimary: {
    borderWidth: 0
  },
  stepMeta: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  topActionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  nextText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800'
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600'
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6
  },
  dot: {
    height: 8,
    borderRadius: 999
  }
});
