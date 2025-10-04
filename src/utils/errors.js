class SignatureVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

module.exports = {
  SignatureVerificationError,
};
