import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import FamilyScreen from '../screens/FamilyScreen';

jest.mock('../api/client', () => ({
  api: {
    getFamilyMembers: jest.fn(async () => ({
      owner: { id: 1, full_name: 'Owner', mobile: '9999999999' },
      members: [
        {
          id: 10,
          role: 'read',
          member: { full_name: 'Member', mobile: '8888888888' }
        }
      ],
      invites: [
        {
          id: 5,
          role: 'read',
          status: 'pending',
          expires_at: '2030-01-01',
          mobile: '7777777777'
        }
      ]
    })),
    getFamilyAudit: jest.fn(async () => ({
      audit: [{ id: 1, action: 'invite_created', created_at: '2025-01-01T00:00:00Z', actor: { full_name: 'Owner' } }]
    })),
    addFamilyMember: jest.fn(async () => ({ invite: { id: 6, status: 'pending', role: 'read', expires_at: '2030-01-01', mobile: '6666666666' } })),
    updateFamilyMember: jest.fn(async () => ({ id: 10, role: 'write', member: { full_name: 'Member', mobile: '8888888888' } })),
    removeFamilyMember: jest.fn(async () => ({})),
    cancelFamilyInvite: jest.fn(async () => ({})),
    resendFamilyInvite: jest.fn(async () => ({ expires_at: '2030-01-10' }))
  }
}));

describe('FamilyScreen', () => {
  it('shows members, invites, and audit log with filters', async () => {
    const { getByText } = render(
      <FamilyScreen premiumActive accessRole="admin" isAccountOwner onOpenSubscription={() => {}} onClose={() => {}} />
    );

    await waitFor(() => getByText('Members'));
    expect(getByText('M')).toBeTruthy();

    fireEvent.press(getByText('Pending'));
    expect(getByText('******7777')).toBeTruthy();

    expect(getByText('Audit Log')).toBeTruthy();
    expect(getByText('invite created')).toBeTruthy();
  });
});
