import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { useTheme } from '../theme';

const ROLE_OPTIONS = [
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'admin', label: 'Admin' }
];

const INVITE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'expired', label: 'Expired' },
  { key: 'canceled', label: 'Canceled' }
];

export default function FamilyScreen({
  premiumActive = false,
  accessRole = 'read',
  isAccountOwner = false,
  onOpenSubscription,
  onClose
}) {
  const { theme } = useTheme();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit] = useState([]);
  const [owner, setOwner] = useState(null);
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('read');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteFilter, setInviteFilter] = useState('pending');

  const loadMembers = async () => {
    if (!premiumActive) return;
    if (!isAccountOwner && accessRole !== 'admin') return;
    try {
      setLoading(true);
      const data = await api.getFamilyMembers();
      setOwner(data?.owner || null);
      setMembers(Array.isArray(data?.members) ? data.members : []);
      setInvites(Array.isArray(data?.invites) ? data.invites : []);
      setMessage('');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    if (!premiumActive) return;
    if (!isAccountOwner && accessRole !== 'admin') return;
    try {
      setLoading(true);
      const data = await api.getFamilyAudit();
      setAudit(Array.isArray(data?.audit) ? data.audit : []);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
    loadAudit();
  }, [premiumActive]);

  const handleAdd = async () => {
    if (!mobile.trim()) {
      setMessage('Mobile number is required.');
      return;
    }
    try {
      setLoading(true);
      const result = await api.addFamilyMember({ mobile: mobile.trim(), role });
      if (result?.member) {
        setMembers((prev) => [...prev, result]);
      } else if (result?.invite) {
        setInvites((prev) => [result.invite, ...prev]);
      }
      setMobile('');
      setMessage(result?.invite ? 'Invite sent.' : 'Family member added.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id, nextRole) => {
    try {
      setLoading(true);
      const updated = await api.updateFamilyMember(id, { role: nextRole });
      setMembers((prev) => prev.map((row) => (row.id === id ? updated : row)));
      setMessage('Role updated.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      setLoading(true);
      await api.removeFamilyMember(id);
      setMembers((prev) => prev.filter((row) => row.id !== id));
      setMessage('Family member removed.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvite = async (id) => {
    try {
      setLoading(true);
      await api.cancelFamilyInvite(id);
      setInvites((prev) => prev.filter((row) => row.id !== id));
      setMessage('Invite canceled.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async (id) => {
    try {
      setLoading(true);
      const result = await api.resendFamilyInvite(id);
      setInvites((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, expires_at: result?.expires_at || row.expires_at } : row
        )
      );
      setMessage('Invite resent.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvites =
    inviteFilter === 'all' ? invites : invites.filter((row) => row.status === inviteFilter);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title="Family Access">
        <Text style={[styles.helper, { color: theme.muted }]}>
          Add family members and set their access level. Admins can manage access.
        </Text>

        {!premiumActive ? (
          <>
            <Text style={[styles.lockedText, { color: theme.warn }]}>
              Premium required to enable family access.
            </Text>
            <PillButton label="Upgrade to Premium" kind="primary" onPress={onOpenSubscription} />
          </>
        ) : !isAccountOwner && accessRole !== 'admin' ? (
          <Text style={[styles.lockedText, { color: theme.warn }]}>
            Admin access required to manage family members.
          </Text>
        ) : (
          <>
            {owner ? (
              <View style={styles.ownerCard}>
                <Text style={[styles.ownerLabel, { color: theme.muted }]}>Owner</Text>
                <Text style={[styles.ownerName, { color: theme.text }]}>{owner.full_name}</Text>
                <Text style={[styles.ownerMeta, { color: theme.muted }]}>{owner.mobile}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.muted }]}>Add Family Member</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={mobile}
              onChangeText={(text) => setMobile(String(text || '').replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
            />
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={opt.label}
                  kind={role === opt.key ? 'primary' : 'ghost'}
                  onPress={() => setRole(opt.key)}
                />
              ))}
            </View>
            <PillButton label={loading ? 'Please wait...' : 'Add Member'} kind="primary" onPress={handleAdd} />

            <Text style={[styles.label, { color: theme.muted }]}>Members</Text>
            {members.length ? (
              members.map((row) => (
                <View key={row.id} style={[styles.memberCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.memberHeader}>
                    <View>
                      <Text style={[styles.memberName, { color: theme.text }]}>{row.member.full_name}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>{row.member.mobile}</Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((opt) => (
                      <PillButton
                        key={`${row.id}-${opt.key}`}
                        label={opt.label}
                        kind={row.role === opt.key ? 'primary' : 'ghost'}
                        onPress={() => handleRoleChange(row.id, opt.key)}
                      />
                    ))}
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable onPress={() => handleRemove(row.id)}>
                      <Text style={[styles.removeText, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>No family members yet.</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>Pending Invites</Text>
            <View style={styles.roleRow}>
              {INVITE_FILTERS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={opt.label}
                  kind={inviteFilter === opt.key ? 'primary' : 'ghost'}
                  onPress={() => setInviteFilter(opt.key)}
                />
              ))}
            </View>
            {filteredInvites.length ? (
              filteredInvites.map((row) => (
                <View key={row.id} style={[styles.inviteCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.memberHeader}>
                    <View>
                      <Text style={[styles.memberName, { color: theme.text }]}>{row.mobile}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>
                        Status: {row.status.toUpperCase()} · Expires: {String(row.expires_at || '').slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.actionsRow}>
                    {row.status === 'pending' ? (
                      <>
                        <Pressable onPress={() => handleResendInvite(row.id)}>
                          <Text style={[styles.actionText, { color: theme.accent }]}>Resend</Text>
                        </Pressable>
                        <Pressable onPress={() => handleCancelInvite(row.id)}>
                          <Text style={[styles.removeText, { color: theme.danger }]}>Cancel</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>No invites found.</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>Audit Log</Text>
            {audit.length ? (
              audit.map((row) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={[styles.auditAction, { color: theme.text }]}>{row.action.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.auditMeta, { color: theme.muted }]}>
                    {row.actor?.full_name || 'System'} · {String(row.created_at || '').replace('T', ' ').slice(0, 19)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>No audit events yet.</Text>
            )}
          </>
        )}
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}

      <View style={styles.footerRow}>
        <PillButton label="Back" kind="ghost" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20
  },
  helper: {
    marginBottom: 10,
    lineHeight: 19
  },
  lockedText: {
    fontWeight: '700',
    marginBottom: 12
  },
  label: {
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 10
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  inviteCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  memberName: {
    fontWeight: '800',
    fontSize: 14
  },
  memberMeta: {
    fontSize: 12
  },
  memberRole: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1
  },
  actionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 12
  },
  removeText: {
    fontWeight: '700'
  },
  actionText: {
    fontWeight: '700'
  },
  ownerCard: {
    marginBottom: 12
  },
  ownerLabel: {
    fontSize: 12,
    fontWeight: '700'
  },
  ownerName: {
    fontSize: 14,
    fontWeight: '800'
  },
  ownerMeta: {
    fontSize: 12
  },
  message: {
    marginTop: 12,
    fontWeight: '600'
  },
  auditRow: {
    marginBottom: 10
  },
  auditAction: {
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  auditMeta: {
    fontSize: 12
  },
  footerRow: {
    marginTop: 12
  }
});
