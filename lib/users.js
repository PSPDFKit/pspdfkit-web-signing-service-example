const USERS = {
  "user-1-with-rights": { canSign: true },
  "user-1-with-rights-hsm": { canSign: true, useHsm: true },
  "user-2-without-rights": { canSign: false },
};

export const canSign = (userId) => {
  return USERS[userId] && USERS[userId].canSign;
};

export const useHsm = (userId) => {
  return USERS[userId] && USERS[userId].useHsm;
};
