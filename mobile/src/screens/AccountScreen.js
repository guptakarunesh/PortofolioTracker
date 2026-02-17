import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';

export default function AccountScreen({ user, onLogout }) {
  return (
    <View>
      <SectionCard title="My Account">
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.full_name || '-'}</Text>
        <Text style={styles.label}>Mobile</Text>
        <Text style={styles.value}>{user?.mobile || '-'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || '-'}</Text>

        <View style={{ marginTop: 12 }}>
          <PillButton label="Logout" kind="ghost" onPress={onLogout} />
        </View>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#607d99',
    fontSize: 12,
    marginTop: 8
  },
  value: {
    color: '#0f3557',
    fontWeight: '700'
  }
});
