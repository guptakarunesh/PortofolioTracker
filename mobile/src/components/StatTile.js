import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StatTile({ label, value, positive }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, positive === true && styles.pos, positive === false && styles.neg]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: '#f7fbff',
    borderRadius: 10,
    padding: 10,
    borderColor: '#d3e4f7',
    borderWidth: 1
  },
  label: {
    fontSize: 12,
    color: '#35526e',
    marginBottom: 6
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f3557'
  },
  pos: {
    color: '#0a8f4b'
  },
  neg: {
    color: '#b3261e'
  }
});
