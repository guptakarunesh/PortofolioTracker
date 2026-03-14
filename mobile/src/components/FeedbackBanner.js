import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const KIND_STYLES = {
  success: {
    bg: '#d1fae5',
    border: '#10b981',
    text: '#065f46'
  },
  error: {
    bg: '#fee2e2',
    border: '#ef4444',
    text: '#991b1b'
  },
  info: {
    bg: '#dbeafe',
    border: '#3b82f6',
    text: '#1d4ed8'
  }
};

export default function FeedbackBanner({ message = '', kind = 'info' }) {
  const { theme } = useTheme();
  if (!message) return null;
  const palette = KIND_STYLES[kind] || KIND_STYLES.info;
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          shadowColor: theme.shadow
        }
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  text: {
    fontWeight: '700',
    lineHeight: 18
  }
});
