import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

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
const MAX_FAMILY_MEMBERS = 2;

function toInitials(value = '') {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  if (parts.length) return parts.join('');
  const letters = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return letters || 'NA';
}

function maskMobile(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return `${'*'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export default function FamilyScreen({
  premiumActive = false,
  accessRole = 'read',
  isAccountOwner = false,
  onOpenSubscription,
  onClose,
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit] = useState([]);
  const [owner, setOwner] = useState(null);
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('read');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteFilter, setInviteFilter] = useState('pending');
  const fieldOffsetsRef = useRef({});
  const pendingInvitesCount = invites.filter((row) => row.status === 'pending').length;
  const totalUsed = members.length + pendingInvitesCount;
  const slotsLeft = Math.max(0, MAX_FAMILY_MEMBERS - totalUsed);
  const addDisabled = loading || slotsLeft === 0;

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

  const setFieldOffset = useCallback((key, layoutY) => {
    const y = Number(layoutY);
    fieldOffsetsRef.current[key] = Number.isFinite(y) ? Math.max(0, y - 18) : 0;
  }, []);

  const scrollToField = useCallback(
    (key) => {
      if (typeof onRequestScrollTo !== 'function') return;
      const targetY = fieldOffsetsRef.current[key];
      onRequestScrollTo(Number.isFinite(targetY) ? targetY : 0);
    },
    [onRequestScrollTo]
  );

  const handleAdd = async () => {
    if (slotsLeft === 0) {
      setMessage(t('Family limit reached. You can add up to {count} members.', { count: MAX_FAMILY_MEMBERS }));
      return;
    }
    if (!mobile.trim()) {
      setMessage(t('Mobile number is required.'));
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
      setMessage(result?.invite ? t('Invite sent.') : t('Family member added.'));
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
      setMessage(t('Role updated.'));
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
      setMessage(t('Family member removed.'));
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
      setMessage(t('Invite canceled.'));
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
      setMessage(t('Invite resent.'));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvites =
    inviteFilter === 'all' ? invites : invites.filter((row) => row.status === inviteFilter);

  return (
    <View style={styles.container}>
      <SectionCard title={t('Family Access')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Add family members and set their access level. Admins can manage access.')}
        </Text>

        {!premiumActive ? (
          <>
            <Text style={[styles.lockedText, { color: theme.warn }]}>
              {t('Premium required to enable family access.')}
            </Text>
            <PillButton label={t('Upgrade to Premium')} kind="primary" onPress={onOpenSubscription} />
          </>
        ) : !isAccountOwner && accessRole !== 'admin' ? (
          <Text style={[styles.lockedText, { color: theme.warn }]}>
            {t('Admin access required to manage family members.')}
          </Text>
        ) : (
          <>
            {owner ? (
              <View style={styles.ownerCard}>
                <Text style={[styles.ownerLabel, { color: theme.muted }]}>{t('Owner')}</Text>
                <Text style={[styles.ownerName, { color: theme.text }]}>{toInitials(owner.full_name)}</Text>
                <Text style={[styles.ownerMeta, { color: theme.muted }]}>{maskMobile(owner.mobile)}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Add Family Member')}</Text>
            <View style={styles.limitRow}>
              <Text style={[styles.limitText, { color: theme.muted }]}>
                {t('{used}/{total} used · {left} left', { used: totalUsed, total: MAX_FAMILY_MEMBERS, left: slotsLeft })}
              </Text>
              {slotsLeft === 0 ? (
                <Text style={[styles.limitBadge, { backgroundColor: theme.accentSoft, color: theme.accent }]}>
                  {t('Limit reached')}
                </Text>
              ) : null}
            </View>
            <View style={[styles.phoneWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.phonePrefix, { color: theme.text }]}>+91</Text>
              <TextInput
                onLayout={(event) => setFieldOffset('mobile', event.nativeEvent.layout.y)}
                onFocus={() => scrollToField('mobile')}
                style={[styles.phoneInput, { color: theme.inputText }]}
                value={mobile}
                onChangeText={(text) => setMobile(String(text || '').replace(/\D/g, '').slice(0, 10))}
                placeholder={t('10-digit mobile number')}
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={t(opt.label)}
                  kind={role === opt.key ? 'primary' : 'ghost'}
                  onPress={() => setRole(opt.key)}
                />
              ))}
            </View>
            <PillButton
              label={loading ? t('Please wait...') : t('Add Member')}
              kind="primary"
              onPress={handleAdd}
              disabled={addDisabled}
            />

            <Text style={[styles.label, { color: theme.muted }]}>{t('Members')}</Text>
            {members.length ? (
              members.map((row) => (
                <View key={row.id} style={[styles.memberCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.memberHeader}>
                    <View>
                      <Text style={[styles.memberName, { color: theme.text }]}>{toInitials(row.member.full_name)}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>{maskMobile(row.member.mobile)}</Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((opt) => (
                      <PillButton
                        key={`${row.id}-${opt.key}`}
                        label={t(opt.label)}
                        kind={row.role === opt.key ? 'primary' : 'ghost'}
                        onPress={() => handleRoleChange(row.id, opt.key)}
                      />
                    ))}
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable onPress={() => handleRemove(row.id)}>
                      <Text style={[styles.removeText, { color: theme.danger }]}>{t('Remove')}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No family members yet.')}</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Pending Invites')}</Text>
            <View style={styles.roleRow}>
              {INVITE_FILTERS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={t(opt.label)}
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
                      <Text style={[styles.memberName, { color: theme.text }]}>{maskMobile(row.mobile)}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>
                        {t('Status: {value}', { value: t(row.status.toUpperCase()) })} · {t('Expires: {date}', { date: String(row.expires_at || '').slice(0, 10) })}
                      </Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.actionsRow}>
                    {row.status === 'pending' ? (
                      <>
                        <Pressable onPress={() => handleResendInvite(row.id)}>
                          <Text style={[styles.actionText, { color: theme.accent }]}>{t('Resend')}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleCancelInvite(row.id)}>
                          <Text style={[styles.removeText, { color: theme.danger }]}>{t('Cancel')}</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No invites found.')}</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Audit Log')}</Text>
            {audit.length ? (
              audit.map((row) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={[styles.auditAction, { color: theme.text }]}>{t(row.action.replace(/_/g, ' '))}</Text>
                  <Text style={[styles.auditMeta, { color: theme.muted }]}>
                    {row.actor ? toInitials(row.actor.full_name) : t('System')} · {String(row.created_at || '').replace('T', ' ').slice(0, 19)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No audit events yet.')}</Text>
            )}
          </>
        )}
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}

      <View style={styles.footerRow}>
        <PillButton label={t('Back')} kind="ghost" onPress={onClose} />
      </View>
    </View>
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
  phoneWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  phonePrefix: {
    fontWeight: '800',
    fontSize: 15
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 10
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  limitText: {
    fontSize: 12,
    fontWeight: '600'
  },
  limitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden'
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
