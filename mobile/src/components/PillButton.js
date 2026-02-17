import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

export default function PillButton({ label, onPress, kind = 'primary' }) {
  return (
    <Pressable style={[styles.btn, kind === 'ghost' && styles.ghost]} onPress={onPress}>
      <Text style={[styles.text, kind === 'ghost' && styles.ghostText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#0f5fb8',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  text: {
    color: '#fff',
    fontWeight: '700'
  },
  ghost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0f5fb8'
  },
  ghostText: {
    color: '#0f5fb8'
  }
});
