import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

export default function PillButton({ label, onPress, kind = 'primary', disabled = false, leftIcon = null }) {
  const { theme } = useTheme();
  const isGhost = kind === 'ghost';
  const isStatus = kind === 'status';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.accent },
        isGhost && styles.ghost,
        isGhost && { borderColor: theme.border, backgroundColor: theme.card },
        isStatus && styles.status,
        isStatus && { backgroundColor: theme.accent, borderColor: theme.accent },
        pressed && !disabled && styles.pressed,
        disabled && !isStatus && styles.disabled,
        disabled && isStatus && styles.statusDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.content}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <Text style={[
          styles.text,
          isGhost && styles.ghostText,
          isGhost && { color: theme.accent },
          isStatus && styles.statusText
        ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42
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
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2
  },
  ghost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#9ecfc8'
  },
  ghostText: {
    color: '#0f766e'
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
