// Authentication logic tests: signup dedup, login credential checks, and
// the JWT verification middleware on a protected route (/auth/me).
//
// Runs against the real server.js in demo mode (no AI calls involved).

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const helpers = require('./helpers');
const { request, createUser, uniqueEmail } = helpers;

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

describe('signup', () => {
  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail('dup');

    const first = await request('POST', '/auth/signup', {
      body: { name: 'First User', email, password: 'password123', age: 30 },
    });
    assert.equal(first.status, 201, 'first signup should succeed');

    const second = await request('POST', '/auth/signup', {
      body: { name: 'Second User', email, password: 'different456', age: 40 },
    });
    assert.equal(second.status, 409, 'duplicate email must be rejected');
    assert.match(second.data.error, /already registered/i);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request('POST', '/auth/signup', {
      body: { email: uniqueEmail('nofields') },
    });
    assert.equal(res.status, 400);
  });
});

describe('login', () => {
  it('rejects a wrong password with 401', async () => {
    const { email } = await createUser({ password: 'correct-password' });

    const res = await request('POST', '/auth/login', {
      body: { email, password: 'wrong-password' },
    });
    assert.equal(res.status, 401, 'wrong password must not authenticate');
    assert.match(res.data.error, /invalid email or password/i);
  });

  it('does not reveal whether the email exists (same error for both cases)', async () => {
    const { email } = await createUser();

    const wrongPassword = await request('POST', '/auth/login', {
      body: { email, password: 'nope' },
    });
    const unknownEmail = await request('POST', '/auth/login', {
      body: { email: uniqueEmail('ghost'), password: 'nope' },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.data.error, unknownEmail.data.error);
  });

  it('accepts the correct password and returns a JWT (control case)', async () => {
    const { email, password } = await createUser();

    const res = await request('POST', '/auth/login', {
      body: { email, password },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.token, 'login must return a token');
  });
});

describe('JWT middleware (via GET /auth/me)', () => {
  it('rejects a request with no token at all', async () => {
    const res = await request('GET', '/auth/me');
    assert.equal(res.status, 401);
    assert.match(res.data.error, /no token provided/i);
  });

  it('rejects a malformed token', async () => {
    const res = await request('GET', '/auth/me', { token: 'not-a-jwt-token' });
    assert.equal(res.status, 401);
    assert.match(res.data.error, /invalid or expired/i);
  });

  it('rejects a structurally valid token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: 'some-user', email: 'x@y.z' }, 'definitely-not-the-secret');

    const res = await request('GET', '/auth/me', { token: forged });
    assert.equal(res.status, 401);
    assert.match(res.data.error, /invalid or expired/i);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { id: 'some-user', email: 'x@y.z', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET
    );

    const res = await request('GET', '/auth/me', { token: expired });
    assert.equal(res.status, 401);
    assert.match(res.data.error, /invalid or expired/i);
  });

  it('accepts a freshly issued token (control case)', async () => {
    const { token, user } = await createUser();

    const res = await request('GET', '/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, user.email);
    assert.equal(res.data.user.password_hash, undefined, 'profile must never expose the hash');
  });
});
