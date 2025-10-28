const crypto = require('crypto');

const generateApiToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = generateApiToken;

