import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  targets = {},
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
  const highlightPulse = useRef(new Animated.Value(0)).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;
  const target = step?.targetKey ? targets?.[step.targetKey] : null;
  const appIsDark = isDarkHexColor(theme?.background);
  const cardSurface = appIsDark ? 'rgba(255,255,255,0.98)' : 'rgba(10, 18, 30, 0.97)';
  const cardBorder = appIsDark ? 'rgba(15,47,77,0.22)' : 'rgba(255,255,255,0.25)';
  const cardTitle = appIsDark ? '#0f2f4d' : '#f2f7ff';
  const cardMeta = appIsDark ? '#4b6784' : '#9fb5cf';
  const cardBody = appIsDark ? '#35506c' : '#d2deee';
  const actionColor = appIsDark ? theme.accent : '#facc15';
  const skipColor = appIsDark ? '#111111' : '#f8fafc';
  const highlightColor = appIsDark ? '#f8fafc' : '#111111';
  const highlightAuraColor = appIsDark ? 'rgba(248,250,252,0.55)' : 'rgba(17,17,17,0.45)';
  const inactiveDotColor = appIsDark ? theme.border : 'rgba(255,255,255,0.24)';
  const panel = String(step?.panel || 'top').toLowerCase();
  const shouldBlur = Boolean(step?.blurBackground);
  const singleBorder = Boolean(step?.singleBorder);

  useEffect(() => {
    if (!visible || isLargeScreen) {
      highlightPulse.stopAnimation();
      highlightPulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(highlightPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(highlightPulse, { toValue: 0, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, isLargeScreen, highlightPulse]);

  const overlayBox = target
    ? {
        left: Math.max(8, target.x - 6),
        top: Math.max(8, target.y - 6),
        width: Math.max(34, target.width + 12),
        height: Math.max(34, target.height + 12)
      }
    : null;

  const backdropSlices = useMemo(() => {
    if (!overlayBox) {
      return [{ key: 'full', left: 0, top: 0, width: screenWidth, height: screenHeight }];
    }
    const left = clamp(overlayBox.left, 0, screenWidth);
    const top = clamp(overlayBox.top, 0, screenHeight);
    const right = clamp(overlayBox.left + overlayBox.width, 0, screenWidth);
    const bottom = clamp(overlayBox.top + overlayBox.height, 0, screenHeight);
    return [
      { key: 'top', left: 0, top: 0, width: screenWidth, height: top },
      { key: 'left', left: 0, top, width: left, height: Math.max(0, bottom - top) },
      { key: 'right', left: right, top, width: Math.max(0, screenWidth - right), height: Math.max(0, bottom - top) },
      { key: 'bottom', left: 0, top: bottom, width: screenWidth, height: Math.max(0, screenHeight - bottom) }
    ].filter((slice) => slice.width > 0.5 && slice.height > 0.5);
  }, [overlayBox, screenWidth, screenHeight]);
  const cardPositionStyle = useMemo(() => {
    if (panel === 'middle') {
      const middleTop = Math.round(screenHeight * 0.42);
      return { top: clamp(middleTop, 110, Math.max(110, screenHeight - 260)) };
    }
    return styles.cardTop;
  }, [panel, screenHeight]);
  const pulseStyle = overlayBox && !isLargeScreen && !singleBorder
    ? {
        left: overlayBox.left,
        top: overlayBox.top,
        width: overlayBox.width,
        height: overlayBox.height,
        transform: [
          {
            scale: highlightPulse.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.995, 1.03, 0.995]
            })
          }
        ],
        opacity: highlightPulse.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.72, 0.92, 0.72]
        })
      }
    : null;
  const auraStyle = overlayBox && !isLargeScreen && !singleBorder
    ? {
        left: overlayBox.left - 1,
        top: overlayBox.top - 1,
        width: overlayBox.width + 2,
        height: overlayBox.height + 2,
        transform: [
          {
            scale: highlightPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.05]
            })
          }
        ],
        opacity: highlightPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.24, 0]
        })
      }
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        {shouldBlur
          ? backdropSlices.map((slice) => (
              <BlurView
                key={`blur-${slice.key}`}
                tint="dark"
                intensity={5}
                style={[
                  styles.backdropSlice,
                  { left: slice.left, top: slice.top, width: slice.width, height: slice.height }
                ]}
              />
            ))
          : null}
        {shouldBlur
          ? backdropSlices.map((slice) => (
              <View
                key={`dim-${slice.key}`}
                style={[
                  styles.backdropSlice,
                  styles.dimSlice,
                  { left: slice.left, top: slice.top, width: slice.width, height: slice.height }
                ]}
              />
            ))
          : null}

        {overlayBox ? (
          <>
            <View style={[styles.highlightBase, overlayBox, { borderColor: highlightColor }]} />
            {!singleBorder && pulseStyle ? (
              <Animated.View style={[styles.zoomFrame, pulseStyle, { borderColor: highlightColor }]} />
            ) : null}
            {!singleBorder && auraStyle ? (
              <Animated.View style={[styles.zoomAura, auraStyle, { borderColor: highlightAuraColor }]} />
            ) : null}
          </>
        ) : null}

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
    backgroundColor: 'rgba(5, 10, 16, 0.12)'
  },
  backdropSlice: {
    position: 'absolute'
  },
  dimSlice: {
    backgroundColor: 'rgba(9, 14, 22, 0.2)'
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
    height: 4,
    borderRadius: 999,
    marginBottom: 4
  },
  cardTop: {
    top: 72
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  stepMeta: {
    fontSize: 12,
    fontWeight: '700'
  },
  topActionText: {
    fontSize: 13,
    fontWeight: '800'
  },
  nextText: {
    fontSize: 13,
    fontWeight: '900'
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  dotsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  dot: {
    height: 8,
    borderRadius: 999
  },
  highlightBase: {
    position: 'absolute',
    borderWidth: 2.8,
    borderRadius: 14,
    backgroundColor: 'transparent'
  },
  zoomFrame: {
    position: 'absolute',
    borderWidth: 3.2,
    borderRadius: 16,
    backgroundColor: 'transparent'
  },
  zoomAura: {
    position: 'absolute',
    borderWidth: 2.4,
    borderRadius: 18
  }
});
