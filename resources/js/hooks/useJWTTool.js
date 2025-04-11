/* eslint-disable no-extend-native */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */

import useBase64 from '@js/hooks/useBase64';

export default function useJWTTool(token) {
  const base64 = useBase64();

  function toSplitted() {
    const output = token.split('.');
    const tokenInfo = output[0];
    const tokenPayload = output[1];

    return {
      tokenInfo,
      tokenPayload,
    };
  }

  function isValid() {
    try {
      const { tokenInfo, tokenPayload } = toSplitted(token);
      const tokenInfoDecoded = JSON.parse(base64.decode(tokenInfo));
      const tokenPayloadDecoded = JSON.parse(base64.decode(tokenPayload));

      if (typeof (tokenInfoDecoded) === 'object'
      && typeof (tokenPayloadDecoded) === 'object') {
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  function isExpired(time = 86400000) {
    if (isValid()) {
      const { tokenPayload } = toSplitted();

      const payload = JSON.parse(base64.decode(tokenPayload));

      const JWTissuedAt = payload.iat * 1000; // <= Convert into int value
      const JWTexpiresAt = JWTissuedAt + time;

      if (JWTexpiresAt < Date.now()) {
        return true;
      }

      return false;
    }

    return false;
  }

  function getScopes() {
    if (isValid()) {
      const { tokenPayload } = toSplitted();

      const payload = JSON.parse(base64.decode(tokenPayload));

      return payload.scopes;
    }

    return false;
  }

  function getSubject() {
    if (isValid()) {
      const { tokenPayload } = toSplitted();

      const payload = JSON.parse(base64.decode(tokenPayload));

      return payload.sub;
    }

    return false;
  }

  function getExpired() {
    if (isValid()) {
      const { tokenPayload } = toSplitted();

      const payload = JSON.parse(base64.decode(tokenPayload));

      return payload.exp;
    }

    return false;
  }

  return {
    isValid,
    isExpired,
    getScopes,
    getSubject,
    getExpired,
  };
}
