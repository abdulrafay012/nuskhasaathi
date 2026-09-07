// Password reset token handling tests: single-use semantics, expiry
// enforcement, and post-reset invalidation.
//
// There is no mail server in this project, so /auth/forgot-password returns
// the reset token directly in the response (intentional demo trade-off) —
// these tests consume it the same way the ForgotPassword page does.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const helpers = require('./helpers');
const { request, uniqueEmail } = helpers;

const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

// Creates a user with a REAL bcrypt hash so post-reset login checks work.
async function createUserWithRealHash() {
  const email = uniqueEmail('reset');
  const passwordHash = await bcrypt.hash(OLD_PASSWORD, 10);
  const user = helpers.insertUserDirect({ email, passwordHash });
  return { email, user };
}

async function requestResetToken(email) {
  const res = await request('POST', '/auth/forgot-password', { body: { email } });
  assert.equal(res.status, 200, 'forgot-password should always respond 200');
  return res.data.resetToken;
}

describe('reset token lifecycle', () => {
  it('is single-use: a second reset attempt with the same token fails', async () => {
    const { email } = await createUserWithRealHash();
    const token = await requestResetToken(email);
    assert.ok(token, 'a known account must receive a reset token');

    const first = await request('POST', '/auth/reset-password', {
      body: { token, newPassword: NEW_PASSWORD },
    });
    assert.equal(first.status, 200, 'first use of a fresh token must succeed');

    const second = await request('POST', '/auth/reset-password', {
      body: { token, newPassword: 'another-password-789' },
    });
    assert.equal(second.status, 400, 'token reuse must be rejected');
    assert.match(second.data.error, /invalid or expired/i);
  });

  it('rejects a token older than one hour', async () => {
    const email = uniqueEmail('expired');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    helpers.insertUserDirect({
      email,
      resetToken: 'expired-token-fixed-value',
      resetTokenExpiry: twoHoursAgo,
    });

    const res = await request('POST', '/auth/reset-password', {
      body: { token: 'expired-token-fixed-value', newPassword: NEW_PASSWORD },
    });
    assert.equal(res.status, 400, 'expired token must be rejected');
    assert.match(res.data.error, /invalid or expired/i);

    // And the password must NOT have been changed by the rejected attempt.
    const login = await request('POST', '/auth/login', {
      body: { email, password: NEW_PASSWORD },
    });
    assert.equal(login.status, 401, 'rejected reset must not change the password');
  });

  it('invalidates the token in the database after a successful reset', async () => {
    const { email } = await createUserWithRealHash();
    const token = await requestResetToken(email);

    const res = await request('POST', '/auth/reset-password', {
      body: { token, newPassword: NEW_PASSWORD },
    });
    assert.equal(res.status, 200);

    const row = helpers.getUserByEmail(email);
    assert.equal(row.reset_token, null, 'reset_token column must be cleared');
    assert.equal(row.reset_token_expiry, null, 'reset_token_expiry column must be cleared');
  });
});

describe('password actually changes after a successful reset', () => {
  it('rejects the old password and accepts the new one', async () => {
    const { email } = await createUserWithRealHash();
    const token = await requestResetToken(email);

    const reset = await request('POST', '/auth/reset-password', {
      body: { token, newPassword: NEW_PASSWORD },
    });
    assert.equal(reset.status, 200);

    const oldLogin = await request('POST', '/auth/login', {
      body: { email, password: OLD_PASSWORD },
    });
    assert.equal(oldLogin.status, 401, 'old password must stop working');

    const newLogin = await request('POST', '/auth/login', {
      body: { email, password: NEW_PASSWORD },
    });
    assert.equal(newLogin.status, 200, 'new password must work');
    assert.ok(newLogin.data.token);
  });
});

describe('forgot-password enumeration safety (existing behavior)', () => {
  it('responds 200 with a null token for an unknown email', async () => {
    const res = await request('POST', '/auth/forgot-password', {
      body: { email: uniqueEmail('ghost') },
    });
    assert.equal(res.status, 200, 'unknown email must not produce an error status');
    assert.equal(res.data.resetToken, null, 'unknown email must not receive a token');
  });

  it('rejects a reset attempt with a token that never existed', async () => {
    const res = await request('POST', '/auth/reset-password', {
      body: { token: 'a-token-nobody-ever-issued', newPassword: NEW_PASSWORD },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /invalid or expired/i);
  });
});
