export default function useBase64() {
  // public method for encoding
  function encode(inputJSON) {
    return btoa(encodeURIComponent(inputJSON));
  }

  // public method for decoding
  function decode(input) {
    return decodeURIComponent(atob(input));
  }

  return {
    encode,
    decode,
  };
}
