import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';

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
  const shouldBlur = Boolean(step?.blurBackground);

  const cardPositionStyle = useMemo(() => {
    if (panel === 'middle') {
      const middleTop = Math.round(screenHeight * 0.42);
      return { top: clamp(middleTop, 110, Math.max(110, screenHeight - 260)) };
    }
    return styles.cardTop;
  }, [panel, screenHeight]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        {shouldBlur ? (
          <BlurView
            tint="dark"
            intensity={12}
            style={[styles.backdropFill, { width: screenWidth, height: screenHeight }]}
          />
        ) : null}
        <View style={[styles.backdropFill, styles.dimFill, { width: screenWidth, height: screenHeight }]} />

        <View
          style={[
            styles.card,
            cardPositionStyle,
            { backgroundColor: cardSurface, borderColor: cardBorder }
          ]}
        >
          <View style={[styles.cardAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.topRow}>
            <Text style={[styles.stepMeta, { color: cardMeta }]}>
              {t('Step {current} of {total}', { current: safeIndex + 1, total: steps.length })}
            </Text>
            <View style={styles.topActions}>
              {safeIndex > 0 ? (
                <Pressable onPress={onBack}>
                  <Text style={[styles.topActionText, { color: actionColor }]}>{t('Back')}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onSkip}>
                <Text style={[styles.topActionText, { color: skipColor }]}>{t('Skip')}</Text>
              </Pressable>
              <Pressable onPress={onNext}>
                <Text style={[styles.nextText, { color: actionColor }]}>
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
    backgroundColor: 'rgba(5, 10, 16, 0.18)'
  },
  backdropFill: {
    position: 'absolute',
    left: 0,
    top: 0
  },
  dimFill: {
    backgroundColor: 'rgba(8, 24, 36, 0.28)'
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
  cardTop: {
    top: 66
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  stepMeta: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  topActionText: {
    fontSize: 13,
    fontWeight: '700'
  },
  nextText: {
    fontSize: 13,
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
