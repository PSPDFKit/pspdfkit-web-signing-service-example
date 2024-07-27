const USERS = {
  "user-1-with-rights": { canSign: true },
  "user-2-without-rights": { canSign: false },
};

export const canSign = (userId) => {
  return USERS[userId] && USERS[userId].canSign;
};
