import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function PillButton({ label, onPress, kind = 'primary', disabled = false }) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.accent },
        kind === 'ghost' && styles.ghost,
        kind === 'ghost' && { borderColor: theme.border, backgroundColor: theme.card },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[
        styles.text,
        kind === 'ghost' && styles.ghostText,
        kind === 'ghost' && { color: theme.accent }
      ]}>
        {label}
      </Text>
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
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  disabled: {
    opacity: 0.55
  }
});
