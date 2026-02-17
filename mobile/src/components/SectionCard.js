import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d5deea'
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f3557',
    marginBottom: 10
  }
});
