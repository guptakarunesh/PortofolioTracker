import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function StatTile({ label, value, positive }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.text }]}>
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
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
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
