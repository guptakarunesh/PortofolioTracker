import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { BRAND } from '../brand';

export default function SectionCard({ title, children, titleStyle }) {
  const { theme } = useTheme();
  const isLight = theme.key === 'light';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isLight ? theme.card : theme.cardAlt,
          borderColor: theme.border,
          shadowColor: isLight ? BRAND.colors.bgDeep : '#000000'
        }
      ]}
    >
      {title ? <Text style={[styles.title, { color: theme.text }, titleStyle]}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.2
  }
});
