import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export default function FeedbackBanner({ message = '', kind = 'info' }) {
  const { theme } = useTheme();
  if (!message) return null;
  const isLight = theme.key === 'light';
  const palette =
    kind === 'success'
      ? {
          bg: isLight ? '#E9FBF4' : '#10284A',
          border: theme.success,
          text: isLight ? '#0A6B52' : theme.text
        }
      : kind === 'error'
        ? {
            bg: isLight ? '#FFF1F1' : '#132844',
            border: theme.danger,
            text: isLight ? '#9F1F24' : theme.text
          }
        : {
            bg: isLight ? '#EEF7FF' : '#132844',
            border: theme.accent,
            text: isLight ? '#0B4F8A' : theme.text
          };
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
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  text: {
    fontWeight: '700',
    lineHeight: 18
  }
});
