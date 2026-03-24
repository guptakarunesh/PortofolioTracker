import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { BRAND } from '../brand';

export default function StatTile({ label, value, positive }) {
  const { theme } = useTheme();
  const isLight = theme.key === 'light';
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated,
          borderColor: theme.border,
          shadowColor: isLight ? BRAND.colors.bgDeep : '#000000'
        }
      ]}
    >
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[
        styles.value,
        { color: theme.text },
        positive === true && { color: theme.success },
        positive === false && { color: theme.danger }
      ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  label: {
    fontSize: 12,
    marginBottom: 7,
    fontWeight: '600'
  },
  value: {
    fontSize: 18,
    fontWeight: '800'
  }
});
