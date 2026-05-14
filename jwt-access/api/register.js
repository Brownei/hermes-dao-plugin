// api/register.js — Vercel/Netlify serverless function.
// Verifies WebAuthn attestation, checks enclave, returns account info.
// Requires: npm i @simplewebauthn/server
import {
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { consumeChallenge } from './challenge.js';

// Config — override via env vars in production.
const EXPECTED_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:8001';
const EXPECTED_RPID = process.env.WEBAUTHN_RPID || 'localhost';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

  // SECURITY: Validate CSRF token to prevent cross-site request forgery
  // Client must send the CSRF token in X-CSRF-Token header (matches cookie)
  const csrfHeader = req.headers['x-csrf-token'];
  const csrfCookie = req.headers['cookie']?.match(/csrf_token=([^;]+)/)?.[1];

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  const {
    credential_id,
    attestation_b64,
    client_data_b64,
    session_id,
    rp_id,
    origin,
  } = req.body;

  // 1. Validate session-bound challenge (replay protection).
  const expectedChallenge = consumeChallenge(session_id);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Invalid or expired challenge session' });
  }

  try {
    // 2. Build the registration response object for @simplewebauthn/server.
    const registrationResponse = {
      id: credential_id,
      rawId: credential_id,
      response: {
        attestationObject: attestation_b64,
        clientDataJSON: client_data_b64,
      },
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };

    // 3. Verify attestation.
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge,
      expectedOrigin: origin || EXPECTED_ORIGIN,
      expectedRPID: rp_id || EXPECTED_RPID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Attestation verification failed' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // 4. Log enclave/device info (production: check attStmt fmt for apple/android-key).
    console.log('Registered credential:', {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });

    // 5. TODO: Broadcast MsgRegisterAuthenticator to Terp chain.
    //    const terpAddress = await broadcastAuthenticatorRegister(credential.publicKey);
    //    For now, return the credential info for the client to handle.

    return res.json({
      success: true,
      credential_id: credential.id,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      // address: terpAddress, // When chain broadcast is wired.
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: err.message });
  }
}
