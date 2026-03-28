import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

export default function PillButton({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  leftIcon = null,
  fullWidth = false,
  style = null,
  textStyle = null
}) {
  const { theme } = useTheme();
  const [buttonSize, setButtonSize] = React.useState({ width: 0, height: 44 });
  const isGhost = kind === 'ghost';
  const isStatus = kind === 'status';
  const isDanger = kind === 'danger';
  const showGradient = !isGhost && !isStatus && !isDanger;
  const primaryTextColor = '#FFFFFF';
  const ghostTextColor = theme.text;
  const ghostBg = theme.cardAlt || theme.card;
  const ghostBorder = theme.border;
  const dangerBg = theme.key === 'light' ? '#FEF2F2' : 'rgba(255,90,95,0.10)';
  const dangerBorder = theme.key === 'light' ? '#FECACA' : 'rgba(255,90,95,0.22)';
  const dangerTextColor = theme.key === 'light' ? theme.danger : '#FFB3B5';
  return (
    <Pressable
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout || {};
        if (!width || !height) return;
        setButtonSize((current) => (
          current.width === width && current.height === height
            ? current
            : { width, height }
        ));
      }}
      style={({ pressed }) => [
        styles.btn,
        fullWidth && styles.fullWidth,
        showGradient && styles.gradientBtn,
        isGhost && styles.ghost,
        isGhost && { borderColor: ghostBorder, backgroundColor: ghostBg },
        isDanger && styles.danger,
        isDanger && { borderColor: dangerBorder, backgroundColor: dangerBg },
        isStatus && styles.status,
        isStatus && { borderColor: theme.accent },
        style,
        pressed && !disabled && styles.pressed,
        disabled && !isStatus && styles.disabled,
        disabled && isStatus && styles.statusDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {showGradient ? (
        <View style={styles.gradientFill} pointerEvents="none">
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(buttonSize.width, 1)} ${Math.max(buttonSize.height, 1)}`}
          >
            <Defs>
              <LinearGradient id="worthioPillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#1B6FCC" />
                <Stop offset="52%" stopColor="#24B2D6" />
                <Stop offset="100%" stopColor="#16AA8A" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={Math.max(buttonSize.width, 1)}
              height={Math.max(buttonSize.height, 1)}
              rx="16"
              fill="url(#worthioPillGradient)"
            />
          </Svg>
        </View>
      ) : null}
      <View style={styles.content}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <Text style={[
          styles.text,
          showGradient && { color: primaryTextColor },
          isGhost && styles.ghostText,
          isGhost && { color: ghostTextColor },
          isDanger && styles.dangerText,
          isDanger && { color: dangerTextColor },
          isStatus && styles.statusText,
          textStyle
        ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    overflow: 'hidden'
  },
  fullWidth: {
    flex: 1
  },
  gradientBtn: {
    backgroundColor: 'transparent'
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconWrap: {
    marginRight: 8
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(11,31,58,0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  ghost: {
    borderWidth: 1,
    borderColor: '#203A60'
  },
  ghostText: {
    color: '#FFFFFF',
    textShadowColor: 'transparent'
  },
  danger: {
    borderWidth: 1
  },
  dangerText: {
    textShadowColor: 'transparent'
  },
  status: {
    borderWidth: 2
  },
  statusText: {
    color: '#fff',
    letterSpacing: 0.3
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  disabled: {
    opacity: 0.55
  },
  statusDisabled: {
    opacity: 1
  }
});
