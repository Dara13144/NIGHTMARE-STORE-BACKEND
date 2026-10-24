import { env } from '../config/env.js';

/**
 * Server-side Google reCAPTCHA v2 Verification Service
 * Validates reCAPTCHA response tokens directly with Google's siteverify API.
 * Never exposes the Secret Key to client code.
 */
export async function verifyRecaptcha(token, remoteIp = null) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      error: 'Please complete the "I\'m not a robot" reCAPTCHA challenge before proceeding.',
      errorCode: 'MISSING_TOKEN',
    };
  }

  // Developer / Test mode bypass for local automated testing
  if (token === 'dev_recaptcha_bypass_token' || token.startsWith('mock_recaptcha_')) {
    return {
      success: true,
      hostname: 'localhost',
      challengeTs: new Date().toISOString(),
      score: 1.0,
      isTest: true,
    };
  }

  const secretKey = env.RECAPTCHA_SECRET_KEY || '';

  try {
    const postData = new URLSearchParams();
    postData.append('secret', secretKey);
    postData.append('response', token.trim());
    if (remoteIp) {
      postData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData.toString(),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Google reCAPTCHA verification server responded with status ${res.status}`,
        errorCode: 'GOOGLE_HTTP_ERROR',
      };
    }

    const data = await res.json();

    if (data.success === true) {
      return {
        success: true,
        hostname: data.hostname,
        challengeTs: data.challenge_ts,
      };
    }

    // Map Google error codes to user-friendly messages
    const errorCodes = data['error-codes'] || [];
    let friendlyMessage = 'reCAPTCHA verification failed. Please try again.';

    if (errorCodes.includes('timeout-or-duplicate')) {
      friendlyMessage = 'The CAPTCHA response has expired or has already been used. Please solve the checkbox again.';
    } else if (errorCodes.includes('invalid-input-response')) {
      friendlyMessage = 'The CAPTCHA response parameter is invalid or malformed.';
    } else if (errorCodes.includes('invalid-input-secret')) {
      friendlyMessage = 'The secret key is invalid or malformed. Please contact administrator.';
    }

    return {
      success: false,
      error: friendlyMessage,
      errorCodes,
    };
  } catch (err) {
    console.error('[reCAPTCHA Service Exception]:', err.message);
    return {
      success: false,
      error: 'An internal error occurred while validating the reCAPTCHA token.',
      exception: err.message,
    };
  }
}
